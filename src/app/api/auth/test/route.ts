import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";
import { createSession, requireCurrentUser, revokeCurrentSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

export const runtime = "nodejs";

const schema = z.object({
  userId: z.string().uuid(),
  accessCode: z.string().min(6).max(128),
});

function validAccessCode(value: string): boolean {
  const expected = serverEnv.TEST_AUTH_ACCESS_CODE ?? "";
  const actualBuffer = Buffer.from(value);
  const expectedBuffer = Buffer.from(expected);
  return actualBuffer.length === expectedBuffer.length && timingSafeEqual(actualBuffer, expectedBuffer);
}

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    if (!serverEnv.ENABLE_TEST_AUTH) {
      return NextResponse.json({ error: "Тестовый вход отключён." }, { status: 404 });
    }
    const currentUser = await requireCurrentUser();
    if (!currentUser.roles.includes("ADMIN")) {
      return NextResponse.json({ error: "Переключать тестовых пользователей может только администратор." }, { status: 403 });
    }

    const input = schema.parse(await request.json());
    if (!validAccessCode(input.accessCode)) {
      return NextResponse.json({ error: "Неверный код тестового доступа." }, { status: 403 });
    }

    const user = await prisma.user.findFirst({
      where: { id: input.userId, isTest: true, status: "ACTIVE", deletedAt: null },
      select: { id: true },
    });
    if (!user) return NextResponse.json({ error: "Тестовый пользователь не найден." }, { status: 404 });

    await revokeCurrentSession();
    await createSession(user.id);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось выполнить тестовый вход.";
    const status = message === "UNAUTHORIZED" ? 401 : message === "INVALID_ORIGIN" ? 403 : 400;
    return NextResponse.json({ error: message === "UNAUTHORIZED" ? "Войдите в аккаунт администратора." : message }, { status });
  }
}
