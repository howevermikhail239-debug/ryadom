import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { trackProductEvent } from "@/lib/analytics/events";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { getMediaStorage } from "@/lib/media/storage";
import { MAX_IMAGE_BYTES, validateImageUpload } from "@/lib/media/validation";
import { notifyTaskMessage } from "@/lib/telegram/bot";
import { requireTaskConversation } from "@/server/services/task-chat";

export const runtime = "nodejs";
const paramsSchema = z.object({ id: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  let locator: string | null = null;
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    await requireTaskConversation(taskId, user.id);
    const contentLength = Number(request.headers.get("content-length") ?? 0);
    if (Number.isFinite(contentLength) && contentLength > MAX_IMAGE_BYTES + 100_000) throw new Error("INVALID_IMAGE_SIZE");
    const imageCount = await prisma.message.count({ where: { taskId, senderId: user.id, imageUrl: { not: null } } });
    if (imageCount >= 10) throw new Error("IMAGE_LIMIT");

    const form = await request.formData();
    const file = form.get("image");
    const text = String(form.get("text") ?? "").trim().slice(0, 1000) || null;
    if (!(file instanceof File)) throw new Error("IMAGE_REQUIRED");
    const image = await validateImageUpload(file);
    const storage = getMediaStorage();
    locator = await storage.putImage({ taskId, image });
    let message;
    try {
      message = await prisma.message.create({ data: { taskId, senderId: user.id, text, imageUrl: locator }, select: { id: true } });
    } catch (error) {
      await storage.delete(locator).catch(() => undefined);
      throw error;
    }
    after(async () => {
      trackProductEvent({ name: "message_sent", userId: user.id, taskId, properties: { hasImage: true, storage: locator?.startsWith("s3:") ? "s3" : "legacy" } });
      await notifyTaskMessage(message.id).catch(() => undefined);
    });
    return NextResponse.json({ ok: true, messageId: message.id }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UPLOAD_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "CHAT_FORBIDDEN" || code === "USER_BLOCKED" || code === "INVALID_ORIGIN" ? 403 : code === "TASK_NOT_FOUND" ? 404 : 400;
    const message = code === "USER_BLOCKED" ? "Загрузка недоступна из-за блокировки пользователя." : code === "INVALID_IMAGE_SIZE" ? "Размер изображения должен быть от 1 байта до 5 МБ." : code === "INVALID_IMAGE_TYPE" ? "Разрешены только настоящие JPEG, PNG и WebP-файлы." : code === "LOCAL_MEDIA_LIMIT" ? "Без Object Storage локальная загрузка ограничена 600 КБ." : code === "IMAGE_LIMIT" ? "Для одной задачи можно отправить до 10 изображений." : "Не удалось загрузить изображение.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
