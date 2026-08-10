import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyTaskStatusChanged } from "@/lib/telegram/bot";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });

type LockedTask = {
  id: string;
  customerId: string;
  status: "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "DISPUTED";
};

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

      const match = await tx.taskMatch.findFirst({
        where: { taskId, performerId: user.id },
        orderBy: { createdAt: "desc" },
      });
      if (!match) throw new Error("NOT_ASSIGNED_PERFORMER");
      if (match.status === "COMPLETED" && task.status === "COMPLETED") return { changed: false };
      if (match.status === "COMPLETED") return { changed: false };
      if (!user.roles.includes("PERFORMER")) throw new Error("PERFORMER_REQUIRED");
      if (!["ASSIGNED", "IN_PROGRESS"].includes(task.status) || !["CREATED", "IN_PROGRESS"].includes(match.status)) {
        throw new Error("TASK_CANNOT_COMPLETE");
      }
      const proof = await tx.message.findFirst({ where: { taskId, senderId: user.id, imageUrl: { not: null } }, select: { id: true } });
      if (!proof) throw new Error("PROOF_REQUIRED");

      const now = new Date();
      await tx.taskMatch.update({
        where: { id: match.id },
        data: { status: "COMPLETED", completedAt: now, startedAt: match.startedAt ?? now },
      });
      await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS", assignedAt: task.status === "ASSIGNED" ? now : undefined, version: { increment: 1 } },
      });
      return { changed: true };
    }, { isolationLevel: "Serializable", maxWait: 5000, timeout: 10_000 });

    if (result.changed) await notifyTaskStatusChanged(taskId, "исполнитель отметил выполнение — ожидается ваше подтверждение").catch(() => undefined);
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : "COMPLETE_FAILED";
    const responses: Record<string, { status: number; error: string }> = {
      UNAUTHORIZED: { status: 401, error: "Войдите, чтобы отметить выполнение." },
      TASK_NOT_FOUND: { status: 404, error: "Задача не найдена." },
      PERFORMER_REQUIRED: { status: 403, error: "Отметить выполнение может только исполнитель." },
      NOT_ASSIGNED_PERFORMER: { status: 403, error: "Вы не назначены исполнителем этой задачи." },
      TASK_CANNOT_COMPLETE: { status: 409, error: "Эту задачу сейчас нельзя отметить выполненной." },
      PROOF_REQUIRED: { status: 409, error: "Сначала отправьте фото выполненной работы в чат." },
      INVALID_ORIGIN: { status: 403, error: "Запрос отклонён." },
      P2034: { status: 409, error: "Задача только что изменилась. Обновите страницу." },
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const response = responses[message] ?? responses[prismaCode] ?? { status: 500, error: "Не удалось отметить выполнение." };
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status });
  }
}
