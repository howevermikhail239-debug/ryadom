import { NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { getMediaStorage } from "@/lib/media/storage";
import { requireTaskConversation } from "@/server/services/task-chat";

export const runtime = "nodejs";
const paramsSchema = z.object({ id: z.string().uuid(), messageId: z.string().uuid() });

export async function GET(_request: Request, context: { params: Promise<{ id: string; messageId: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id: taskId, messageId } = paramsSchema.parse(await context.params);
    await requireTaskConversation(taskId, user.id);
    const message = await prisma.message.findFirst({ where: { id: messageId, taskId }, select: { imageUrl: true } });
    if (!message?.imageUrl?.startsWith("s3:")) return NextResponse.json({ error: "Изображение не найдено." }, { status: 404 });
    const url = await getMediaStorage().createReadUrl(message.imageUrl);
    return NextResponse.redirect(url, { status: 307, headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    const code = error instanceof Error ? error.message : "MEDIA_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "CHAT_FORBIDDEN" || code === "USER_BLOCKED" ? 403 : 404;
    return NextResponse.json({ error: status === 403 ? "Нет доступа к изображению." : "Изображение не найдено." }, { status });
  }
}
