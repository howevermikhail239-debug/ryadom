import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyTaskStatusChanged } from "@/lib/telegram/bot";
import { markTaskCompleted } from "@/server/services/task-workflow";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);

    const result = await markTaskCompleted(taskId, user);

    if (result.changed) after(async () => {
      trackProductEvent({ name: "completion_submitted", userId: user.id, taskId });
      await notifyTaskStatusChanged(taskId, "исполнитель отметил выполнение — ожидается ваше подтверждение").catch(() => undefined);
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPLETE_FAILED";
    const responses: Record<string, { status: number; error: string }> = {
      UNAUTHORIZED: { status: 401, error: "Войдите, чтобы отметить выполнение." },
      TASK_NOT_FOUND: { status: 404, error: "Задача не найдена." },
      PERFORMER_REQUIRED: { status: 403, error: "Отметить выполнение может только исполнитель." },
      NOT_ASSIGNED_PERFORMER: { status: 403, error: "Вы не назначены исполнителем этой задачи." },
      TASK_CANNOT_COMPLETE: { status: 409, error: "Эту задачу сейчас нельзя отметить выполненной." },
      PROOF_REQUIRED: { status: 409, error: "Сначала отправьте фото выполненной работы в чат." },
      INVALID_ORIGIN: { status: 403, error: "Запрос отклонён." },
      P2034: { status: 409, error: "Задача только что изменилась. Обновите страницу." },
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const response = responses[message] ?? responses[prismaCode] ?? { status: 500, error: "Не удалось отметить выполнение." };
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status });
  }
}
import { trackProductEvent } from "@/lib/analytics/events";
