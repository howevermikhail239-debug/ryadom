import { randomUUID } from "node:crypto";
import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { trackProductEvent } from "@/lib/analytics/events";
import { requireCurrentUser } from "@/lib/auth/session";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyMatchCreated } from "@/lib/telegram/bot";
import { acceptTask } from "@/server/services/task-workflow";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const keySchema = z.string().uuid();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let analyticsTaskId: string | undefined;
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    analyticsTaskId = taskId;
    const suppliedKey = request.headers.get("idempotency-key");
    const idempotencyKey = suppliedKey ? keySchema.parse(suppliedKey) : randomUUID();

    const match = await acceptTask(taskId, user, idempotencyKey);

    if (match.changed) {
      after(async () => {
        trackProductEvent({ name: "task_accepted", userId: user.id, taskId, properties: { matchId: match.id } });
        trackProductEvent({ name: "fast_match_success", userId: user.id, taskId, properties: { matchId: match.id } });
        await notifyMatchCreated(match.id).catch(() => undefined);
      });
    }
    return NextResponse.json({ ok: true, matchId: match.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MATCH_FAILED";
    const responseByCode: Record<string, { status: number; error: string }> = {
      UNAUTHORIZED: { status: 401, error: "Войдите, чтобы взять задачу." },
      TASK_NOT_FOUND: { status: 404, error: "Задача не найдена." },
      OWN_TASK: { status: 409, error: "Нельзя взять собственную задачу." },
      PERFORMER_REQUIRED: { status: 403, error: "Включите роль исполнителя в профиле." },
      TASK_EXPIRED: { status: 409, error: "Срок задачи уже истёк." },
      TASK_ALREADY_TAKEN: { status: 409, error: "Эту задачу уже взял другой исполнитель." },
      IDEMPOTENCY_CONFLICT: { status: 409, error: "Конфликт повторного запроса." },
      COOLDOWN_ACTIVE: { status: 429, error: "После отказа от задачи поиск временно недоступен." },
      EARLY_ACCESS_RESTRICTED: { status: 409, error: "Пока задача доступна только приглашённому исполнителю." },
      USER_BLOCKED: { status: 403, error: "Взаимодействие с этим пользователем заблокировано." },
      INVALID_ORIGIN: { status: 403, error: "Запрос отклонён." },
      P2034: { status: 409, error: "Кто-то взял задачу одновременно с вами. Обновите страницу." },
      P2002: { status: 409, error: "Эту задачу уже взял другой исполнитель." },
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const response = responseByCode[message] ?? responseByCode[prismaCode] ?? { status: 500, error: "Не удалось взять задачу." };
    const conflictCode = ["TASK_ALREADY_TAKEN", "P2034", "P2002"].includes(message) ? message : prismaCode;
    if (["TASK_ALREADY_TAKEN", "P2034", "P2002"].includes(conflictCode)) {
      after(() => trackProductEvent({ name: "fast_match_conflict", taskId: analyticsTaskId, properties: { code: conflictCode } }));
    }
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status });
  }
}
