import { after, NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { trackProductEvent } from "@/lib/analytics/events";
import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { assertUsersCanInteract } from "@/server/services/user-blocks";

const paramsSchema = z.object({ performerId: z.string().uuid() });

export async function POST(request: NextRequest, context: { params: Promise<{ performerId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { performerId } = paramsSchema.parse(await context.params);
    if (performerId === user.id) throw new Error("SELF_FAVORITE");
    const performer = await prisma.user.findFirst({
      where: { id: performerId, status: "ACTIVE", deletedAt: null, roles: { has: "PERFORMER" } },
      select: { id: true },
    });
    if (!performer) throw new Error("PERFORMER_NOT_FOUND");
    await assertUsersCanInteract(prisma, user.id, performerId);
    const favorite = await prisma.favoritePerformer.upsert({
      where: { customerId_performerId: { customerId: user.id, performerId } },
      create: { customerId: user.id, performerId },
      update: {},
    });
    after(() => trackProductEvent({ name: "favorite_performer_added", userId: user.id, properties: { performerId } }));
    return NextResponse.json({ ok: true, createdAt: favorite.createdAt.toISOString() });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAVORITE_FAILED";
    const status = code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" || code === "USER_BLOCKED" ? 403 : code === "PERFORMER_NOT_FOUND" ? 404 : 400;
    const message = code === "SELF_FAVORITE" ? "Нельзя добавить себя в избранное." : code === "USER_BLOCKED" ? "Сначала снимите блокировку пользователя." : status === 404 ? "Исполнитель не найден." : status === 401 ? "Войдите в аккаунт." : "Не удалось добавить исполнителя.";
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ performerId: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { performerId } = paramsSchema.parse(await context.params);
    await prisma.favoritePerformer.deleteMany({ where: { customerId: user.id, performerId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "FAVORITE_FAILED";
    return NextResponse.json({ ok: false, error: code === "UNAUTHORIZED" ? "Войдите в аккаунт." : "Не удалось изменить избранное." }, { status: code === "UNAUTHORIZED" ? 401 : code === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
