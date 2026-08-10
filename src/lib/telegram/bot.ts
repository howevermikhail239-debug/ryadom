import "server-only";

import { prisma } from "@/lib/db/prisma";
import { formatRubles } from "@/lib/utils";
import { serverEnv } from "@/config/server-env";

type TelegramResponse = { ok: boolean; description?: string };

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export async function sendTelegramMessage({
  chatId,
  text,
  button,
}: {
  chatId: bigint;
  text: string;
  button?: { label: string; url: string };
}): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${serverEnv.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: button
          ? { inline_keyboard: [[{ text: button.label, url: button.url }]] }
          : undefined,
      }),
      signal: AbortSignal.timeout(7000),
    },
  );

  const result = (await response.json()) as TelegramResponse;
  if (!response.ok || !result.ok) {
    throw new Error(result.description ?? `Telegram Bot API вернул ${response.status}`);
  }
}

export async function sendUserTelegramNotification({
  userId,
  taskId,
  type,
  title,
  body,
  button,
  dedupeKey,
}: {
  userId: string;
  taskId?: string;
  type: string;
  title: string;
  body: string;
  button?: { label: string; url: string };
  dedupeKey: string;
}): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { telegramChatId: true },
  });
  if (!user?.telegramChatId) return;

  const notification = await prisma.notification.upsert({
    where: { dedupeKey },
    create: {
      userId,
      taskId,
      channel: "TELEGRAM",
      type,
      title,
      body,
      dedupeKey,
      status: "PENDING",
    },
    update: {},
  });

  if (notification.status === "SENT" || notification.status === "DELIVERED") return;

  try {
    await sendTelegramMessage({
      chatId: user.telegramChatId,
      text: `<b>${escapeHtml(title)}</b>\n\n${escapeHtml(body)}`,
      button,
    });
    await prisma.notification.update({
      where: { id: notification.id },
      data: { status: "SENT", sentAt: new Date(), attempts: { increment: 1 }, error: null },
    });
  } catch (error) {
    await prisma.notification.update({
      where: { id: notification.id },
      data: {
        status: "FAILED",
        attempts: { increment: 1 },
        nextAttemptAt: new Date(Date.now() + 60_000),
        error: error instanceof Error ? error.message.slice(0, 2000) : "Telegram delivery failed",
      },
    });
  }
}

export async function notifyMatchCreated(matchId: string): Promise<void> {
  const match = await prisma.taskMatch.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      task: { select: { id: true, title: true, addressLabel: true } },
      customer: { select: { displayName: true } },
      performer: { select: { displayName: true } },
    },
  });
  const taskUrl = `${serverEnv.APP_URL}/tasks/${match.task.id}`;

  await Promise.allSettled([
    sendUserTelegramNotification({
      userId: match.customerId,
      taskId: match.taskId,
      type: "MATCH_CREATED_CUSTOMER",
      title: "Исполнитель уже найден",
      body: `${match.performer.displayName} взял задачу «${match.task.title}» за ${formatRubles(match.agreedPriceKopecks)}.`,
      button: { label: "Открыть задачу", url: taskUrl },
      dedupeKey: `match:${match.id}:customer`,
    }),
    sendUserTelegramNotification({
      userId: match.performerId,
      taskId: match.taskId,
      type: "MATCH_CREATED_PERFORMER",
      title: "Задача ваша",
      body: `Вы взяли «${match.task.title}». ${match.task.addressLabel ?? "Адрес указан в карточке задачи."}`,
      button: { label: "Открыть задачу", url: taskUrl },
      dedupeKey: `match:${match.id}:performer`,
    }),
  ]);
}

export async function notifyNearbyPerformers(taskId: string): Promise<void> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    select: { id: true, title: true, priceKopecks: true, searchRadiusMeters: true },
  });
  const recipients = await prisma.$queryRaw<Array<{ userId: string }>>`
    SELECT ul."userId"
    FROM user_locations ul
    JOIN users u ON u.id = ul."userId"
    JOIN tasks t ON t.id = ${taskId}::uuid
    WHERE ul.location IS NOT NULL
      AND ul."expiresAt" > NOW()
      AND u.status = 'ACTIVE'::"UserStatus"
      AND 'PERFORMER'::"UserRole" = ANY(u.roles)
      AND (u."cooldownUntil" IS NULL OR u."cooldownUntil" <= NOW())
      AND u."telegramChatId" IS NOT NULL
      AND u.id <> t."customerId"
      AND ST_DWithin(ul.location, t.location, t."searchRadiusMeters")
    ORDER BY ST_Distance(ul.location, t.location)
    LIMIT 100
  `;

  await Promise.allSettled(
    recipients.map(({ userId }) =>
      sendUserTelegramNotification({
        userId,
        taskId,
        type: "TASK_NEARBY",
        title: "Новая задача рядом",
        body: `«${task.title}» — ${formatRubles(task.priceKopecks)}. Можно взять без переписки.`,
        button: { label: "Посмотреть", url: `${serverEnv.APP_URL}/tasks/${task.id}` },
        dedupeKey: `task:${task.id}:nearby:${userId}`,
      }),
    ),
  );
}

export async function notifyTaskStatusChanged(taskId: string, statusLabel: string): Promise<void> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      matches: {
        where: { status: { in: ["CREATED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } },
        orderBy: { createdAt: "desc" },
        take: 1,
      },
    },
  });
  const match = task.matches[0];
  const recipients = new Set([task.customerId, match?.performerId].filter((id): id is string => Boolean(id)));

  await Promise.allSettled(
    [...recipients].map((userId) =>
      sendUserTelegramNotification({
        userId,
        taskId,
        type: "TASK_STATUS_CHANGED",
        title: "Статус задачи изменился",
        body: `«${task.title}»: ${statusLabel}.`,
        button: { label: "Открыть", url: `${serverEnv.APP_URL}/tasks/${task.id}` },
        dedupeKey: `task:${task.id}:status:${task.version}:${userId}`,
      }),
    ),
  );
}

export async function notifyTaskMessage(messageId: string): Promise<void> {
  const message = await prisma.message.findUniqueOrThrow({
    where: { id: messageId },
    include: {
      sender: { select: { displayName: true } },
      task: {
        select: {
          id: true,
          title: true,
          customerId: true,
          matches: { where: { status: { in: ["CREATED", "CONFIRMED", "IN_PROGRESS", "COMPLETED"] } }, orderBy: { createdAt: "desc" }, take: 1, select: { performerId: true } },
        },
      },
    },
  });
  const performerId = message.task.matches[0]?.performerId;
  const recipientId = message.senderId === message.task.customerId ? performerId : message.task.customerId;
  if (!recipientId) return;
  const preview = message.text?.trim() || (message.imageUrl ? "Фото по задаче" : "Новое сообщение");
  await sendUserTelegramNotification({
    userId: recipientId,
    taskId: message.taskId,
    type: "TASK_CHAT_MESSAGE",
    title: `${message.sender.displayName}: новое сообщение`,
    body: `«${message.task.title}»: ${preview.slice(0, 300)}`,
    button: { label: "Открыть чат", url: `${serverEnv.APP_URL}/tasks/${message.task.id}#chat` },
    dedupeKey: `message:${message.id}:${recipientId}`,
  });
}
