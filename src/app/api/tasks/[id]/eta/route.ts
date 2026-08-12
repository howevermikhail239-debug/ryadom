import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { etaExpectedAt } from "@/lib/tasks/eta";
import { sendUserTelegramNotification } from "@/lib/telegram/bot";

const paramsSchema = z.object({ id: z.string().uuid() });
const inputSchema = z.object({ etaMinutes: z.number().int().min(5).max(180) });

export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    if (!user.roles.includes("PERFORMER")) throw new Error("PERFORMER_REQUIRED");
    const { id: taskId } = paramsSchema.parse(await context.params);
    const { etaMinutes } = inputSchema.parse(await request.json());

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ title: string; customerId: string; priceKopecks: number; status: string }>>`
        SELECT title, "customerId", "priceKopecks", status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE
      `;
      const task = rows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      const match = await tx.taskMatch.findFirst({ where: { taskId, performerId: user.id }, orderBy: { createdAt: "desc" } });
      if (!match || match.status !== "IN_PROGRESS" || task.status !== "IN_PROGRESS") throw new Error("ETA_NOT_ALLOWED");

      const bid = await tx.bid.upsert({
        where: { taskId_performerId: { taskId, performerId: user.id } },
        create: { taskId, performerId: user.id, proposedPriceKopecks: task.priceKopecks, etaMinutes, status: "ACCEPTED" },
        update: { etaMinutes },
        select: { id: true, updatedAt: true },
      });
      if (match.bidId !== bid.id) await tx.taskMatch.update({ where: { id: match.id }, data: { bidId: bid.id } });
      return { ...task, bidId: bid.id, updatedAt: bid.updatedAt };
    }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 10_000 });

    const expectedAt = etaExpectedAt(etaMinutes, result.updatedAt);
    await sendUserTelegramNotification({
      userId: result.customerId,
      taskId,
      type: "PERFORMER_ETA_UPDATED",
      title: "Исполнитель сообщил время прибытия",
      body: `По задаче «${result.title}» исполнитель будет примерно через ${etaMinutes} мин.`,
      button: { label: "Открыть задачу", url: `${serverEnv.APP_URL}/tasks/${taskId}` },
      dedupeKey: `bid:${result.bidId}:eta:${result.updatedAt.toISOString()}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true, etaMinutes, expectedAt: expectedAt.toISOString(), updatedAt: result.updatedAt.toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const responses: Record<string, [number, string]> = {
      UNAUTHORIZED: [401, "Войдите в аккаунт."],
      PERFORMER_REQUIRED: [403, "ETA может указать только исполнитель."],
      TASK_NOT_FOUND: [404, "Задача не найдена."],
      ETA_NOT_ALLOWED: [409, "ETA можно изменить только у текущей задачи в работе."],
      INVALID_ORIGIN: [403, "Запрос отклонён."],
      P2034: [409, "Задача только что изменилась. Повторите запрос."],
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const [status, message] = error instanceof z.ZodError ? [400, "Укажите время от 5 до 180 минут."] : responses[code] ?? responses[prismaCode] ?? [500, "Не удалось сохранить ETA."];
    return NextResponse.json({ error: message }, { status });
  }
}
