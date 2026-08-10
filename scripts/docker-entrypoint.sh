#!/bin/sh
set -eu

echo "Applying Prisma migrations..."
./node_modules/.bin/prisma migrate deploy

echo "Applying PostGIS triggers and database constraints..."
./node_modules/.bin/tsx scripts/apply-sql.ts

echo "Seeding reference categories..."
./node_modules/.bin/tsx prisma/seed.ts

echo "Starting Next.js..."
exec "$@"
