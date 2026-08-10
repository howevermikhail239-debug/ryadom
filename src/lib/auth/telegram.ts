import "server-only";

import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import { ExpiredError, validate as validateTelegramInitData } from "@tma.js/init-data-node";
import { z } from "zod";

const telegramUserSchema = z.object({
  id: z.union([z.string(), z.number()]).transform(String),
  first_name: z.string().min(1).max(100),
  last_name: z.string().max(100).optional(),
  username: z.string().max(64).optional(),
  photo_url: z.string().url().optional(),
  allows_write_to_pm: z.boolean().optional(),
});

export type VerifiedTelegramUser = {
  id: bigint;
  firstName: string;
  lastName?: string;
  username?: string;
  photoUrl?: string;
  canMessage: boolean;
};

export type TelegramWidgetPayload = {
  id: string | number;
  first_name: string;
  last_name?: string;
  username?: string;
  photo_url?: string;
  auth_date: string | number;
  hash: string;
  allows_write_to_pm?: boolean;
};

const MAX_AUTH_AGE_SECONDS = 15 * 60;

function safeHexEqual(actual: string, expected: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(actual) || !/^[a-f0-9]{64}$/i.test(expected)) return false;
  return timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

function assertFresh(authDate: number): void {
  const now = Math.floor(Date.now() / 1000);
  if (!Number.isInteger(authDate) || authDate > now + 30 || now - authDate > MAX_AUTH_AGE_SECONDS) {
    throw new Error("Данные Telegram устарели. Повторите вход.");
  }
}

function normalizeUser(input: unknown, canMessage: boolean): VerifiedTelegramUser {
  const user = telegramUserSchema.parse(input);
  return {
    id: BigInt(user.id),
    firstName: user.first_name,
    lastName: user.last_name,
    username: user.username,
    photoUrl: user.photo_url,
    canMessage: canMessage || user.allows_write_to_pm === true,
  };
}

export function verifyTelegramWidget(
  payload: TelegramWidgetPayload,
  botToken: string,
): VerifiedTelegramUser {
  const entries = Object.entries(payload)
    .filter(([key, value]) => key !== "hash" && value !== undefined && value !== null)
    .map(([key, value]) => [key, typeof value === "boolean" ? String(value) : String(value)] as const)
    .sort(([a], [b]) => a.localeCompare(b));

  const dataCheckString = entries.map(([key, value]) => `${key}=${value}`).join("\n");
  const secretKey = createHash("sha256").update(botToken).digest();
  const expectedHash = createHmac("sha256", secretKey).update(dataCheckString).digest("hex");

  if (!safeHexEqual(payload.hash, expectedHash)) throw new Error("Некорректная подпись Telegram.");

  assertFresh(Number(payload.auth_date));
  return normalizeUser(payload, payload.allows_write_to_pm === true);
}

export function verifyTelegramWebApp(initData: string, botToken: string): VerifiedTelegramUser {
  const params = new URLSearchParams(initData);
  const rawUser = params.get("user");

  if (!rawUser) throw new Error("Telegram не передал профиль пользователя.");

  try {
    validateTelegramInitData(initData, botToken, { expiresIn: MAX_AUTH_AGE_SECONDS });
  } catch (error) {
    if (error instanceof ExpiredError) {
      throw new Error("Данные Telegram устарели. Закройте и снова откройте приложение.");
    }
    throw new Error("Некорректная подпись Telegram WebApp.");
  }

  return normalizeUser(JSON.parse(rawUser) as unknown, true);
}
