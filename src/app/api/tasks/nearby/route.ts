import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { getCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import type { TaskFeedItem } from "@/types/task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const querySchema = z.object({
  latitude: z.coerce.number().min(-90).max(90),
  longitude: z.coerce.number().min(-180).max(180),
  radius: z.coerce.number().int().refine((value) => [500, 1000, 3000].includes(value)),
});

type NearbyRow = {
  id: string;
  title: string;
  description: string;
  priceKopecks: number;
  latitude: string;
  longitude: string;
  addressLabel: string | null;
  startsAt: Date | null;
  publishedAt: Date;
  expiresAt: Date;
  status: "PUBLISHED" | "MATCHING";
  distanceMeters: number;
  categorySlug: string;
  categoryName: string;
  categoryIcon: string;
  customerName: string;
  customerId: string;
  customerAvatarUrl: string | null;
  customerRating: string;
  customerRatingCount: number;
  customerTelegramVerified: boolean;
  isUrgent: boolean;
  paymentMethod: "CASH" | "TRANSFER";
  distanceBand: number;
  preferredCategory: boolean;
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные координаты или радиус." }, { status: 400 });
  }

  const { latitude, longitude, radius } = parsed.data;
  const currentUser = await getCurrentUser();
  const currentUserId = currentUser?.id ?? null;
  const rows = await prisma.$queryRaw<NearbyRow[]>`
    SELECT
      t.id,
      t.title,
      t.description,
      t."priceKopecks",
      ROUND(t.latitude, 3)::text AS latitude,
      ROUND(t.longitude, 3)::text AS longitude,
      CASE
        WHEN t."addressLabel" IS NULL THEN NULL
        ELSE 'Точный адрес после взятия задачи'
      END AS "addressLabel",
      t."startsAt",
      t."publishedAt",
      t."expiresAt",
      t.status,
      ROUND(ST_Distance(
        t.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ))::int AS "distanceMeters",
      FLOOR(ST_Distance(
        t.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ) / 50)::int AS "distanceBand",
      c.slug AS "categorySlug",
      c.name AS "categoryName",
      c.icon AS "categoryIcon",
      u."displayName" AS "customerName",
      u.id AS "customerId",
      u."avatarUrl" AS "customerAvatarUrl",
      u."ratingAverage"::text AS "customerRating",
      u."ratingCount" AS "customerRatingCount",
      (u."telegramVerifiedAt" IS NOT NULL) AS "customerTelegramVerified"
      ,t."isUrgent"
      ,t."paymentMethod"
      ,(${currentUserId}::uuid IS NOT NULL AND EXISTS (
        SELECT 1 FROM notification_preference_categories selected
        WHERE selected."preferenceUserId" = ${currentUserId}::uuid
          AND selected."categoryId" = t."categoryId"
      )) AS "preferredCategory"
    FROM tasks t
    JOIN categories c ON c.id = t."categoryId"
    JOIN users u ON u.id = t."customerId"
    WHERE t.status IN ('PUBLISHED'::"TaskStatus", 'MATCHING'::"TaskStatus")
      AND t."expiresAt" > NOW()
      AND t.location IS NOT NULL
      AND (${currentUserId}::uuid IS NULL OR NOT EXISTS (
        SELECT 1 FROM user_blocks block
        WHERE (block."blockerId" = ${currentUserId}::uuid AND block."blockedId" = t."customerId")
           OR (block."blockerId" = t."customerId" AND block."blockedId" = ${currentUserId}::uuid)
      ))
      AND (t."earlyAccessUntil" IS NULL OR t."earlyAccessUntil" <= NOW() OR t."preferredPerformerId" = ${currentUserId}::uuid)
      AND ST_DWithin(
        t.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radius}
      )
    ORDER BY "distanceBand" ASC, t."isUrgent" DESC, t."publishedAt" DESC, "preferredCategory" DESC, "distanceMeters" ASC, t.id ASC
    LIMIT 100
  `;

  const tasks: TaskFeedItem[] = rows.map((row) => ({
    id: row.id,
    title: row.title,
    description: row.description,
    priceKopecks: row.priceKopecks,
    latitude: Number(row.latitude),
    longitude: Number(row.longitude),
    addressLabel: row.addressLabel,
    startsAt: row.startsAt?.toISOString() ?? null,
    publishedAt: row.publishedAt.toISOString(),
    expiresAt: row.expiresAt.toISOString(),
    status: row.status,
    distanceMeters: row.distanceMeters,
    isUrgent: row.isUrgent,
    paymentMethod: row.paymentMethod,
    category: { slug: row.categorySlug, name: row.categoryName, icon: row.categoryIcon },
    customer: {
      id: row.customerId,
      displayName: row.customerName,
      avatarUrl: row.customerAvatarUrl,
      ratingAverage: Number(row.customerRating),
      ratingCount: row.customerRatingCount,
      telegramVerified: row.customerTelegramVerified,
    },
  }));

  return NextResponse.json({ tasks }, { headers: { "Cache-Control": "private, no-store" } });
}
