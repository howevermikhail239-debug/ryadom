import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { blockUser } from "@/server/services/user-blocks";

const paramsSchema = z.object({ userId: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { userId } = paramsSchema.parse(await context.params);
    await blockUser(user.id, userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "BLOCK_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : code === "USER_NOT_FOUND" ? 404 : 400;
    const message = code === "SELF_BLOCK" ? "Нельзя заблокировать себя." : status === 404 ? "Пользователь не найден." : status === 401 ? "Войдите в аккаунт." : "Не удалось заблокировать пользователя.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ userId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { userId } = paramsSchema.parse(await context.params);
    await prisma.userBlock.deleteMany({ where: { blockerId: user.id, blockedId: userId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "UNBLOCK_FAILED";
    return NextResponse.json({ ok: false, error: code === "UNAUTHORIZED" ? "Войдите в аккаунт." : "Не удалось снять блокировку." }, { status: code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
