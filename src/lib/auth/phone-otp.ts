import "server-only";

import { createHmac, timingSafeEqual } from "node:crypto";

import { serverEnv } from "@/config/server-env";

export function normalizeRussianPhone(value: string): string {
  const digits = value.replace(/\D/g, "");
  const normalized = digits.length === 10
    ? `7${digits}`
    : digits.length === 11 && digits.startsWith("8")
      ? `7${digits.slice(1)}`
      : digits;
  if (!/^7\d{10}$/.test(normalized)) throw new Error("INVALID_PHONE");
  return `+${normalized}`;
}

export function hashOtp(phone: string, code: string): string {
  return createHmac("sha256", serverEnv.OTP_PEPPER).update(`${phone}:${code}`).digest("hex");
}

export function otpMatches(expectedHash: string, phone: string, code: string): boolean {
  const actual = Buffer.from(hashOtp(phone, code), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function sendPhoneOtp(phone: string, code: string, requestIp?: string): Promise<{ debugCode?: string }> {
  if (serverEnv.SMS_PROVIDER === "mock") return { debugCode: code };
  if (serverEnv.SMS_PROVIDER !== "sms_ru" || !serverEnv.SMS_RU_API_ID) throw new Error("SMS_NOT_CONFIGURED");

  const recipient = phone.slice(1);
  const body = new URLSearchParams({
    api_id: serverEnv.SMS_RU_API_ID,
    to: recipient,
    msg: `Рядом: код входа ${code}. Никому его не сообщайте.`,
    json: "1",
  });
  if (requestIp) body.set("ip", requestIp);

  const response = await fetch("https://sms.ru/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
    signal: AbortSignal.timeout(10_000),
  });
  const result = await response.json() as {
    status?: string;
    status_text?: string;
    sms?: Record<string, { status?: string; status_code?: number; status_text?: string }>;
  };
  const delivery = result.sms?.[recipient];
  if (!response.ok || result.status !== "OK" || delivery?.status !== "OK") {
    throw new Error(`SMS_SEND_FAILED:${delivery?.status_code ?? result.status_text ?? response.status}`);
  }
  return {};
}
