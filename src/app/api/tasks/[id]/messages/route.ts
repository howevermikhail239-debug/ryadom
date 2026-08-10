import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyTaskMessage } from "@/lib/telegram/bot";

const paramsSchema = z.object({ id: z.string().uuid() });
const imageSchema = z.string().max(900_000).regex(/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/);
const bodySchema = z.object({
  text: z.string().trim().max(1000).optional().transform((value) => value || null),
  imageUrl: imageSchema.nullable().optional(),
}).refine((value) => Boolean(value.text || value.imageUrl), "EMPTY_MESSAGE");

async function getConversation(taskId: string, userId: string) {
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      customerId: true,
      matches: { where: { status: { in: ["CREATED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { performerId: true } },
    },
  });
  if (!task) throw new Error("TASK_NOT_FOUND");
  const performerId = task.matches[0]?.performerId;
  if (userId !== task.customerId && userId !== performerId) throw new Error("CHAT_FORBIDDEN");
  return task;
}

export async function GET(_request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    await getConversation(taskId, user.id);
    const messages = await prisma.message.findMany({
      where: { taskId },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: { sender: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    return NextResponse.json({ messages: messages.reverse().map((message) => ({ id: message.id, text: message.text, imageUrl: message.imageUrl, createdAt: message.createdAt.toISOString(), isMine: message.senderId === user.id, senderId: message.sender.id, senderName: message.sender.displayName, senderAvatarUrl: message.sender.avatarUrl })) });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHAT_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "TASK_NOT_FOUND" ? 404 : code === "CHAT_FORBIDDEN" ? 403 : 400;
    return NextResponse.json({ error: status === 403 ? "Чат доступен только участникам задачи." : "Не удалось загрузить чат." }, { status });
  }
}

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const input = bodySchema.parse(await request.json());
    await getConversation(taskId, user.id);
    if (input.imageUrl) {
      const imageCount = await prisma.message.count({ where: { taskId, senderId: user.id, imageUrl: { not: null } } });
      if (imageCount >= 10) throw new Error("IMAGE_LIMIT");
    }
    const message = await prisma.message.create({ data: { taskId, senderId: user.id, text: input.text, imageUrl: input.imageUrl ?? null }, select: { id: true } });
    after(() => notifyTaskMessage(message.id).catch(() => undefined));
    return NextResponse.json({ ok: true, messageId: message.id }, { status: 201 });
  } catch (error) {
    const code = error instanceof Error ? error.message : "CHAT_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "TASK_NOT_FOUND" ? 404 : code === "CHAT_FORBIDDEN" ? 403 : code === "INVALID_ORIGIN" ? 403 : 400;
    return NextResponse.json({ ok: false, error: code === "CHAT_FORBIDDEN" ? "Чат доступен только участникам задачи." : code === "IMAGE_LIMIT" ? "Для одной задачи можно отправить до 10 изображений." : "Проверьте сообщение или изображение." }, { status });
  }
}
