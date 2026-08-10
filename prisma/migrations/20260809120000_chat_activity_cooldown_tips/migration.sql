ALTER TABLE "users" ADD COLUMN "cooldownUntil" TIMESTAMPTZ(3);
ALTER TABLE "users" ADD COLUMN "lastLocation" geography(Point, 4326);
CREATE INDEX "users_cooldownUntil_idx" ON "users"("cooldownUntil");
CREATE INDEX "users_lastLocation_gix" ON "users" USING GIST ("lastLocation");

ALTER TABLE "tasks" ADD COLUMN "tipAmount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tasks" ADD CONSTRAINT "tasks_tip_amount_nonnegative_chk" CHECK ("tipAmount" >= 0);

CREATE TABLE "messages" (
  "id" UUID NOT NULL,
  "taskId" UUID NOT NULL,
  "senderId" UUID NOT NULL,
  "text" VARCHAR(1000),
  "imageUrl" TEXT,
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "messages_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "messages_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "messages_senderId_fkey" FOREIGN KEY ("senderId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "messages_content_chk" CHECK (NULLIF(BTRIM(COALESCE("text", '')), '') IS NOT NULL OR "imageUrl" IS NOT NULL)
);

CREATE INDEX "messages_taskId_createdAt_idx" ON "messages"("taskId", "createdAt");
CREATE INDEX "messages_senderId_createdAt_idx" ON "messages"("senderId", "createdAt" DESC);
