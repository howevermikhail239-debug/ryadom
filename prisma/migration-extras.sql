-- Applied once after Prisma migrations by scripts/apply-sql.ts.

CREATE OR REPLACE FUNCTION sync_wgs84_geography()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.location := ST_SetSRID(
    ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision),
    4326
  )::geography;
  RETURN NEW;
END;
$$;

CREATE TRIGGER tasks_sync_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON tasks
FOR EACH ROW EXECUTE FUNCTION sync_wgs84_geography();

CREATE TRIGGER user_locations_sync_location
BEFORE INSERT OR UPDATE OF latitude, longitude ON user_locations
FOR EACH ROW EXECUTE FUNCTION sync_wgs84_geography();

CREATE INDEX tasks_location_gist_idx ON tasks USING GIST (location);
CREATE INDEX user_locations_location_gist_idx ON user_locations USING GIST (location);

ALTER TABLE users
  ADD CONSTRAINT users_identity_required_chk
  CHECK (phone IS NOT NULL OR "telegramId" IS NOT NULL),
  ADD CONSTRAINT users_phone_e164_chk
  CHECK (phone IS NULL OR phone ~ '^\+[1-9][0-9]{7,14}$'),
  ADD CONSTRAINT users_rating_average_chk
  CHECK ("ratingAverage" >= 0 AND "ratingAverage" <= 5),
  ADD CONSTRAINT users_rating_count_chk
  CHECK ("ratingCount" >= 0 AND "completedTasks" >= 0);

ALTER TABLE tasks
  ADD CONSTRAINT tasks_latitude_chk CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT tasks_longitude_chk CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT tasks_price_chk CHECK ("priceKopecks" > 0),
  ADD CONSTRAINT tasks_currency_chk CHECK (currency = 'RUB'),
  ADD CONSTRAINT tasks_radius_chk CHECK ("searchRadiusMeters" BETWEEN 100 AND 10000),
  ADD CONSTRAINT tasks_duration_chk CHECK ("durationMinutes" IS NULL OR "durationMinutes" BETWEEN 5 AND 1440),
  ADD CONSTRAINT tasks_expiry_chk CHECK ("expiresAt" > "createdAt");

ALTER TABLE user_locations
  ADD CONSTRAINT user_locations_latitude_chk CHECK (latitude BETWEEN -90 AND 90),
  ADD CONSTRAINT user_locations_longitude_chk CHECK (longitude BETWEEN -180 AND 180),
  ADD CONSTRAINT user_locations_accuracy_chk CHECK ("accuracyMeters" IS NULL OR "accuracyMeters" >= 0),
  ADD CONSTRAINT user_locations_expiry_chk CHECK ("expiresAt" > "updatedAt");

ALTER TABLE bids
  ADD CONSTRAINT bids_price_chk CHECK ("proposedPriceKopecks" IS NULL OR "proposedPriceKopecks" > 0),
  ADD CONSTRAINT bids_eta_chk CHECK ("etaMinutes" IS NULL OR "etaMinutes" BETWEEN 1 AND 1440);

ALTER TABLE task_matches
  ADD CONSTRAINT task_matches_people_chk CHECK ("customerId" <> "performerId"),
  ADD CONSTRAINT task_matches_price_chk CHECK ("agreedPriceKopecks" > 0);

CREATE UNIQUE INDEX task_matches_one_active_per_task_idx
ON task_matches ("taskId")
WHERE status IN ('CREATED', 'CONFIRMED', 'IN_PROGRESS');

ALTER TABLE reviews
  ADD CONSTRAINT reviews_rating_chk CHECK (rating BETWEEN 1 AND 5),
  ADD CONSTRAINT reviews_people_chk CHECK ("authorId" <> "recipientId");

ALTER TABLE payments
  ADD CONSTRAINT payments_amount_chk CHECK ("amountKopecks" > 0),
  ADD CONSTRAINT payments_currency_chk CHECK (currency = 'RUB');
