import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { rublesToKopecks } from "@/lib/money";
import { notifyNearbyPerformers } from "@/lib/telegram/bot";

export const runtime = "nodejs";

const createTaskSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  priceRubles: z.string().trim(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  addressLabel: z.string().trim().max(300).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  isUrgent: z.boolean().default(false),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
});

export async function POST(request: NextRequest) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const input = createTaskSchema.parse(await request.json());
    const priceKopecks = rublesToKopecks(input.priceRubles);
    const category = await prisma.category.findFirst({ where: { id: input.categoryId, isActive: true } });
    if (!category) return NextResponse.json({ error: "Категория недоступна." }, { status: 400 });

    const now = new Date();
    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    if (startsAt && startsAt.getTime() < now.getTime() - 60_000) {
      return NextResponse.json({ error: "Время начала уже прошло." }, { status: 400 });
    }
    const expiresAt = input.isUrgent
      ? new Date(now.getTime() + 60 * 60_000)
      : startsAt
      ? new Date(startsAt.getTime() + 30 * 60_000)
      : new Date(now.getTime() + 2 * 60 * 60_000);

    const task = await prisma.task.create({
      data: {
        customerId: user.id,
        categoryId: category.id,
        title: input.title,
        description: input.description,
        priceKopecks,
        latitude: input.latitude,
        longitude: input.longitude,
        addressLabel: input.addressLabel || null,
        startsAt,
        expiresAt,
        searchRadiusMeters: 1000,
        status: "PUBLISHED",
        publishedAt: now,
        instantAccept: true,
        isUrgent: input.isUrgent,
        paymentMethod: input.paymentMethod,
      },
      select: { id: true },
    });

    await notifyNearbyPerformers(task.id).catch(() => undefined);
    return NextResponse.json({ ok: true, taskId: task.id }, { status: 201 });
  } catch (error) {
    if (error instanceof Error && error.message === "UNAUTHORIZED") {
      return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
    }
    const message = error instanceof Error ? error.message : "Не удалось создать задачу.";
    return NextResponse.json({ error: message }, { status: message === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
