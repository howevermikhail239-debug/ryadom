import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyNearbyPerformers, sendUserTelegramNotification } from "@/lib/telegram/bot";
import { serverEnv } from "@/config/server-env";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const result = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;
      const tasks = await tx.$queryRaw<Array<{ id: string; title: string; customerId: string; status: string; expiresAt: Date }>>`
        SELECT id, title, "customerId", status, "expiresAt" FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE
      `;
      const task = tasks[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      const match = await tx.taskMatch.findFirst({ where: { taskId, performerId: user.id, status: "IN_PROGRESS" }, orderBy: { createdAt: "desc" } });
      if (!match) throw new Error("NOT_ACTIVE_PERFORMER");
      if (task.status !== "IN_PROGRESS") throw new Error("TASK_CANNOT_WITHDRAW");
      const now = new Date();
      const cooldownUntil = new Date(now.getTime() + 30 * 60_000);
      await tx.user.update({ where: { id: user.id }, data: { cooldownUntil } });
      await tx.taskMatch.update({ where: { id: match.id }, data: { status: "CANCELLED", cancelledAt: now } });
      if (match.bidId) await tx.bid.update({ where: { id: match.bidId }, data: { status: "WITHDRAWN" } });
      await tx.task.update({ where: { id: taskId }, data: { status: "PUBLISHED", assignedAt: null, expiresAt: task.expiresAt > now ? task.expiresAt : new Date(now.getTime() + 60 * 60_000), version: { increment: 1 } } });
      return { customerId: task.customerId, title: task.title, cooldownUntil };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10_000 });
    await Promise.allSettled([
      sendUserTelegramNotification({ userId: result.customerId, taskId, type: "PERFORMER_WITHDREW", title: "Исполнитель отказался", body: `Задача «${result.title}» снова опубликована. Мы ищем нового исполнителя.`, button: { label: "Открыть задачу", url: `${serverEnv.APP_URL}/tasks/${taskId}` }, dedupeKey: `task:${taskId}:withdraw:${result.cooldownUntil.toISOString()}` }),
      notifyNearbyPerformers(taskId),
    ]);
    return NextResponse.json({ ok: true, cooldownUntil: result.cooldownUntil.toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WITHDRAW_FAILED";
    const responses: Record<string, [number, string]> = { UNAUTHORIZED: [401, "Войдите в аккаунт."], TASK_NOT_FOUND: [404, "Задача не найдена."], NOT_ACTIVE_PERFORMER: [403, "Вы не являетесь исполнителем этой задачи."], TASK_CANNOT_WITHDRAW: [409, "От этой задачи сейчас нельзя отказаться."], INVALID_ORIGIN: [403, "Запрос отклонён."], P2034: [409, "Задача только что изменилась. Обновите страницу."] };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const [status, message] = responses[code] ?? responses[prismaCode] ?? [500, "Не удалось отказаться от задачи."];
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
