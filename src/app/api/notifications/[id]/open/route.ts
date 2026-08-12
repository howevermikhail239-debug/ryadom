import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { trackProductEvent } from "@/lib/analytics/events";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

const idSchema = z.string().uuid();

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const id = idSchema.parse((await context.params).id);
    const notification = await prisma.notification.findFirst({ where: { id, userId: user.id }, select: { id: true, taskId: true, type: true, readAt: true } });
    if (!notification) return NextResponse.json({ ok: false }, { status: 404 });
    if (!notification.readAt) await prisma.notification.update({ where: { id: notification.id }, data: { readAt: new Date() } });
    trackProductEvent({ name: "notification_opened", userId: user.id, taskId: notification.taskId, properties: { type: notification.type } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OPEN_FAILED";
    return NextResponse.json({ ok: false }, { status: code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
