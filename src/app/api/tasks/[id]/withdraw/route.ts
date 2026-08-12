import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/security";
import { sendUserTelegramNotification } from "@/lib/telegram/bot";
import { serverEnv } from "@/config/server-env";
import { withdrawFromTask } from "@/server/services/task-workflow";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const result = await withdrawFromTask(taskId, user);
    await sendUserTelegramNotification({ userId: result.customerId, taskId, type: "PERFORMER_WITHDREW", title: "Исполнитель отказался", body: `Задача «${result.title}» снова опубликована. Мы ищем нового исполнителя.`, button: { label: "Открыть задачу", url: `${serverEnv.APP_URL}/tasks/${taskId}` }, dedupeKey: `task:${taskId}:withdraw:${result.cooldownUntil.toISOString()}` });
    return NextResponse.json({ ok: true, cooldownUntil: result.cooldownUntil.toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "WITHDRAW_FAILED";
    const responses: Record<string, [number, string]> = { UNAUTHORIZED: [401, "Войдите в аккаунт."], TASK_NOT_FOUND: [404, "Задача не найдена."], NOT_ACTIVE_PERFORMER: [403, "Вы не являетесь исполнителем этой задачи."], TASK_CANNOT_WITHDRAW: [409, "От этой задачи сейчас нельзя отказаться."], INVALID_ORIGIN: [403, "Запрос отклонён."], P2034: [409, "Задача только что изменилась. Обновите страницу."] };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const [status, message] = responses[code] ?? responses[prismaCode] ?? [500, "Не удалось отказаться от задачи."];
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
