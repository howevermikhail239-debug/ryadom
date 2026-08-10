import { randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

import { requireCurrentUser } from "@/lib/auth/session";
import { prisma } from "@/lib/db/prisma";
import { assertSameOrigin } from "@/lib/http/security";
import { notifyMatchCreated } from "@/lib/telegram/bot";

export const runtime = "nodejs";

const paramsSchema = z.object({ id: z.string().uuid() });
const keySchema = z.string().uuid();

type LockedTask = {
  id: string;
  customerId: string;
  priceKopecks: number;
  status: "PUBLISHED" | "MATCHING" | "ASSIGNED" | "IN_PROGRESS" | "COMPLETED" | "CANCELLED" | "EXPIRED";
  expiresAt: Date;
};

export async function POST(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    assertSameOrigin(request);
    const user = await requireCurrentUser();
    const { id: taskId } = paramsSchema.parse(await context.params);
    const suppliedKey = request.headers.get("idempotency-key");
    const idempotencyKey = suppliedKey ? keySchema.parse(suppliedKey) : randomUUID();

    const match = await prisma.$transaction(
      async (tx) => {
        const retry = await tx.taskMatch.findFirst({
          where: {
            OR: [
              { idempotencyKey },
              { taskId, performerId: user.id, status: { in: ["CREATED", "CONFIRMED", "IN_PROGRESS"] } },
            ],
          },
          select: { id: true, taskId: true, performerId: true },
        });
        if (retry) {
          if (retry.performerId !== user.id || retry.taskId !== taskId) throw new Error("IDEMPOTENCY_CONFLICT");
          return retry;
        }

        const performerRows = await tx.$queryRaw<Array<{ cooldownUntil: Date | null }>>`
          SELECT "cooldownUntil" FROM users WHERE id = ${user.id}::uuid FOR UPDATE
        `;
        if (performerRows[0]?.cooldownUntil && performerRows[0].cooldownUntil > new Date()) throw new Error("COOLDOWN_ACTIVE");

        const rows = await tx.$queryRaw<LockedTask[]>`
          SELECT id, "customerId", "priceKopecks", status, "expiresAt"
          FROM tasks
          WHERE id = ${taskId}::uuid
          FOR UPDATE
        `;
        const task = rows[0];
        if (!task) throw new Error("TASK_NOT_FOUND");
        if (task.customerId === user.id) throw new Error("OWN_TASK");
        if (!user.roles.includes("PERFORMER")) throw new Error("PERFORMER_REQUIRED");
        if (task.expiresAt <= new Date()) throw new Error("TASK_EXPIRED");
        if (task.status !== "PUBLISHED" && task.status !== "MATCHING") throw new Error("TASK_ALREADY_TAKEN");

        const bid = await tx.bid.upsert({
          where: { taskId_performerId: { taskId, performerId: user.id } },
          create: {
            taskId,
            performerId: user.id,
            proposedPriceKopecks: task.priceKopecks,
            status: "ACCEPTED",
          },
          update: { proposedPriceKopecks: task.priceKopecks, status: "ACCEPTED" },
          select: { id: true },
        });

        const created = await tx.taskMatch.create({
          data: {
            taskId,
            bidId: bid.id,
            customerId: task.customerId,
            performerId: user.id,
            agreedPriceKopecks: task.priceKopecks,
            idempotencyKey,
            status: "IN_PROGRESS",
            startedAt: new Date(),
          },
          select: { id: true, taskId: true, performerId: true },
        });

        await tx.task.update({
          where: { id: taskId },
          data: { status: "IN_PROGRESS", assignedAt: new Date(), version: { increment: 1 } },
        });

        await tx.bid.updateMany({
          where: { taskId, id: { not: bid.id }, status: "PENDING" },
          data: { status: "REJECTED" },
        });

        return created;
      },
      { isolationLevel: "Serializable", maxWait: 5000, timeout: 10_000 },
    );

    await notifyMatchCreated(match.id).catch(() => undefined);
    return NextResponse.json({ ok: true, matchId: match.id });
  } catch (error) {
    const message = error instanceof Error ? error.message : "MATCH_FAILED";
    const responseByCode: Record<string, { status: number; error: string }> = {
      UNAUTHORIZED: { status: 401, error: "Войдите, чтобы взять задачу." },
      TASK_NOT_FOUND: { status: 404, error: "Задача не найдена." },
      OWN_TASK: { status: 409, error: "Нельзя взять собственную задачу." },
      PERFORMER_REQUIRED: { status: 403, error: "Включите роль исполнителя в профиле." },
      TASK_EXPIRED: { status: 409, error: "Срок задачи уже истёк." },
      TASK_ALREADY_TAKEN: { status: 409, error: "Эту задачу уже взял другой исполнитель." },
      IDEMPOTENCY_CONFLICT: { status: 409, error: "Конфликт повторного запроса." },
      COOLDOWN_ACTIVE: { status: 429, error: "После отказа от задачи поиск временно недоступен." },
      INVALID_ORIGIN: { status: 403, error: "Запрос отклонён." },
      P2034: { status: 409, error: "Кто-то взял задачу одновременно с вами. Обновите страницу." },
      P2002: { status: 409, error: "Эту задачу уже взял другой исполнитель." },
    };
    const prismaCode = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    const response = responseByCode[message] ?? responseByCode[prismaCode] ?? { status: 500, error: "Не удалось взять задачу." };
    return NextResponse.json({ ok: false, error: response.error }, { status: response.status });
  }
}
