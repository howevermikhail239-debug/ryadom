import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { rublesToKopecks } from "@/lib/money";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const updateTaskSchema = z.object({
  categoryId: z.string().uuid(),
  title: z.string().trim().min(3).max(120),
  description: z.string().trim().min(10).max(2000),
  priceRubles: z.string().trim(),
  latitude: z.number().min(-90).max(90),
  longitude: z.number().min(-180).max(180),
  addressLabel: z.string().trim().max(300).nullable().optional(),
  startsAt: z.string().datetime().nullable().optional(),
  isUrgent: z.boolean(),
  paymentMethod: z.enum(["CASH", "TRANSFER"]),
});

function canManage(user: { id: string; roles: string[] }, customerId: string): boolean {
  return user.id === customerId || user.roles.includes("ADMIN");
}

export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = paramsSchema.parse(await context.params);
    const input = updateTaskSchema.parse(await request.json());
    const [task, category] = await Promise.all([
      prisma.task.findUnique({ where: { id }, select: { customerId: true, status: true, version: true } }),
      prisma.category.findFirst({ where: { id: input.categoryId, isActive: true }, select: { id: true } }),
    ]);

    if (!task) return NextResponse.json({ error: "Задача не найдена." }, { status: 404 });
    if (!canManage(user, task.customerId)) {
      return NextResponse.json({ error: "Недостаточно прав для редактирования." }, { status: 403 });
    }
    const isAdmin = user.roles.includes("ADMIN");
    if (!isAdmin && !["DRAFT", "PUBLISHED", "MATCHING"].includes(task.status)) {
      return NextResponse.json({ error: "После назначения исполнителя задачу может изменить только администратор." }, { status: 409 });
    }
    if (!category) return NextResponse.json({ error: "Категория недоступна." }, { status: 400 });

    const startsAt = input.startsAt ? new Date(input.startsAt) : null;
    const now = new Date();
    if (startsAt && startsAt.getTime() < now.getTime() - 60_000) {
      return NextResponse.json({ error: "Время начала уже прошло." }, { status: 400 });
    }

    const updated = await prisma.task.updateMany({
      where: isAdmin
        ? { id, version: task.version }
        : { id, customerId: user.id, status: { in: ["DRAFT", "PUBLISHED", "MATCHING"] }, version: task.version },
      data: {
        categoryId: category.id,
        title: input.title,
        description: input.description,
        priceKopecks: rublesToKopecks(input.priceRubles),
        latitude: input.latitude,
        longitude: input.longitude,
        addressLabel: input.addressLabel || null,
        startsAt,
        expiresAt: startsAt
          ? new Date(startsAt.getTime() + 30 * 60_000)
          : new Date(now.getTime() + 2 * 60 * 60_000),
        isUrgent: input.isUrgent,
        paymentMethod: input.paymentMethod,
        version: { increment: 1 },
      },
    });

    if (updated.count !== 1) {
      return NextResponse.json({ error: "Задача успела измениться или уже назначена исполнителю. Обновите страницу." }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось изменить задачу.";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
    return NextResponse.json({ error: message }, { status: message === "INVALID_ORIGIN" ? 403 : 400 });
  }
}

export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id } = paramsSchema.parse(await context.params);
    const task = await prisma.task.findUnique({
      where: { id },
      select: { customerId: true, status: true, version: true },
    });

    if (!task) return NextResponse.json({ error: "Задача не найдена." }, { status: 404 });
    if (!canManage(user, task.customerId)) {
      return NextResponse.json({ error: "Недостаточно прав для удаления." }, { status: 403 });
    }
    const isAdmin = user.roles.includes("ADMIN");
    if (!isAdmin && !["DRAFT", "PUBLISHED", "MATCHING"].includes(task.status)) {
      return NextResponse.json({ error: "После назначения исполнителя задачу может удалить только администратор." }, { status: 409 });
    }

    const deleted = await prisma.task.updateMany({
      where: isAdmin
        ? { id, version: task.version }
        : { id, customerId: user.id, status: { in: ["DRAFT", "PUBLISHED", "MATCHING"] }, version: task.version },
      data: {
        status: "CANCELLED",
        cancelledAt: new Date(),
        cancellationReason: isAdmin ? "Удалено администратором" : "Удалено заказчиком",
        version: { increment: 1 },
      },
    });

    if (deleted.count !== 1) {
      return NextResponse.json({ error: "Задача успела измениться или уже назначена исполнителю. Обновите страницу." }, { status: 409 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Не удалось удалить задачу.";
    if (message === "UNAUTHORIZED") return NextResponse.json({ error: "Войдите в аккаунт." }, { status: 401 });
    return NextResponse.json({ error: message }, { status: message === "INVALID_ORIGIN" ? 403 : 400 });
  }
}
