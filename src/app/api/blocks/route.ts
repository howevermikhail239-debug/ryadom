import { NextResponse } from "next/server";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

export async function GET() {
  try {
    const user = await requireCurrentUser();
    const blocks = await prisma.userBlock.findMany({
      where: { blockerId: user.id },
      orderBy: { createdAt: "desc" },
      include: { blocked: { select: { id: true, displayName: true, avatarUrl: true } } },
    });
    return NextResponse.json({ blocks: blocks.map((block) => ({ ...block.blocked, blockedAt: block.createdAt.toISOString() })) });
  } catch {
    return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
  }
}
