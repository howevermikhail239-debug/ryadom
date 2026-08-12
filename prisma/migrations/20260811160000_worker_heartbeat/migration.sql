CREATE TABLE "worker_heartbeats" (
    "id" VARCHAR(40) NOT NULL,
    "startedAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSeenAt" TIMESTAMPTZ(3) NOT NULL,
    "lastSuccessAt" TIMESTAMPTZ(3),
    "lastError" VARCHAR(1000),
    "updatedAt" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "worker_heartbeats_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "worker_heartbeats_lastSeenAt_idx" ON "worker_heartbeats"("lastSeenAt");
