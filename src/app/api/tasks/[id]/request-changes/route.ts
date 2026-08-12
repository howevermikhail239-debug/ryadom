import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";
import { requireCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/security";
import { sendUserTelegramNotification } from "@/lib/telegram/bot";
import { requestTaskChanges } from "@/server/services/task-workflow";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const result = await requestTaskChanges(taskId, user);
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
