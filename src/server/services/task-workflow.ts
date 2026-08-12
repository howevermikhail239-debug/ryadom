import "server-only";

import { prisma } from "@/lib/db/prisma";
import { ACTIVE_MATCH_STATUSES, isTaskAvailableStatus } from "@/lib/tasks/policy";
import { assertUsersCanInteract } from "@/server/services/user-blocks";

const TRANSACTION_OPTIONS = {
  isolationLevel: "Serializable" as const,
  maxWait: 5_000,
  timeout: 10_000,
};
const MAX_SERIALIZATION_ATTEMPTS = 3;

type WorkflowUser = { id: string; roles: string[] };

function prismaErrorCode(error: unknown) {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code ?? "")
    : "";
}

function isSerializationFailure(error: unknown) {
  if (prismaErrorCode(error) === "P2034") return true;
  if (prismaErrorCode(error) !== "P2010") return false;
  const message = error instanceof Error ? error.message : "";
  if (/\b40001\b|could not serialize/i.test(message)) return true;
  if (typeof error !== "object" || error === null || !("meta" in error)) return false;
  return JSON.stringify((error as { meta?: unknown }).meta).includes("40001");
}

async function withSerializableRetry<T>(operation: () => Promise<T>): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= MAX_SERIALIZATION_ATTEMPTS; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      lastError = error;
      if (!isSerializationFailure(error) || attempt === MAX_SERIALIZATION_ATTEMPTS) throw error;
      await new Promise((resolve) => setTimeout(resolve, attempt * 20));
    }
  }
  throw lastError;
}

export async function acceptTask(taskId: string, user: WorkflowUser, idempotencyKey: string) {
  if (!user.roles.includes("PERFORMER")) throw new Error("PERFORMER_REQUIRED");

  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const taskRows = await tx.$queryRaw<Array<{
        id: string;
        customerId: string;
        priceKopecks: number;
        status: string;
        expiresAt: Date;
        preferredPerformerId: string | null;
        earlyAccessUntil: Date | null;
      }>>`
        SELECT id, "customerId", "priceKopecks", status, "expiresAt", "preferredPerformerId", "earlyAccessUntil"
        FROM tasks
        WHERE id = ${taskId}::uuid
        FOR UPDATE
      `;
      const task = taskRows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");

      // Keep the global lock order task -> user. Matching-wave jobs lock the task
      // first and may then enqueue a notification referencing a user; reversing
      // this order here creates a task/user deadlock during early-access release.
      const performerRows = await tx.$queryRaw<Array<{ cooldownUntil: Date | null }>>`
        SELECT "cooldownUntil" FROM users WHERE id = ${user.id}::uuid FOR UPDATE
      `;
      if (!performerRows[0]) throw new Error("USER_NOT_FOUND");
      if (performerRows[0].cooldownUntil && performerRows[0].cooldownUntil > new Date()) {
        throw new Error("COOLDOWN_ACTIVE");
      }

      // These checks intentionally happen after both locks. Concurrent retries with
      // the same key now observe the committed match instead of reporting a conflict.
      const exactRetry = await tx.taskMatch.findUnique({
        where: { idempotencyKey },
        select: { id: true, taskId: true, performerId: true },
      });
      if (exactRetry) {
        if (exactRetry.performerId !== user.id || exactRetry.taskId !== taskId) {
          throw new Error("IDEMPOTENCY_CONFLICT");
        }
        return { ...exactRetry, changed: false };
      }

      const activeMatch = await tx.taskMatch.findFirst({
        where: { taskId, status: { in: [...ACTIVE_MATCH_STATUSES] } },
        select: { id: true, taskId: true, performerId: true },
      });
      if (activeMatch?.performerId === user.id) return { ...activeMatch, changed: false };

      if (task.customerId === user.id) throw new Error("OWN_TASK");
      await assertUsersCanInteract(tx, user.id, task.customerId);
      if (task.expiresAt <= new Date()) throw new Error("TASK_EXPIRED");
      if (activeMatch || !isTaskAvailableStatus(task.status)) throw new Error("TASK_ALREADY_TAKEN");
      if (task.earlyAccessUntil && task.earlyAccessUntil > new Date() && task.preferredPerformerId !== user.id) {
        throw new Error("EARLY_ACCESS_RESTRICTED");
      }

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

      const now = new Date();
      const created = await tx.taskMatch.create({
        data: {
          taskId,
          bidId: bid.id,
          customerId: task.customerId,
          performerId: user.id,
          agreedPriceKopecks: task.priceKopecks,
          idempotencyKey,
          status: "IN_PROGRESS",
          startedAt: now,
        },
        select: { id: true, taskId: true, performerId: true },
      });

      await tx.task.update({
        where: { id: taskId },
        data: { status: "IN_PROGRESS", assignedAt: now, version: { increment: 1 } },
      });
      await tx.bid.updateMany({
        where: { taskId, id: { not: bid.id }, status: "PENDING" },
        data: { status: "REJECTED" },
      });
      return { ...created, changed: true };
    }, TRANSACTION_OPTIONS),
  );
}

export async function markTaskCompleted(taskId: string, user: WorkflowUser) {
  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const taskRows = await tx.$queryRaw<Array<{ id: string; status: string }>>`
        SELECT id, status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE
      `;
      const task = taskRows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");

      const match = await tx.taskMatch.findFirst({ where: { taskId, performerId: user.id }, orderBy: { createdAt: "desc" } });
      if (!match) throw new Error("NOT_ASSIGNED_PERFORMER");
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
    }, TRANSACTION_OPTIONS),
  );
}

export async function confirmTaskCompletion(taskId: string, user: WorkflowUser) {
  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ id: string; customerId: string; status: string }>>`
        SELECT id, "customerId", status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE
      `;
      const task = rows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (!user.roles.includes("ADMIN") && task.customerId !== user.id) throw new Error("NOT_TASK_CUSTOMER");

      const match = await tx.taskMatch.findFirst({ where: { taskId, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
      if (task.status === "COMPLETED") return { changed: false };
      if (!match || task.status !== "IN_PROGRESS") throw new Error("TASK_CANNOT_CONFIRM");

      const now = new Date();
      await tx.taskMatch.update({ where: { id: match.id }, data: { confirmedAt: now } });
      await tx.task.update({ where: { id: taskId }, data: { status: "COMPLETED", completedAt: now, version: { increment: 1 } } });
      await tx.user.update({ where: { id: match.performerId }, data: { completedTasks: { increment: 1 } } });
      return { changed: true };
    }, TRANSACTION_OPTIONS),
  );
}

export async function requestTaskChanges(taskId: string, user: WorkflowUser) {
  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ customerId: string; title: string; status: string }>>`
        SELECT "customerId", title, status FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE
      `;
      const task = rows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      if (task.customerId !== user.id && !user.roles.includes("ADMIN")) throw new Error("NOT_TASK_CUSTOMER");

      const match = await tx.taskMatch.findFirst({ where: { taskId, status: "COMPLETED" }, orderBy: { completedAt: "desc" } });
      if (!match || task.status !== "IN_PROGRESS") throw new Error("TASK_CANNOT_REQUEST_CHANGES");

      await tx.taskMatch.update({ where: { id: match.id }, data: { status: "IN_PROGRESS", completedAt: null, confirmedAt: null } });
      const updated = await tx.task.update({ where: { id: taskId }, data: { version: { increment: 1 } }, select: { version: true } });
      return { performerId: match.performerId, title: task.title, matchId: match.id, version: updated.version };
    }, TRANSACTION_OPTIONS),
  );
}

export async function withdrawFromTask(taskId: string, user: WorkflowUser) {
  return withSerializableRetry(() =>
    prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<Array<{ title: string; customerId: string; status: string; expiresAt: Date }>>`
        SELECT title, "customerId", status, "expiresAt" FROM tasks WHERE id = ${taskId}::uuid FOR UPDATE
      `;
      const task = rows[0];
      if (!task) throw new Error("TASK_NOT_FOUND");
      await tx.$queryRaw`SELECT id FROM users WHERE id = ${user.id}::uuid FOR UPDATE`;

      const match = await tx.taskMatch.findFirst({ where: { taskId, performerId: user.id, status: "IN_PROGRESS" }, orderBy: { createdAt: "desc" } });
      if (!match) throw new Error("NOT_ACTIVE_PERFORMER");
      if (task.status !== "IN_PROGRESS") throw new Error("TASK_CANNOT_WITHDRAW");

      const now = new Date();
      const cooldownUntil = new Date(now.getTime() + 30 * 60_000);
      await tx.user.update({ where: { id: user.id }, data: { cooldownUntil } });
      await tx.taskMatch.update({ where: { id: match.id }, data: { status: "CANCELLED", cancelledAt: now } });
      if (match.bidId) await tx.bid.update({ where: { id: match.bidId }, data: { status: "WITHDRAWN" } });
      await tx.task.update({
        where: { id: taskId },
        data: {
          status: "PUBLISHED",
          assignedAt: null,
          preferredPerformerId: null,
          earlyAccessUntil: null,
          matchingWave: 0,
          nextMatchingAt: now,
          expiresAt: task.expiresAt > now ? task.expiresAt : new Date(now.getTime() + 60 * 60_000),
          version: { increment: 1 },
        },
      });
      return { customerId: task.customerId, title: task.title, cooldownUntil };
    }, TRANSACTION_OPTIONS),
  );
}
