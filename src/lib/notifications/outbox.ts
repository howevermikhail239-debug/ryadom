import "server-only";

import type { Prisma } from "@/generated/prisma/client";

export async function enqueueNotification(
  tx: Prisma.TransactionClient,
  input: {
    userId: string;
    taskId?: string;
    type: string;
    title: string;
    body: string;
    dedupeKey: string;
    button?: { label: string; url: string };
    telegramEnabled: boolean;
  },
) {
  return tx.notification.upsert({
    where: { dedupeKey: input.dedupeKey },
    create: {
      userId: input.userId,
      taskId: input.taskId,
      channel: input.telegramEnabled ? "TELEGRAM" : "IN_APP",
      status: input.telegramEnabled ? "PENDING" : "DELIVERED",
      type: input.type,
      title: input.title,
      body: input.body,
      payload: input.button ? { button: input.button } : undefined,
      dedupeKey: input.dedupeKey,
      sentAt: input.telegramEnabled ? null : new Date(),
    },
    update: {},
  });
}
