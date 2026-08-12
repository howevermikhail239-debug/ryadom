import "server-only";

import type { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/db/prisma";

type DbClient = Prisma.TransactionClient | typeof prisma;

export async function usersAreBlocked(db: DbClient, firstUserId: string, secondUserId: string) {
  if (firstUserId === secondUserId) return false;
  return (await db.userBlock.count({
    where: {
      OR: [
        { blockerId: firstUserId, blockedId: secondUserId },
        { blockerId: secondUserId, blockedId: firstUserId },
      ],
    },
  })) > 0;
}

export async function assertUsersCanInteract(db: DbClient, firstUserId: string, secondUserId: string) {
  if (await usersAreBlocked(db, firstUserId, secondUserId)) throw new Error("USER_BLOCKED");
}

export async function blockUser(blockerId: string, blockedId: string) {
  if (blockerId === blockedId) throw new Error("SELF_BLOCK");
  return prisma.$transaction(async (tx) => {
    const target = await tx.user.findFirst({ where: { id: blockedId, deletedAt: null }, select: { id: true } });
    if (!target) throw new Error("USER_NOT_FOUND");
    const block = await tx.userBlock.upsert({
      where: { blockerId_blockedId: { blockerId, blockedId } },
      create: { blockerId, blockedId },
      update: {},
    });
    await tx.favoritePerformer.deleteMany({
      where: {
        OR: [
          { customerId: blockerId, performerId: blockedId },
          { customerId: blockedId, performerId: blockerId },
        ],
      },
    });
    return block;
  });
}
