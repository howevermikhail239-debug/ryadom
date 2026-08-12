import "server-only";

import { serverEnv } from "@/config/server-env";
import { prisma } from "@/lib/db/prisma";

type ExpiredTask = { id: string; customerId: string; title: string; version: number };

export async function expirePublishedTasks(limit = 50): Promise<{ expired: number }> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 200));
  const expired = await prisma.$transaction(async (tx) => {
    const tasks = await tx.$queryRaw<ExpiredTask[]>`
      WITH candidates AS (
        SELECT task.id
        FROM tasks AS task
        WHERE task.status IN ('PUBLISHED'::"TaskStatus", 'MATCHING'::"TaskStatus")
          AND task."expiresAt" <= NOW()
          AND NOT EXISTS (
            SELECT 1 FROM task_matches AS match
            WHERE match."taskId" = task.id
              AND match.status IN ('CREATED'::"MatchStatus", 'CONFIRMED'::"MatchStatus", 'IN_PROGRESS'::"MatchStatus")
          )
        ORDER BY task."expiresAt", task.id
        FOR UPDATE SKIP LOCKED
        LIMIT ${safeLimit}
      )
      UPDATE tasks AS task
      SET status = 'EXPIRED'::"TaskStatus", version = task.version + 1, "updatedAt" = NOW()
      FROM candidates
      WHERE task.id = candidates.id
        AND task.status IN ('PUBLISHED'::"TaskStatus", 'MATCHING'::"TaskStatus")
      RETURNING task.id, task."customerId", task.title, task.version
    `;
    if (tasks.length === 0) return tasks;

    const recipients = await tx.user.findMany({
      where: { id: { in: tasks.map((task) => task.customerId) } },
      select: { id: true, telegramChatId: true },
    });
    const telegramByUser = new Map(recipients.map((user) => [user.id, Boolean(user.telegramChatId)]));
    for (const task of tasks) {
      const telegramEnabled = telegramByUser.get(task.customerId) ?? false;
      await tx.notification.upsert({
        where: { dedupeKey: `task:${task.id}:expired:${task.version}` },
        create: {
          userId: task.customerId,
          taskId: task.id,
          channel: telegramEnabled ? "TELEGRAM" : "IN_APP",
          status: telegramEnabled ? "PENDING" : "DELIVERED",
          type: "TASK_EXPIRED",
          title: "Срок задачи истёк",
          body: `«${task.title}» больше не показывается исполнителям. Её можно повторить в один тап.`,
          payload: { button: { label: "Открыть задачу", url: `${serverEnv.APP_URL}/tasks/${task.id}` } },
          dedupeKey: `task:${task.id}:expired:${task.version}`,
          sentAt: telegramEnabled ? null : new Date(),
        },
        update: {},
      });
    }
    return tasks;
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 10_000 });
  return { expired: expired.length };
}
