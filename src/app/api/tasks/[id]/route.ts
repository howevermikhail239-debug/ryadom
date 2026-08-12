import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { rublesToKopecks } from "@/lib/money";
import { isTaskManageableStatus, TASK_MANAGEABLE_STATUSES } from "@/lib/tasks/policy";
import { resolveTaskTiming, updateTaskSchema } from "@/lib/tasks/task-input";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
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
    if (!isAdmin && !isTaskManageableStatus(task.status)) {
      return NextResponse.json({ error: "После назначения исполнителя задачу может изменить только администратор." }, { status: 409 });
    }
    if (!category) return NextResponse.json({ error: "Категория недоступна." }, { status: 400 });

    const now = new Date();
    const { startsAt, expiresAt } = resolveTaskTiming(input, now);

    const updated = await prisma.task.updateMany({
      where: isAdmin
        ? { id, version: task.version }
        : { id, customerId: user.id, status: { in: [...TASK_MANAGEABLE_STATUSES] }, version: task.version },
      data: {
        categoryId: category.id,
        title: input.title,
        description: input.description,
        priceKopecks: rublesToKopecks(input.priceRubles),
        latitude: input.latitude,
        longitude: input.longitude,
        addressLabel: input.addressLabel || null,
        startsAt,
        expiresAt,
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
    if (message === "TASK_START_IN_PAST") return NextResponse.json({ error: "Время начала уже прошло." }, { status: 400 });
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
    if (!isAdmin && !isTaskManageableStatus(task.status)) {
      return NextResponse.json({ error: "После назначения исполнителя задачу может удалить только администратор." }, { status: 409 });
    }

    const deleted = await prisma.task.updateMany({
      where: isAdmin
        ? { id, version: task.version }
        : { id, customerId: user.id, status: { in: [...TASK_MANAGEABLE_STATUSES] }, version: task.version },
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
