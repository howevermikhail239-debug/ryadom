import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { sendUserTelegramNotification } from "@/lib/telegram/bot";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const result = await prisma.$transaction(async (tx) => {
      const taskRows = await tx.$queryRaw<Array<{ id: string; customerId: string; title: string; status: string }>>`
        SELECT id, "customerId", title, status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE`;
      const task = taskRows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.customerId !== user.id && !user.roles.includes("ADMIN")) throw new Error("NOT_TASK_CUSTOMER");
      const match = await tx.taskMatch.findFirst({ where: { taskId, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
      if (!match || task.status !== "IN_PROGRESS") throw new Error("TASK_CANNOT_REQUEST_CHANGES");
      await tx.taskMatch.update({ where: { id: match.id }, data: { status: "IN_PROGRESS", completedAt: null, confirmedAt: null } });
      const updated = await tx.task.update({ where: { id: taskId }, data: { version: { increment: 1 } }, select: { version: true } });
      return { performerId: match.performerId, title: task.title, matchId: match.id, version: updated.version };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10_000 });
    await sendUserTelegramNotification({
      userId: result.performerId, taskId, type: "TASK_CHANGES_REQUESTED", title: "Нужна доработка",
      body: `Заказчик попросил доработать «${result.title}».`, button: { label: "Открыть задачу", url: `${serverEnv.APP_URL}/tasks/${taskId}` }, dedupeKey: `match:${result.matchId}:changes-requested:${result.version}`,
    }).catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "REQUEST_CHANGES_FAILED";
    const responses: Record<string, [number, string]> = {
      UNAUTHORIZED: [401, "Войдите, чтобы запросить доработку."], TASK_NOT_FOUND: [404, "Задача не найдена."], NOT_TASK_CUSTOMER: [403, "Запросить доработку может только заказчик."], TASK_CANNOT_REQUEST_CHANGES: [409, "Доработку можно запросить только после сдачи работы."], INVALID_ORIGIN: [403, "Запрос отклонён."], P2034: [409, "Задача только что изменилась. Обновите страницу."],
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const [status, message] = responses[code] ?? responses[prismaCode] ?? [500, "Не удалось запросить доработку."];
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
