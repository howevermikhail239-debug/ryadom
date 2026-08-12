import "server-only";

import { prisma } from "@/lib/db/prisma";
import { getMediaStorage } from "@/lib/media/storage";

const CLEANUP_INTERVAL_MS = 60 * 60_000;
const ORPHAN_GRACE_MS = 24 * 60 * 60_000;

export async function cleanupOrphanedMedia(limit = 200) {
  const storage = getMediaStorage();
  if (!storage.listObjects) return { scanned: 0, deleted: 0, skipped: "local-storage" as const };

  const schedule = await prisma.workerHeartbeat.findUnique({ where: { id: "media-cleanup" }, select: { lastSeenAt: true } });
  if (schedule?.lastSeenAt && schedule.lastSeenAt > new Date(Date.now() - CLEANUP_INTERVAL_MS)) {
    return { scanned: 0, deleted: 0, skipped: "interval" as const };
  }

  const objects = await storage.listObjects(limit);
  const referenced = objects.length ? await prisma.message.findMany({
    where: { imageUrl: { in: objects.map((object) => object.locator) } },
    select: { imageUrl: true },
  }) : [];
  const referencedLocators = new Set(referenced.flatMap((message) => message.imageUrl ? [message.imageUrl] : []));
  const cutoff = new Date(Date.now() - ORPHAN_GRACE_MS);
  const orphans = objects.filter((object) => object.lastModified < cutoff && !referencedLocators.has(object.locator));
  const results = await Promise.allSettled(orphans.map((object) => storage.delete(object.locator)));
  const deleted = results.filter((result) => result.status === "fulfilled").length;

  const now = new Date();
  await prisma.workerHeartbeat.upsert({
    where: { id: "media-cleanup" },
    create: { id: "media-cleanup", startedAt: now, lastSeenAt: now, lastSuccessAt: now },
    update: { lastSeenAt: now, lastSuccessAt: now, lastError: deleted === orphans.length ? null : "Some orphan objects could not be deleted" },
  });
  return { scanned: objects.length, deleted, skipped: null };
}
