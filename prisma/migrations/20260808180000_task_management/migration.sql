CREATE TYPE "TaskPaymentMethod" AS ENUM ('CASH', 'TRANSFER');

ALTER TABLE "users"
  ADD COLUMN "isTest" BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE "tasks"
  ADD COLUMN "isUrgent" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "paymentMethod" "TaskPaymentMethod" NOT NULL DEFAULT 'CASH';

CREATE INDEX "users_isTest_status_idx" ON "users"("isTest", "status");
CREATE INDEX "tasks_isUrgent_status_idx" ON "tasks"("isUrgent", "status");
