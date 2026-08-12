import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/config/server-env";
import { prisma } from "@/lib/db/prisma";
import { processPendingTelegramNotifications } from "@/lib/telegram/bot";
import { expirePublishedTasks } from "@/server/jobs/task-expiry";
import { processMatchingWaves } from "@/server/jobs/matching-waves";
import { cleanupOrphanedMedia } from "@/server/jobs/media-cleanup";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function hasValidSecret(request: NextRequest) {
  const received = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const expected = serverEnv.INTERNAL_JOB_SECRET;
  if (!expected) return false;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);
  return receivedBuffer.length === expectedBuffer.length && timingSafeEqual(receivedBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) return NextResponse.json({ error: "Недостаточно прав." }, { status: 401 });
  const now = new Date();
  try {
    const matching = await processMatchingWaves();
    const expiry = await expirePublishedTasks();
    const notifications = await processPendingTelegramNotifications();
    const media = await cleanupOrphanedMedia();
    await prisma.workerHeartbeat.upsert({
      where: { id: "jobs" },
      create: { id: "jobs", startedAt: now, lastSeenAt: new Date(), lastSuccessAt: new Date() },
      update: { lastSeenAt: new Date(), lastSuccessAt: new Date(), lastError: null },
    });
    return NextResponse.json({ ok: true, ...matching, ...expiry, notificationsClaimed: notifications.claimed, media });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Job execution failed";
    await prisma.workerHeartbeat.upsert({
      where: { id: "jobs" },
      create: { id: "jobs", startedAt: now, lastSeenAt: new Date(), lastError: message.slice(0, 1000) },
      update: { lastSeenAt: new Date(), lastError: message.slice(0, 1000) },
    }).catch(() => undefined);
    return NextResponse.json({ ok: false, error: "Внутренняя задача не выполнена." }, { status: 500 });
  }
}
