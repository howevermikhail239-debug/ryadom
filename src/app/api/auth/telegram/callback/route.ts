import { NextRequest, NextResponse } from "next/server";

import { serverEnv } from "@/config/server-env";
import { createSession } from "@/lib/auth/session";
import { verifyTelegramWidget, type TelegramWidgetPayload } from "@/lib/auth/telegram";
import { upsertTelegramUser } from "@/lib/auth/telegram-user";

export const runtime = "nodejs";

function safeNext(value: string | null): string {
  return value?.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export async function GET(request: NextRequest) {
  const nextPath = safeNext(request.nextUrl.searchParams.get("next"));
  try {
    const params = request.nextUrl.searchParams;
    const payload: TelegramWidgetPayload = {
      id: params.get("id") ?? "",
      first_name: params.get("first_name") ?? "",
      auth_date: params.get("auth_date") ?? "",
      hash: params.get("hash") ?? "",
      ...(params.get("last_name") ? { last_name: params.get("last_name")! } : {}),
      ...(params.get("username") ? { username: params.get("username")! } : {}),
      ...(params.get("photo_url") ? { photo_url: params.get("photo_url")! } : {}),
      ...(params.get("allows_write_to_pm") ? { allows_write_to_pm: params.get("allows_write_to_pm") === "true" } : {}),
    };
    const telegramUser = verifyTelegramWidget(payload, serverEnv.TELEGRAM_BOT_TOKEN);
    const user = await upsertTelegramUser(telegramUser);
    await createSession(user.id);
    return NextResponse.redirect(new URL(nextPath, serverEnv.APP_URL));
  } catch (error) {
    const loginUrl = new URL("/login", serverEnv.APP_URL);
    loginUrl.searchParams.set("error", error instanceof Error ? error.message : "Не удалось войти через Telegram.");
    if (nextPath !== "/") loginUrl.searchParams.set("next", nextPath);
    return NextResponse.redirect(loginUrl);
  }
}
