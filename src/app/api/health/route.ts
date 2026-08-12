import { NextResponse } from "next/server";

import { prisma } from "@/lib/db/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const [, worker] = await Promise.all([
      prisma.$queryRaw`SELECT 1`,
      prisma.workerHeartbeat.findUnique({ where: { id: "jobs" }, select: { lastSeenAt: true, lastSuccessAt: true, lastError: true } }),
    ]);
    const workerState = !worker ? "starting" : worker.lastSeenAt > new Date(Date.now() - 90_000) ? "healthy" : "stale";
    return NextResponse.json(
      { status: "ok", database: "connected", worker: workerState, workerLastSeenAt: worker?.lastSeenAt.toISOString() ?? null, workerLastSuccessAt: worker?.lastSuccessAt?.toISOString() ?? null, workerLastError: worker?.lastError ?? null },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "degraded", database: "unavailable" },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
