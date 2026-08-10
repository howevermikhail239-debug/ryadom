import "server-only";

import type { VerifiedTelegramUser } from "@/lib/auth/telegram";
import { prisma } from "@/lib/db/prisma";

export async function upsertTelegramUser(telegramUser: VerifiedTelegramUser) {
  const displayName = [telegramUser.firstName, telegramUser.lastName].filter(Boolean).join(" ");
  return prisma.user.upsert({
    where: { telegramId: telegramUser.id },
    create: {
      telegramId: telegramUser.id,
      telegramChatId: telegramUser.canMessage ? telegramUser.id : null,
      telegramUsername: telegramUser.username,
      telegramVerifiedAt: new Date(),
      displayName,
      avatarUrl: telegramUser.photoUrl,
      roles: ["CUSTOMER", "PERFORMER"],
      status: "ACTIVE",
      lastSeenAt: new Date(),
    },
    update: {
      telegramChatId: telegramUser.canMessage ? telegramUser.id : undefined,
      telegramUsername: telegramUser.username,
      telegramVerifiedAt: new Date(),
      displayName,
      avatarUrl: telegramUser.photoUrl,
      status: "ACTIVE",
      lastSeenAt: new Date(),
    },
  });
}
