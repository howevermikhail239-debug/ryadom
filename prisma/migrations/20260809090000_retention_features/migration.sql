CREATE TABLE "favorite_places" (
  "id" UUID NOT NULL,
  "userId" UUID NOT NULL,
  "name" VARCHAR(40) NOT NULL,
  "addressLabel" VARCHAR(300),
  "latitude" DECIMAL(9,6) NOT NULL,
  "longitude" DECIMAL(9,6) NOT NULL,
  "location" geography(Point, 4326),
  "createdAt" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" TIMESTAMPTZ(3) NOT NULL,
  CONSTRAINT "favorite_places_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "favorite_places_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX "favorite_places_userId_name_key" ON "favorite_places"("userId", "name");
CREATE INDEX "favorite_places_userId_createdAt_idx" ON "favorite_places"("userId", "createdAt" DESC);
CREATE INDEX "favorite_places_location_gix" ON "favorite_places" USING GIST ("location");

CREATE OR REPLACE FUNCTION sync_favorite_place_geography()
RETURNS trigger AS $$
BEGIN
  NEW.location := ST_SetSRID(ST_MakePoint(NEW.longitude::double precision, NEW.latitude::double precision), 4326)::geography;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER favorite_places_sync_geography
BEFORE INSERT OR UPDATE OF latitude, longitude ON "favorite_places"
FOR EACH ROW EXECUTE FUNCTION sync_favorite_place_geography();

ALTER TABLE "reviews" ADD COLUMN "reaction" VARCHAR(16);
ALTER TABLE "reviews" ADD COLUMN "tags" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
UPDATE "reviews" SET "reaction" = CASE WHEN "rating" >= 5 THEN 'GREAT' WHEN "rating" >= 3 THEN 'OK' ELSE 'BAD' END WHERE "reaction" IS NULL;
ALTER TABLE "reviews" ALTER COLUMN "reaction" SET NOT NULL;
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_reaction_chk" CHECK ("reaction" IN ('GREAT', 'OK', 'BAD'));
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_tags_chk" CHECK ("tags" <@ ARRAY['FAST', 'POLITE', 'ON_TIME', 'QUALITY']::TEXT[]);
