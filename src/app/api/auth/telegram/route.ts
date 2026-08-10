import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { createSession } from "@/lib/auth/session";
import {
  verifyTelegramWebApp,
  verifyTelegramWidget,
  type TelegramWidgetPayload,
} from "@/lib/auth/telegram";
import { upsertTelegramUser } from "@/lib/auth/telegram-user";
import { assertSameOrigin } from "@/lib/http/security";
import { serverEnv } from "@/config/server-env";

export const runtime = "nodejs";

const requestSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("webapp"), initData: z.string().min(20).max(16_000) }),
  z.object({
    kind: z.literal("widget"),
    payload: z.object({
      id: z.union([z.string(), z.number()]),
      first_name: z.string().min(1).max(100),
      last_name: z.string().max(100).optional(),
      username: z.string().max(64).optional(),
      photo_url: z.string().url().optional(),
      auth_date: z.union([z.string(), z.number()]),
      hash: z.string().length(64),
      allows_write_to_pm: z.boolean().optional(),
    }),
  }),
]);

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = requestSchema.parse(await request.json());
    const telegramUser =
      input.kind === "webapp"
        ? verifyTelegramWebApp(input.initData, serverEnv.TELEGRAM_BOT_TOKEN)
        : verifyTelegramWidget(input.payload as TelegramWidgetPayload, serverEnv.TELEGRAM_BOT_TOKEN);

    const user = await upsertTelegramUser(telegramUser);

    await createSession(user.id);
    return NextResponse.json({ ok: true, user: { id: user.id, displayName: user.displayName } });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось войти через Telegram.";
    const status = message === "INVALID_ORIGIN" ? 403 : 400;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
