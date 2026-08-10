import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyTaskStatusChanged } from "@/lib/telegram/bot";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

type LockedTask = { id: string; customerId: string; status: "IN_PROGRESS" | "COMPLETED" | "ASSIGNED" | "CANCELLED" | "DISPUTED" };

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);

    const result = await prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<LockedTask[]>`
        SELECT id, "customerId", status
        FROM tasks
        WHERE id = ${taskId}::uuid
        FOR UPDATE
      `;
      const task = rows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      const isAdmin = user.roles.includes("ADMIN");
      if (!isAdmin && task.customerId !== user.id) throw new Error("NOT_TASK_CUSTOMER");

      const match = await tx.taskMatch.findFirst({
        where: { taskId, status: "COMPLETED" },
        orderBy: { completedAt: "desc" },
      });
      if (task.status === "COMPLETED") return { changed: false };
      if (!match || task.status !== "IN_PROGRESS") throw new Error("TASK_CANNOT_CONFIRM");

      const now = new Date();
      await tx.taskMatch.update({ where: { id: match.id }, data: { confirmedAt: now } });
      await tx.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: now, version: { increment: 1 } } });
      await tx.user.update({ where: { id: match.performerId }, data: { completedTasks: { increment: 1 } } });
      return { changed: true };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10_000 });

    if (result.changed) await notifyTaskStatusChanged(taskId, "заказчик подтвердил выполнение").catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "CONFIRM_FAILED";
    const responses: Record<string, { status: number; error: string }> = {
      UNAUTHORIZED: { status: 401, error: "Войдите, чтобы подтвердить выполнение." },
      TASK_NOT_FOUND: { status: 404, error: "Задача не найдена." },
      NOT_TASK_CUSTOMER: { status: 403, error: "Подтвердить выполнение может только заказчик." },
      TASK_CANNOT_CONFIRM: { status: 409, error: "Эта задача ещё не ожидает подтверждения." },
      INVALID_ORIGIN: { status: 403, error: "Запрос отклонён." },
      P2034: { status: 409, error: "Задача только что изменилась. Обновите страницу." },
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const response = responses[message] ?? responses[prismaCode] ?? { status: 500, error: "Не удалось подтвердить выполнение." };
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status });
  }
}
