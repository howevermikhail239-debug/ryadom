import "server-only";

import { serverEnv } from "@/config/server-env";
import { trackProductEvent } from "@/lib/analytics/events";
import { prisma } from "@/lib/db/prisma";
import { MAX_NOTIFICATION_DELIVERY_ATTEMPTS, notificationRetryDecision } from "@/lib/notifications/retry-policy";
import { VISIBLE_MATCH_STATUSES } from "@/lib/tasks/policy";
import { formatRubles } from "@/lib/utils";
import { usersAreBlocked } from "@/server/services/user-blocks";

const PROCESSING_LEASE_MS = 5 * 60_000;

type TelegramResponse = {
  ok: boolean;
  error_code?: number;
  description?: string;
  parameters?: { retry_after?: number };
};

type NotificationButton = { label: string; url: string };
type NotificationPayload = { button?: NotificationButton };

async function taskNotificationIsBlocked(userId: string, taskId?: string) {
  if (!taskId) return false;
  const task = await prisma.task.findUnique({
    where: { id: taskId },
    select: {
      customerId: true,
      matches: { where: { status: { in: [...VISIBLE_MATCH_STATUSES] } }, orderBy: { createdAt: "desc" }, take: 1, select: { performerId: true } },
    },
  });
  if (!task) return false;
  const performerId = task.matches[0]?.performerId;
  const counterpartyId = userId === task.customerId ? performerId : task.customerId;
  return counterpartyId ? usersAreBlocked(prisma, userId, counterpartyId) : false;
}

class TelegramDeliveryError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
    readonly retryAfterSeconds?: number,
  ) {
    super(message);
  }
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function payloadButton(payload: unknown): NotificationButton | undefined {
  if (!payload || typeof payload !== "object" || !("button" in payload)) return undefined;
  const button = (payload as NotificationPayload).button;
  if (!button || typeof button.label !== "string" || typeof button.url !== "string") return undefined;
  try {
    const url = new URL(button.url);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1"].includes(url.hostname))) {
      return undefined;
    }
    return { label: button.label.slice(0, 64), url: url.toString() };
  } catch {
    return undefined;
  }
}

export async function sendTelegramMessage({
  chatId,
  text,
  button,
}: {
  chatId: bigint;
  text: string;
  button?: NotificationButton;
}): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`https://api.telegram.org/bot${serverEnv.TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId.toString(),
        text,
        parse_mode: "HTML",
        disable_web_page_preview: true,
        reply_markup: button ? { inline_keyboard: [[{ text: button.label, url: button.url }]] } : undefined,
      }),
      signal: AbortSignal.timeout(7_000),
    });
  } catch (error) {
    throw new TelegramDeliveryError(error instanceof Error ? error.message : "Telegram network error", true);
  }

  let result: TelegramResponse;
  try {
    result = (await response.json()) as TelegramResponse;
  } catch {
    throw new TelegramDeliveryError(`Telegram Bot API вернул ${response.status}`, response.status >= 500);
  }
  if (response.ok && result.ok) return;

  const code = result.error_code ?? response.status;
  const retryable = code === 429 || code >= 500;
  throw new TelegramDeliveryError(
    result.description ?? `Telegram Bot API вернул ${code}`,
    retryable,
    result.parameters?.retry_after,
  );
}

async function claimNotification(id: string): Promise<boolean> {
  const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
  const claimed = await prisma.notification.updateMany({
    where: {
      id,
      channel: "TELEGRAM",
      status: { in: ["PENDING", "FAILED"] },
      attempts: { lt: MAX_NOTIFICATION_DELIVERY_ATTEMPTS },
      OR: [{ nextAttemptAt: null }, { nextAttemptAt: { lte: new Date() } }],
      AND: [{ OR: [{ processingAt: null }, { processingAt: { lt: staleBefore } }] }],
    },
    data: { processingAt: new Date() },
  });
  return claimed.count === 1;
}

async function deliverClaimedNotification(id: string): Promise<void> {
  const notification = await prisma.notification.findUnique({
    where: { id },
    include: { user: { select: { telegramChatId: true } } },
  });
  if (!notification || !notification.processingAt) return;

  if (await taskNotificationIsBlocked(notification.userId, notification.taskId ?? undefined)) {
    await prisma.notification.update({
      where: { id },
      data: { status: "FAILED", attempts: MAX_NOTIFICATION_DELIVERY_ATTEMPTS, processingAt: null, nextAttemptAt: null, error: "BLOCKED_RELATIONSHIP" },
    });
    return;
  }

  if (!notification.user.telegramChatId) {
    await prisma.notification.update({
      where: { id },
      data: { channel: "IN_APP", status: "DELIVERED", sentAt: new Date(), processingAt: null, nextAttemptAt: null, error: null },
    });
    trackProductEvent({ name: "notification_sent", userId: notification.userId, taskId: notification.taskId, properties: { type: notification.type, channel: "in_app" } });
    return;
  }

  const attempts = notification.attempts + 1;
  try {
    await sendTelegramMessage({
      chatId: notification.user.telegramChatId,
      text: `<b>${escapeHtml(notification.title)}</b>\n\n${escapeHtml(notification.body)}`,
      button: payloadButton(notification.payload),
    });
    await prisma.notification.update({
      where: { id },
      data: { status: "SENT", sentAt: new Date(), attempts, nextAttemptAt: null, processingAt: null, error: null },
    });
    trackProductEvent({ name: "notification_sent", userId: notification.userId, taskId: notification.taskId, properties: { type: notification.type, channel: "telegram" } });
  } catch (error) {
    const deliveryError = error instanceof TelegramDeliveryError
      ? error
      : new TelegramDeliveryError(error instanceof Error ? error.message : "Telegram delivery failed", true);
    const decision = notificationRetryDecision({ attempt: attempts, retryable: deliveryError.retryable, retryAfterSeconds: deliveryError.retryAfterSeconds });
    await prisma.notification.update({
      where: { id },
      data: {
        status: "FAILED",
        attempts: decision.terminal ? MAX_NOTIFICATION_DELIVERY_ATTEMPTS : attempts,
        nextAttemptAt: decision.nextAttemptAt,
        processingAt: null,
        error: deliveryError.message.slice(0, 2_000),
      },
    });
  }
}

export async function processPendingTelegramNotifications(limit = 10): Promise<{ claimed: number }> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  const staleBefore = new Date(Date.now() - PROCESSING_LEASE_MS);
  const claimed = await prisma.$queryRaw<Array<{ id: string }>>`
    WITH candidates AS (
      SELECT id
      FROM notifications
      WHERE channel = 'TELEGRAM'::"NotificationChannel"
        AND status IN ('PENDING'::"NotificationStatus", 'FAILED'::"NotificationStatus")
        AND attempts < ${MAX_NOTIFICATION_DELIVERY_ATTEMPTS}
        AND ("nextAttemptAt" IS NULL OR "nextAttemptAt" <= NOW())
        AND ("processingAt" IS NULL OR "processingAt" < ${staleBefore})
      ORDER BY COALESCE("nextAttemptAt", "createdAt"), "createdAt"
      FOR UPDATE SKIP LOCKED
      LIMIT ${safeLimit}
    )
    UPDATE notifications AS notification
    SET "processingAt" = NOW(), "updatedAt" = NOW()
    FROM candidates
    WHERE notification.id = candidates.id
    RETURNING notification.id
  `;

  await Promise.allSettled(claimed.map(({ id }) => deliverClaimedNotification(id)));
  return { claimed: claimed.length };
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
  button?: NotificationButton;
  dedupeKey: string;
}): Promise<void> {
  if (await taskNotificationIsBlocked(userId, taskId)) return;
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { telegramChatId: true } });
  if (!user) return;

  const telegramEnabled = Boolean(user.telegramChatId);
  const notification = await prisma.notification.upsert({
    where: { dedupeKey },
    create: {
      userId,
      taskId,
      channel: telegramEnabled ? "TELEGRAM" : "IN_APP",
      type,
      title,
      body,
      payload: button ? { button } : undefined,
      dedupeKey,
      status: telegramEnabled ? "PENDING" : "DELIVERED",
      sentAt: telegramEnabled ? null : new Date(),
    },
    update: {},
  });

  if (notification.channel !== "TELEGRAM" || notification.status === "SENT" || notification.status === "DELIVERED") return;
  if (await claimNotification(notification.id)) await deliverClaimedNotification(notification.id);
}

export async function notifyMatchCreated(matchId: string): Promise<void> {
  const match = await prisma.taskMatch.findUniqueOrThrow({
    where: { id: matchId },
    include: {
      task: { select: { id: true, title: true, addressLabel: true } },
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

export async function notifyTaskStatusChanged(taskId: string, statusLabel: string): Promise<void> {
  const task = await prisma.task.findUniqueOrThrow({
    where: { id: taskId },
    include: {
      matches: { where: { status: { in: [...VISIBLE_MATCH_STATUSES] } }, orderBy: { createdAt: "desc" }, take: 1 },
    },
  });
  const match = task.matches[0];
  const recipients = new Set([task.customerId, match?.performerId].filter((id): id is string => Boolean(id)));
  await Promise.allSettled([...recipients].map((userId) => sendUserTelegramNotification({
    userId,
    taskId,
    type: "TASK_STATUS_CHANGED",
    title: "Статус задачи изменился",
    body: `«${task.title}»: ${statusLabel}.`,
    button: { label: "Открыть", url: `${serverEnv.APP_URL}/tasks/${task.id}` },
    dedupeKey: `task:${task.id}:status:${task.version}:${userId}`,
  })));
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
          matches: { where: { status: { in: [...VISIBLE_MATCH_STATUSES] } }, orderBy: { createdAt: "desc" }, take: 1, select: { performerId: true } },
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
