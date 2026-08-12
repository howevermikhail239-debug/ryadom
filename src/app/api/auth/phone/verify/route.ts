import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { normalizeRussianPhone, otpMatches } from "@/lib/auth/phone-otp";
import { createSession } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

const bodySchema = z.object({ phone: z.string().trim().min(10).max(30), code: z.string().regex(/^\d{6}$/) });

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const input = bodySchema.parse(await request.json());
    const phone = normalizeRussianPhone(input.phone);
    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string }>>`
        SELECT id FROM otp_challenges
        WHERE phone = ${phone} AND "consumedAt" IS NULL
        ORDER BY "createdAt" DESC
        LIMIT 1
        FOR UPDATE
      `;
      const challenge = rows[0] ? await tx.otpChallenge.findUnique({ where: { id: rows[0].id } }) : null;
      if (!challenge || challenge.expiresAt <= new Date()) return { error: "OTP_EXPIRED" as const };
      if (challenge.attempts >= challenge.maxAttempts) return { error: "OTP_ATTEMPTS_EXCEEDED" as const };
      if (!otpMatches(challenge.codeHash, phone, input.code)) {
        await tx.otpChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
        return { error: "OTP_INVALID" as const };
      }
      await tx.otpChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      const user = await tx.user.upsert({
        where: { phone },
        create: {
          phone,
          phoneVerifiedAt: new Date(),
          displayName: `Пользователь •${phone.slice(-4)}`,
          roles: ["CUSTOMER", "PERFORMER"],
          status: "ACTIVE",
          lastSeenAt: new Date(),
        },
        update: { phoneVerifiedAt: new Date(), status: "ACTIVE", lastSeenAt: new Date(), deletedAt: null },
      });
      return { userId: user.id };
    }, { isolationLevel: "ReadCommitted" });
    if ("error" in result) throw new Error(result.error);
    await createSession(result.userId);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const code = error instanceof Error ? error.message : "OTP_FAILED";
    const responses: Record<string, [number, string]> = {
      OTP_EXPIRED: [410, "Код истёк. Запросите новый."],
      OTP_ATTEMPTS_EXCEEDED: [429, "Слишком много неверных попыток. Запросите новый код."],
      OTP_INVALID: [400, "Неверный код."],
      OTP_ALREADY_USED: [409, "Код уже использован."],
      INVALID_PHONE: [400, "Введите российский номер телефона."],
      INVALID_ORIGIN: [403, "Запрос отклонён."],
    };
    const [status, message] = error instanceof z.ZodError ? [400, "Введите шестизначный код."] : responses[code] ?? [500, "Не удалось войти."];
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
