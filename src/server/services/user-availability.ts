import "server-only";

import { prisma } from "@/lib/db/prisma";

export type AvailabilityMinutes = 0 | 30 | 60 | 120;

export async function setUserAvailability(userId: string, minutes: AvailabilityMinutes, now = new Date()) {
  const availableUntil = minutes > 0 ? new Date(now.getTime() + minutes * 60_000) : null;

  const locationActive = await prisma.$transaction(async (tx) => {
    await tx.user.update({
      where: { id: userId },
      data: { availableUntil, lastSeenAt: now },
    });

    if (availableUntil) {
      const location = await tx.userLocation.updateMany({
        where: { userId, expiresAt: { gt: now } },
        data: { expiresAt: availableUntil },
      });
      return location.count === 1;
    }

    // UserLocation is an ephemeral consent record. Removing it avoids keeping a
    // disabled performer in matching and also respects expiresAt > updatedAt.
    await tx.userLocation.deleteMany({ where: { userId } });
    await tx.$executeRaw`
      UPDATE users
      SET "lastLocation" = NULL
      WHERE id = ${userId}::uuid
    `;
    return false;
  });

  return { availableUntil, locationActive };
}
