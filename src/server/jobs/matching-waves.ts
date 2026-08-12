import "server-only";

import { serverEnv } from "@/config/server-env";
import { prisma } from "@/lib/db/prisma";
import { enqueueNotification } from "@/lib/notifications/outbox";
import { formatRubles } from "@/lib/utils";

const WAVE_RADII = [500, 1000, 3000] as const;

type MatchingTask = {
  id: string;
  title: string;
  priceKopecks: number;
  customerId: string;
  categoryId: string;
  isUrgent: boolean;
  matchingWave: number;
};

type MatchingRecipient = { userId: string; telegramEnabled: boolean };

function nextDelayMilliseconds(isUrgent: boolean, completedWave: number) {
  if (completedWave >= WAVE_RADII.length) return null;
  if (isUrgent) return completedWave === 1 ? 60_000 : 90_000;
  return completedWave === 1 ? 3 * 60_000 : 5 * 60_000;
}

export async function processMatchingWaves(limit = 10): Promise<{ tasksClaimed: number; notificationsQueued: number }> {
  const safeLimit = Math.max(1, Math.min(Math.trunc(limit), 50));
  return prisma.$transaction(async (tx) => {
    const tasks = await tx.$queryRaw<MatchingTask[]>`
      SELECT id, title, "priceKopecks", "customerId", "categoryId", "isUrgent", "matchingWave"
      FROM tasks
      WHERE status IN ('PUBLISHED'::"TaskStatus", 'MATCHING'::"TaskStatus")
        AND "expiresAt" > NOW()
        AND "nextMatchingAt" IS NOT NULL
        AND "nextMatchingAt" <= NOW()
        AND ("earlyAccessUntil" IS NULL OR "earlyAccessUntil" <= NOW())
        AND "matchingWave" < ${WAVE_RADII.length}
      ORDER BY "nextMatchingAt", id
      FOR UPDATE SKIP LOCKED
      LIMIT ${safeLimit}
    `;

    let notificationsQueued = 0;
    for (const task of tasks) {
      const nextWave = task.matchingWave + 1;
      const radius = WAVE_RADII[nextWave - 1];
      if (!radius) continue;
      const recipients = await tx.$queryRaw<MatchingRecipient[]>`
        WITH clock AS (
          SELECT (
            EXTRACT(HOUR FROM NOW() AT TIME ZONE 'Europe/Moscow')::int * 60
            + EXTRACT(MINUTE FROM NOW() AT TIME ZONE 'Europe/Moscow')::int
          ) AS minute_of_day
        )
        SELECT
          ul."userId",
          (u."telegramChatId" IS NOT NULL) AS "telegramEnabled"
        FROM user_locations ul
        JOIN users u ON u.id = ul."userId"
        LEFT JOIN notification_preferences preference ON preference."userId" = u.id
        CROSS JOIN clock
        WHERE ul.location IS NOT NULL
          AND ul."expiresAt" > NOW()
          AND u.status = 'ACTIVE'::"UserStatus"
          AND 'PERFORMER'::"UserRole" = ANY(u.roles)
          AND u."availableUntil" > NOW()
          AND (u."cooldownUntil" IS NULL OR u."cooldownUntil" <= NOW())
          AND u.id <> ${task.customerId}::uuid
          AND NOT EXISTS (
            SELECT 1 FROM user_blocks block
            WHERE (block."blockerId" = u.id AND block."blockedId" = ${task.customerId}::uuid)
               OR (block."blockerId" = ${task.customerId}::uuid AND block."blockedId" = u.id)
          )
          AND COALESCE(preference."nearbyEnabled", TRUE)
          AND COALESCE(preference."radiusMeters", 1000) >= ${radius}
          AND (
            preference."quietHoursStart" IS NULL
            OR CASE
              WHEN preference."quietHoursStart" < preference."quietHoursEnd"
                THEN NOT (clock.minute_of_day >= preference."quietHoursStart" AND clock.minute_of_day < preference."quietHoursEnd")
              ELSE NOT (clock.minute_of_day >= preference."quietHoursStart" OR clock.minute_of_day < preference."quietHoursEnd")
            END
          )
          AND (
            NOT EXISTS (
              SELECT 1 FROM notification_preference_categories selected
              WHERE selected."preferenceUserId" = u.id
            )
            OR EXISTS (
              SELECT 1 FROM notification_preference_categories selected
              WHERE selected."preferenceUserId" = u.id AND selected."categoryId" = ${task.categoryId}::uuid
            )
          )
          AND ST_DWithin(
            ul.location,
            (SELECT location FROM tasks WHERE id = ${task.id}::uuid),
            ${radius}
          )
          AND NOT EXISTS (
            SELECT 1 FROM notifications notification
            WHERE notification."taskId" = ${task.id}::uuid
              AND notification."userId" = u.id
              AND notification.type = 'TASK_NEARBY'
          )
        ORDER BY ST_Distance(ul.location, (SELECT location FROM tasks WHERE id = ${task.id}::uuid)), u.id
        LIMIT 200
      `;

      for (const recipient of recipients) {
        await enqueueNotification(tx, {
          userId: recipient.userId,
          taskId: task.id,
          type: "TASK_NEARBY",
          title: nextWave === 1 ? "Новая задача совсем рядом" : "Радиус поиска расширен",
          body: `«${task.title}» — ${formatRubles(task.priceKopecks)}. Можно взять без переписки.`,
          button: { label: "Посмотреть", url: `${serverEnv.APP_URL}/tasks/${task.id}` },
          dedupeKey: `task:${task.id}:nearby:${recipient.userId}`,
          telegramEnabled: recipient.telegramEnabled,
        });
        notificationsQueued += 1;
      }

      const delay = nextDelayMilliseconds(task.isUrgent, nextWave);
      await tx.task.update({
        where: { id: task.id },
        data: {
          status: "MATCHING",
          matchingWave: nextWave,
          earlyAccessUntil: null,
          nextMatchingAt: delay === null ? null : new Date(Date.now() + delay),
        },
      });
    }

    return { tasksClaimed: tasks.length, notificationsQueued };
  }, { isolationLevel: "ReadCommitted", maxWait: 5_000, timeout: 20_000 });
}
