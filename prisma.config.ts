import { config } from "dotenv";
import { defineConfig } from "prisma/config";

config({ path: [".env.production", ".env.local", ".env"], quiet: true });

export default defineConfig({
  schema: "prisma/schema.prisma",
  migrations: {
    path: "prisma/migrations",
  },
  datasource: {
    // Migrations must bypass PgBouncer and connect directly to PostgreSQL.
    url:
      process.env.DIRECT_DATABASE_URL ??
      process.env.DATABASE_URL ??
      "postgresql://prisma:prisma@localhost:5432/prisma",
  },
});
