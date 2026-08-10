import { createHash, randomInt } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { serverEnv } from "@/config/server-env";
import { hashOtp, normalizeRussianPhone, sendPhoneOtp } from "@/lib/auth/phone-otp";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

const bodySchema = z.object({ phone: z.string().trim().min(10).max(30) });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const phone = normalizeRussianPhone(bodySchema.parse(await request.json()).phone);
    const now = new Date();
    const hourAgo = new Date(now.getTime() - 60 * 60_000);
    const forwardedIp = request.headers.get("x-forwarded-for")?.split(",")[0]?.trim();
    const requestIpHash = forwardedIp
      ? createHash("sha256").update(`${serverEnv.AUTH_SECRET}:${forwardedIp}`).digest("hex")
      : null;

    const code = String(randomInt(100_000, 1_000_000));
    await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${phone}))`;
      const [latest, phoneCount, ipCount] = await Promise.all([
        tx.otpChallenge.findFirst({ where: { phone }, orderBy: { createdAt: "desc" }, select: { createdAt: true } }),
        tx.otpChallenge.count({ where: { phone, createdAt: { gte: hourAgo } } }),
        requestIpHash ? tx.otpChallenge.count({ where: { requestIpHash, createdAt: { gte: hourAgo } } }) : Promise.resolve(0),
      ]);
      if (latest && now.getTime() - latest.createdAt.getTime() < 60_000) throw new Error("OTP_TOO_SOON");
      if (phoneCount >= 5 || ipCount >= 20) throw new Error("OTP_RATE_LIMIT");
      await tx.otpChallenge.create({
        data: {
          phone,
          codeHash: hashOtp(phone, code),
          requestIpHash,
          expiresAt: new Date(now.getTime() + serverEnv.OTP_TTL_SECONDS * 1000),
        },
      });
    }, { isolationLevel: "Serializable" });
    const result = await sendPhoneOtp(phone, code, forwardedIp);
    return NextResponse.json({ ok: true, retryAfterSeconds: 60, debugCode: result.debugCode });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OTP_FAILED";
    const responses: Record<string, [number, string]> = {
      INVALID_PHONE: [400, "Введите российский номер телефона."],
      OTP_TOO_SOON: [429, "Код уже отправлен. Повторите через минуту."],
      OTP_RATE_LIMIT: [429, "Слишком много попыток. Попробуйте через час."],
      SMS_NOT_CONFIGURED: [503, "Вход по телефону временно недоступен."],
      INVALID_ORIGIN: [403, "Запрос отклонён."],
    };
    const [status, message] = error instanceof z.ZodError
      ? responses.INVALID_PHONE
      : responses[code] ?? (code.startsWith("SMS_SEND_FAILED") ? [502, "SMS не отправлено. Проверьте номер или попробуйте позже."] : [500, "Не удалось отправить код."]);
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
