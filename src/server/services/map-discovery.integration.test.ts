import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("PostGIS map discovery respects radius, status, blocks and executor presence privacy", { skip: !testDatabaseUrl, timeout: 60_000 }, async () => {
  Object.assign(process.env, { NODE_ENV: "test", DATABASE_URL: testDatabaseUrl, DIRECT_DATABASE_URL: testDatabaseUrl });
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??= "integration-test-auth-secret-at-least-32-chars";
  process.env.OTP_PEPPER ??= "integration-test-otp-pepper-at-least-32-chars";
  process.env.YANDEX_GEOCODER_API_KEY ??= "integration-test-yandex-geocoder-key";
  process.env.TELEGRAM_BOT_TOKEN ??= "0000000000:INTEGRATION_TEST_TOKEN_123456789";
  process.env.TELEGRAM_WEBHOOK_SECRET ??= "integration-test-webhook-secret-at-least-32-chars";

  const { prisma } = await import("@/lib/db/prisma");
  const suffix = randomUUID().slice(0, 8);
  const base = { latitude: 55.751244, longitude: 37.618423 };
  const category = await prisma.category.create({ data: { slug: `map-discovery-${suffix}`, name: "Map discovery test", icon: "map" } });
  const users = await Promise.all(["viewer", "customer", "blocked-customer", "performer", "blocked-performer", "expired-performer"].map((name, index) => prisma.user.create({
    data: {
      displayName: `${name}-${suffix}`,
      telegramId: BigInt(`98${Date.now().toString().slice(-8)}${index}`),
      roles: index === 0 ? ["CUSTOMER", "PERFORMER"] : index < 3 ? ["CUSTOMER"] : ["CUSTOMER", "PERFORMER"],
      status: "ACTIVE",
      lastSeenAt: new Date(),
      availableUntil: index >= 3 && index < 5 ? new Date(Date.now() + 60 * 60_000) : null,
    },
  })));
  const [viewer, customer, blockedCustomer, performer, blockedPerformer, expiredPerformer] = users;
  const taskIds: string[] = [];

  async function createTask(label: string, distance: number, status: "PUBLISHED" | "CANCELLED" = "PUBLISHED", ownerId = customer.id) {
    const task = await prisma.task.create({ data: {
      customerId: ownerId,
      categoryId: category.id,
      title: `${label}-${suffix}`,
      description: "Map discovery integration test task",
      priceKopecks: 50_000,
      latitude: base.latitude + distance / 111_320,
      longitude: base.longitude + 0.0000047,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      publishedAt: new Date(),
      status,
    } });
    taskIds.push(task.id);
    return task;
  }

  async function nearbyTaskIds(radius: number) {
    const rows = await prisma.$queryRaw<Array<{ id: string; latitude: string; longitude: string }>>`
      SELECT t.id, ROUND(t.latitude, 3)::text AS latitude, ROUND(t.longitude, 3)::text AS longitude
      FROM tasks t
      WHERE t.status IN ('PUBLISHED'::"TaskStatus", 'MATCHING'::"TaskStatus")
        AND t."categoryId" = ${category.id}::uuid
        AND t."expiresAt" > NOW()
        AND t.location IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks block
          WHERE (block."blockerId" = ${viewer.id}::uuid AND block."blockedId" = t."customerId")
             OR (block."blockerId" = t."customerId" AND block."blockedId" = ${viewer.id}::uuid)
        )
        AND ST_DWithin(t.location, ST_SetSRID(ST_MakePoint(${base.longitude}, ${base.latitude}), 4326)::geography, ${radius})
      ORDER BY t.id
    `;
    return rows;
  }

  try {
    const inside500 = await createTask("inside-500", 250);
    const inside1000 = await createTask("inside-1000", 750);
    const inside3000 = await createTask("inside-3000", 2000);
    await createTask("outside-3000", 3500);
    await createTask("cancelled", 100, "CANCELLED");
    await createTask("blocked", 100, "PUBLISHED", blockedCustomer.id);
    await prisma.userBlock.create({ data: { blockerId: viewer.id, blockedId: blockedCustomer.id } });
    await prisma.userBlock.create({ data: { blockerId: viewer.id, blockedId: blockedPerformer.id } });

    assert.deepEqual((await nearbyTaskIds(500)).map((row) => row.id), [inside500.id]);
    assert.deepEqual(new Set((await nearbyTaskIds(1000)).map((row) => row.id)), new Set([inside500.id, inside1000.id]));
    assert.deepEqual(new Set((await nearbyTaskIds(3000)).map((row) => row.id)), new Set([inside500.id, inside1000.id, inside3000.id]));
    const privacyRow = (await nearbyTaskIds(500))[0];
    assert.notEqual(Number(privacyRow.latitude), base.latitude + 250 / 111_320);
    assert.equal(privacyRow.latitude.split(".")[1]?.length, 3);

    for (const [user, offset] of [[viewer, 0], [performer, 0.001], [blockedPerformer, 0.002], [expiredPerformer, 0.003]] as const) {
      await prisma.$executeRaw`
        UPDATE users SET "lastLocation" = ST_SetSRID(ST_MakePoint(${base.longitude + offset}, ${base.latitude}), 4326)::geography
        WHERE id = ${user.id}::uuid
      `;
    }
    const presence = await prisma.$queryRaw<Array<{ latitude: number; longitude: number }>>`
      SELECT ROUND(ST_Y(u."lastLocation"::geometry)::numeric, 3)::float8 AS latitude,
             ROUND(ST_X(u."lastLocation"::geometry)::numeric, 3)::float8 AS longitude
      FROM users u
      WHERE u.status = 'ACTIVE'::"UserStatus"
        AND 'PERFORMER'::"UserRole" = ANY(u.roles)
        AND u."availableUntil" > NOW()
        AND (u."cooldownUntil" IS NULL OR u."cooldownUntil" <= NOW())
        AND u."lastSeenAt" > NOW() - INTERVAL '30 minutes'
        AND u."lastLocation" IS NOT NULL
        AND u.id <> ${viewer.id}::uuid
        AND NOT EXISTS (
          SELECT 1 FROM user_blocks block
          WHERE (block."blockerId" = ${viewer.id}::uuid AND block."blockedId" = u.id)
             OR (block."blockerId" = u.id AND block."blockedId" = ${viewer.id}::uuid)
        )
        AND ST_DWithin(u."lastLocation", ST_SetSRID(ST_MakePoint(${base.longitude}, ${base.latitude}), 4326)::geography, 3000)
    `;
    assert.equal(presence.length, 1);
    assert.deepEqual(Object.keys(presence[0]).sort(), ["latitude", "longitude"]);
    assert.equal(presence[0].longitude, Number((base.longitude + 0.001).toFixed(3)));
  } finally {
    await prisma.userBlock.deleteMany({ where: { OR: [{ blockerId: { in: users.map((user) => user.id) } }, { blockedId: { in: users.map((user) => user.id) } }] } });
    await prisma.task.deleteMany({ where: { id: { in: taskIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  }
});
