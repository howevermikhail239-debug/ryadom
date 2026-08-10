import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";

export const runtime = "nodejs";

const inputSchema = z.object({
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  accuracyMeters: z.number().int().min(0).max(50_000).optional(),
});

export async function PUT(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = inputSchema.parse(await request.json());
    const now = new Date();
    await prisma.$transaction(async (tx) => {
      await tx.userLocation.upsert({
        where: { userId: user.id },
        create: {
          userId: user.id,
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMeters: input.accuracyMeters,
          consentedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
        update: {
          latitude: input.latitude,
          longitude: input.longitude,
          accuracyMeters: input.accuracyMeters,
          consentedAt: now,
          expiresAt: new Date(now.getTime() + 30 * 60_000),
        },
      });
      await tx.$executeRaw`
        UPDATE users
        SET "lastSeenAt" = ${now},
            "lastLocation" = ST_SetSRID(ST_MakePoint(${input.longitude}, ${input.latitude}), 4326)::geography
        WHERE id = ${user.id}::uuid
      `;
    });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const status = error instanceof Error && error.message === "UNAUTHORIZED" ? 401 : 400;
    return NextResponse.json({ ok: false }, { status });
  }
}
