ALTER TABLE "users" DROP CONSTRAINT IF EXISTS "users_phone_e164_chk";

ALTER TABLE "users"
  ADD CONSTRAINT "users_phone_e164_chk"
  CHECK ("phone" IS NULL OR "phone" ~ '^\+[1-9][0-9]{7,14}$');
