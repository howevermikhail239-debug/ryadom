import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { config } from "dotenv";
import { Client } from "pg";

config({ path: [".env.production", ".env.local", ".env"], quiet: true });

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error("DIRECT_DATABASE_URL или DATABASE_URL не задан.");

const migrationName = "20260808000100_postgis_extras";
const sqlPath = resolve(process.cwd(), "prisma", "migration-extras.sql");
const client = new Client({ connectionString });

async function main() {
  await client.connect();
  await client.query("BEGIN");
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", [migrationName]);
    await client.query(`
      CREATE TABLE IF NOT EXISTS "_app_sql_migrations" (
        name text PRIMARY KEY,
        "appliedAt" timestamptz NOT NULL DEFAULT now()
      )
    `);

    const applied = await client.query<{ exists: boolean }>(
      `SELECT EXISTS(SELECT 1 FROM "_app_sql_migrations" WHERE name = $1) AS exists`,
      [migrationName],
    );

    if (!applied.rows[0]?.exists) {
      const sql = await readFile(sqlPath, "utf8");
      await client.query(sql);
      await client.query(`INSERT INTO "_app_sql_migrations" (name) VALUES ($1)`, [migrationName]);
      console.log(`Applied SQL migration: ${migrationName}`);
    } else {
      console.log(`SQL migration already applied: ${migrationName}`);
    }

    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    await client.end();
  }
}

main().catch((error: unknown) => {
  console.error("Failed to apply SQL migration", error);
  process.exitCode = 1;
});
