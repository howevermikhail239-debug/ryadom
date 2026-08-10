import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

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
};

export async function GET(request: NextRequest) {
  const parsed = querySchema.safeParse(Object.fromEntries(request.nextUrl.searchParams));
  if (!parsed.success) {
    return NextResponse.json({ error: "Некорректные координаты или радиус." }, { status: 400 });
  }

  const { latitude, longitude, radius } = parsed.data;
  const rows = await prisma.$queryRaw<NearbyRow[]>`
    SELECT
      t.id,
      t.title,
      t.description,
      t."priceKopecks",
      t.latitude::text AS latitude,
      t.longitude::text AS longitude,
      t."addressLabel",
      t."startsAt",
      t."expiresAt",
      t.status,
      ROUND(ST_Distance(
        t.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography
      ))::int AS "distanceMeters",
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
    FROM tasks t
    JOIN categories c ON c.id = t."categoryId"
    JOIN users u ON u.id = t."customerId"
    WHERE t.status IN ('PUBLISHED'::"TaskStatus", 'MATCHING'::"TaskStatus")
      AND t."expiresAt" > NOW()
      AND t.location IS NOT NULL
      AND ST_DWithin(
        t.location,
        ST_SetSRID(ST_MakePoint(${longitude}, ${latitude}), 4326)::geography,
        ${radius}
      )
    ORDER BY "distanceMeters" ASC, t."publishedAt" DESC
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
