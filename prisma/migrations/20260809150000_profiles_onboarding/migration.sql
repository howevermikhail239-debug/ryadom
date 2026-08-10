ALTER TABLE "users"
  ADD COLUMN "bio" VARCHAR(500),
  ADD COLUMN "onboardingPassed" BOOLEAN NOT NULL DEFAULT false;

UPDATE "users" AS u
SET "completedTasks" = completed.total
FROM (
  SELECT tm."performerId", COUNT(DISTINCT tm."taskId")::integer AS total
  FROM "task_matches" AS tm
  JOIN "tasks" AS t ON t.id = tm."taskId"
  WHERE tm.status = 'COMPLETED'::"MatchStatus"
    AND t.status = 'COMPLETED'::"TaskStatus"
  GROUP BY tm."performerId"
) AS completed
WHERE u.id = completed."performerId";
