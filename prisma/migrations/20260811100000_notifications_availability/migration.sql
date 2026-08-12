ALTER TABLE "users"
ADD COLUMN "availableUntil" TIMESTAMPTZ(3);

ALTER TABLE "notifications"
ADD COLUMN "processingAt" TIMESTAMPTZ(3),
ADD COLUMN "readAt" TIMESTAMPTZ(3);

CREATE INDEX "users_status_availableUntil_idx"
ON "users"("status", "availableUntil");

CREATE INDEX "notifications_userId_readAt_createdAt_idx"
ON "notifications"("userId", "readAt", "createdAt" DESC);

CREATE INDEX "notifications_delivery_claim_idx"
ON "notifications"("nextAttemptAt", "processingAt", "createdAt")
WHERE "channel" = 'TELEGRAM'::"NotificationChannel"
  AND "status" IN ('PENDING'::"NotificationStatus", 'FAILED'::"NotificationStatus");
