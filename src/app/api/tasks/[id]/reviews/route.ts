import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { rublesToKopecks } from "@/lib/money";

const paramsSchema = z.object({ id: z.string().uuid() });
const bodySchema = z.object({
  reaction: z.enum(["GREAT", "OK", "BAD"]),
  tags: z.array(z.enum(["FAST", "POLITE", "ON_TIME", "QUALITY"])).max(4).default([]).transform((tags) => [...new Set(tags)]),
  comment: z.string().trim().max(1000).optional().transform((value) => value || null),
  tipRubles: z.string().trim().max(8).default("0"),
});

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const input = bodySchema.parse(await request.json());
    const tipKopecks = input.tipRubles === "" || /^0+(?:[.,]0{1,2})?$/.test(input.tipRubles) ? 0 : rublesToKopecks(input.tipRubles);
    if (tipKopecks > 1_000_000) throw new Error("TIP_TOO_LARGE");
    await prisma.$transaction(async (tx) => {
      const tasks = await tx.$queryRaw<Array<{ id: string; customerId: string; status: string }>>`SELECT id, "customerId", status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
      const task = tasks[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.status !== "COMPLETED") throw new Error("TASK_NOT_COMPLETED");
      const match = await tx.taskMatch.findFirst({ where: { taskId, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
      if (!match) throw new Error("MATCH_NOT_FOUND");
      if (user.id !== task.customerId && user.id !== match.performerId) throw new Error("NOT_PARTICIPANT");
      if (tipKopecks > 0 && user.id !== task.customerId) throw new Error("TIPS_CUSTOMER_ONLY");
      const recipientId = user.id === task.customerId ? match.performerId : task.customerId;
      const rating = input.reaction === "GREAT" ? 5 : input.reaction === "OK" ? 3 : 1;
      await tx.review.create({ data: { matchId: match.id, authorId: user.id, recipientId, rating, reaction: input.reaction, tags: input.tags, comment: input.comment } });
      const aggregate = await tx.review.aggregate({ where: { recipientId }, _avg: { rating: true }, _count: { rating: true } });
      await tx.user.update({ where: { id: recipientId }, data: { ratingAverage: aggregate._avg.rating ?? 0, ratingCount: aggregate._count.rating } });
      if (tipKopecks > 0) await tx.task.update({ where: { id: taskId }, data: { tipAmount: { increment: tipKopecks } } });
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10_000 });
    return NextResponse.json({ ok: true, tipKopecks });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REVIEW_FAILED";
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const responses: Record<string, [number, string]> = { UNAUTHORIZED: [401, "Войдите, чтобы оставить отзыв."], TASK_NOT_FOUND: [404, "Задача не найдена."], TASK_NOT_COMPLETED: [409, "Отзыв можно оставить после подтверждения выполнения."], MATCH_NOT_FOUND: [409, "Не найден исполнитель задачи."], NOT_PARTICIPANT: [403, "Отзыв может оставить только участник задачи."], TIPS_CUSTOMER_ONLY: [403, "Чаевые может оставить только заказчик."], TIP_TOO_LARGE: [400, "Максимальная сумма чаевых — 10 000 ₽."], P2002: [409, "Вы уже оставили отзыв по этой задаче."], P2034: [409, "Данные только что изменились. Обновите страницу."], INVALID_ORIGIN: [403, "Запрос отклонён."] };
    const [status, message] = error instanceof z.ZodError ? [400, "Проверьте оценку и текст отзыва."] : responses[code] ?? responses[prismaCode] ?? [500, "Не удалось сохранить отзыв."];
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
