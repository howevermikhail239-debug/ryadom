import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().min(500).max(3000),
});

type ExecutorRow = { latitude: number; longitude: number };

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) return NextResponse.json({ error: "Некорректная область поиска." }, { status: 400 });
  const { latitude, longitude, radius } = parsed.data;
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser?.id ?? null;
  const executors = await prisma.$queryRaw<ExecutorRow[]>`
    SELECT
      ROUND(ST_Y(u."lastLocation"::geometry)::numeric, 3)::float8 AS latitude,
      ROUND(ST_X(u."lastLocation"::geometry)::numeric, 3)::float8 AS longitude
    FROM users u
    WHERE u.status = 'ACTIVE'::"UserStatus"
      AND 'PERFORMER'::"UserRole" = ANY(u.roles)
      AND u."availableUntil" > NOW()
      AND (u."cooldownUntil" IS NULL OR u."cooldownUntil" <= NOW())
      AND u."lastSeenAt" > NOW() - INTERVAL '30 minutes'
      AND u."lastLocation" IS NOT NULL
      AND (${currentUserId}::uuid IS NULL OR u.id <> ${currentUserId}::uuid)
      AND (${currentUserId}::uuid IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_blocks block
        WHERE (block."blockerId" = ${currentUserId}::uuid AND block."blockedId" = u.id)
           OR (block."blockerId" = u.id AND block."blockedId" = ${currentUserId}::uuid)
      ))
      AND ST_DWithin(
        u."lastLocation",
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radius}
      )
    ORDER BY u."lastSeenAt" DESC
    LIMIT 100
  `;
  return NextResponse.json({ executors }, { headers: { "Cache-Control": "private, no-store" } });
}
