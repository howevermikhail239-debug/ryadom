import { timingSafeEqual } from "node:crypto";

import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";

export const runtime = "nodejs";

const updateSchema = z.object({
  message: z
    .object({
      chat: z.object({ id: z.union([z.number(), z.string()]) }),
      text: z.string().optional(),
    })
    .optional(),
});

function hasValidSecret(request: NextRequest): boolean {
  const received = request.headers.get("x-telegram-bot-api-secret-token") ?? "";
  const expected = serverEnv.TELEGRAM_WEBHOOK_SECRET;
  const receivedBuffer = Buffer.from(received);
  const expectedBuffer = Buffer.from(expected);

  return (
    receivedBuffer.length === expectedBuffer.length &&
    timingSafeEqual(receivedBuffer, expectedBuffer)
  );
}

async function sendStartMessage(chatId: string): Promise<void> {
  const response = await fetch(
    `https://api.telegram.org/bot${serverEnv.TELEGRAM_BOT_TOKEN}/sendMessage`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chat_id: chatId,
        text: "Привет! Это «Рядом» — быстрые задания и помощь поблизости. Нажмите кнопку ниже, чтобы открыть приложение.",
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: "Открыть «Рядом»",
                web_app: { url: serverEnv.APP_URL },
              },
            ],
          ],
        },
      }),
      signal: AbortSignal.timeout(7000),
    },
  );

  if (!response.ok) {
    throw new Error(`Telegram sendMessage failed with ${response.status}`);
  }
}

export async function POST(request: NextRequest) {
  if (!hasValidSecret(request)) {
    return NextResponse.json({ ok: false }, { status: 401 });
  }

  const parsed = updateSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ ok: true });
  }

  const message = parsed.data.message;
  const command = message?.text?.trim().split(/\s+/, 1)[0]?.split("@", 1)[0];
  if (message && (command === "/start" || command === "/help")) {
    await sendStartMessage(String(message.chat.id));
  }

  return NextResponse.json({ ok: true });
}
