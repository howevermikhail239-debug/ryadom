import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("disabling availability removes ephemeral location without violating expiry constraint", { skip: !testDatabaseUrl }, async () => {
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??= "integration-test-auth-secret-at-least-32-chars";
  process.env.OTP_PEPPER ??= "integration-test-otp-pepper-at-least-32-chars";
  process.env.YANDEX_GEOCODER_API_KEY ??= "integration-test-yandex-geocoder-key";
  process.env.TELEGRAM_BOT_TOKEN ??= "0000000000:INTEGRATION_TEST_TOKEN_123456789";
  process.env.TELEGRAM_WEBHOOK_SECRET ??= "integration-test-webhook-secret-at-least-32-chars";

  const [{ prisma }, { setUserAvailability }] = await Promise.all([
    import("@/lib/db/prisma"),
    import("@/server/services/user-availability"),
  ]);
  const user = await prisma.user.create({
    data: {
      displayName: `availability-${randomUUID().slice(0, 8)}`,
      roles: ["CUSTOMER", "PERFORMER"],
      status: "ACTIVE",
      availableUntil: new Date(Date.now() + 60 * 60_000),
    },
  });

  try {
    await prisma.userLocation.create({
      data: {
        userId: user.id,
        latitude: 55.751244,
        longitude: 37.618423,
        consentedAt: new Date(),
        expiresAt: new Date(Date.now() + 60 * 60_000),
      },
    });
    await prisma.$executeRaw`
      UPDATE users
      SET "lastLocation" = ST_SetSRID(ST_MakePoint(37.618423, 55.751244), 4326)::geography
      WHERE id = ${user.id}::uuid
    `;

    const result = await setUserAvailability(user.id, 0);
    const updated = await prisma.user.findUniqueOrThrow({
      where: { id: user.id },
      select: { availableUntil: true },
    });
    const locationRows = await prisma.$queryRaw<Array<{ hasLocation: boolean }>>`
      SELECT ("lastLocation" IS NOT NULL) AS "hasLocation"
      FROM users
      WHERE id = ${user.id}::uuid
    `;

    assert.equal(result.availableUntil, null);
    assert.equal(result.locationActive, false);
    assert.equal(updated.availableUntil, null);
    assert.equal(await prisma.userLocation.count({ where: { userId: user.id } }), 0);
    assert.equal(locationRows[0]?.hasLocation, false);
  } finally {
    await prisma.user.delete({ where: { id: user.id } });
    await prisma.$disconnect();
  }
});
