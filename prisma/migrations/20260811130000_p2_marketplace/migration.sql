CREATE TYPE "ReportReason" AS ENUM ('SPAM', 'FRAUD', 'PROHIBITED', 'ABUSE', 'OTHER');
CREATE TYPE "ReportStatus" AS ENUM ('OPEN', 'REVIEWED', 'CLOSED');

ALTER TABLE "tasks"
ADD COLUMN "repeatOfTaskId" UUID,
ADD COLUMN "preferredPerformerId" UUID,
ADD COLUMN "earlyAccessUntil" TIMESTAMPTZ(3),
ADD COLUMN "matchingWave" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "nextMatchingAt" TIMESTAMPTZ(3);

CREATE TABLE "favorite_performers" (
  "customerId" UUID NOT NULL,
  "performerId" UUID NOT NULL,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "favorite_performers_pkey" PRIMARY KEY ("customerId", "performerId")
);

CREATE TABLE "notification_preferences" (
  "userId" UUID NOT NULL,
  "nearbyEnabled" BOOLEAN NOT NULL DEFAULT TRUE,
  "radiusMeters" INTEGER NOT NULL DEFAULT 1000,
  "quietHoursStart" INTEGER,
  "quietHoursEnd" INTEGER,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "notification_preferences_pkey" PRIMARY KEY ("userId"),
  CONSTRAINT "notification_preferences_radius_check" CHECK ("radiusMeters" IN (500, 1000, 3000, 5000)),
  CONSTRAINT "notification_preferences_quiet_start_check" CHECK ("quietHoursStart" IS NULL OR "quietHoursStart" BETWEEN 0 AND 1439),
  CONSTRAINT "notification_preferences_quiet_end_check" CHECK ("quietHoursEnd" IS NULL OR "quietHoursEnd" BETWEEN 0 AND 1439),
  CONSTRAINT "notification_preferences_quiet_pair_check" CHECK (("quietHoursStart" IS NULL) = ("quietHoursEnd" IS NULL))
);

CREATE TABLE "notification_preference_categories" (
  "preferenceUserId" UUID NOT NULL,
  "categoryId" UUID NOT NULL,
  CONSTRAINT "notification_preference_categories_pkey" PRIMARY KEY ("preferenceUserId", "categoryId")
);

CREATE TABLE "reports" (
  "id" UUID NOT NULL,
  "reporterId" UUID NOT NULL,
  "taskId" UUID,
  "reportedUserId" UUID,
  "reason" "ReportReason" NOT NULL,
  "details" VARCHAR(1000),
  "status" "ReportStatus" NOT NULL DEFAULT 'OPEN',
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "reviewedAt" TIMESTAMPTZ(3),
  CONSTRAINT "reports_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "reports_single_target_check" CHECK (("taskId" IS NOT NULL)::int + ("reportedUserId" IS NOT NULL)::int = 1)
);

ALTER TABLE "tasks" ADD CONSTRAINT "tasks_repeatOfTaskId_fkey" FOREIGN KEY ("repeatOfTaskId") REFERENCES "tasks"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_preferredPerformerId_fkey" FOREIGN KEY ("preferredPerformerId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "favorite_performers" ADD CONSTRAINT "favorite_performers_customerId_fkey" FOREIGN KEY ("customerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "favorite_performers" ADD CONSTRAINT "favorite_performers_performerId_fkey" FOREIGN KEY ("performerId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preference_categories" ADD CONSTRAINT "notification_preference_categories_preferenceUserId_fkey" FOREIGN KEY ("preferenceUserId") REFERENCES "notification_preferences"("userId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "notification_preference_categories" ADD CONSTRAINT "notification_preference_categories_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "categories"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "reports" ADD CONSTRAINT "reports_reportedUserId_fkey" FOREIGN KEY ("reportedUserId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "tasks_status_nextMatchingAt_idx" ON "tasks"("status", "nextMatchingAt");
CREATE INDEX "tasks_preferredPerformerId_earlyAccessUntil_idx" ON "tasks"("preferredPerformerId", "earlyAccessUntil");
CREATE INDEX "tasks_repeatOfTaskId_idx" ON "tasks"("repeatOfTaskId");
CREATE INDEX "favorite_performers_performerId_createdAt_idx" ON "favorite_performers"("performerId", "createdAt" DESC);
CREATE INDEX "notification_preference_categories_categoryId_preferenceUserId_idx" ON "notification_preference_categories"("categoryId", "preferenceUserId");
CREATE INDEX "reports_status_createdAt_idx" ON "reports"("status", "createdAt");
CREATE INDEX "reports_taskId_createdAt_idx" ON "reports"("taskId", "createdAt");
CREATE INDEX "reports_reportedUserId_createdAt_idx" ON "reports"("reportedUserId", "createdAt");
CREATE UNIQUE INDEX "reports_reporter_task_unique" ON "reports"("reporterId", "taskId") WHERE "taskId" IS NOT NULL;
CREATE UNIQUE INDEX "reports_reporter_user_unique" ON "reports"("reporterId", "reportedUserId") WHERE "reportedUserId" IS NOT NULL;
