ALTER TABLE "favorite_performers"
ADD CONSTRAINT "favorite_performers_people_check" CHECK ("customerId" <> "performerId");

ALTER TABLE "tasks"
ADD CONSTRAINT "tasks_preferred_performer_check" CHECK ("preferredPerformerId" IS NULL OR "preferredPerformerId" <> "customerId"),
ADD CONSTRAINT "tasks_matching_wave_check" CHECK ("matchingWave" BETWEEN 0 AND 3);
