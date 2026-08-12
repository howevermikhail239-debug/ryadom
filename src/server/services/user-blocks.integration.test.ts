import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("a block prevents Fast Match and removes favorites in both directions", { skip: !testDatabaseUrl, timeout: 30_000 }, async () => {
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??= "integration-test-auth-secret-at-least-32-chars";
  process.env.OTP_PEPPER ??= "integration-test-otp-pepper-at-least-32-chars";
  process.env.YANDEX_GEOCODER_API_KEY ??= "integration-test-yandex-geocoder-key";
  process.env.TELEGRAM_BOT_TOKEN ??= "0000000000:INTEGRATION_TEST_TOKEN_123456789";
  process.env.TELEGRAM_WEBHOOK_SECRET ??= "integration-test-webhook-secret-at-least-32-chars";

  const [{ prisma }, { acceptTask }, { blockUser }] = await Promise.all([
    import("@/lib/db/prisma"),
    import("@/server/services/task-workflow"),
    import("@/server/services/user-blocks"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.category.create({ data: { slug: `block-${suffix}`, name: "Block test", icon: "test" } });
  const [customer, performer] = await Promise.all([
    prisma.user.create({ data: { displayName: `customer-${suffix}`, telegramId: BigInt(`981${Date.now().toString().slice(-9)}`), roles: ["CUSTOMER"], status: "ACTIVE" } }),
    prisma.user.create({ data: { displayName: `performer-${suffix}`, telegramId: BigInt(`982${Date.now().toString().slice(-9)}`), roles: ["CUSTOMER", "PERFORMER"], status: "ACTIVE" } }),
  ]);
  const task = await prisma.task.create({ data: { customerId: customer.id, categoryId: category.id, title: `blocked-${suffix}`, description: "Blocked matching integration test", priceKopecks: 50_000, latitude: 55.75, longitude: 37.61, expiresAt: new Date(Date.now() + 60_000), publishedAt: new Date(), status: "PUBLISHED" } });

  try {
    await prisma.favoritePerformer.create({ data: { customerId: customer.id, performerId: performer.id } });
    await blockUser(customer.id, performer.id);
    assert.equal(await prisma.favoritePerformer.count({ where: { customerId: customer.id, performerId: performer.id } }), 0);
    await assert.rejects(acceptTask(task.id, { id: performer.id, roles: ["PERFORMER"] }, randomUUID()), /USER_BLOCKED/);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: task.id }, select: { status: true } })).status, "PUBLISHED");
  } finally {
    await prisma.task.delete({ where: { id: task.id } });
    await prisma.user.deleteMany({ where: { id: { in: [customer.id, performer.id] } } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  }
});
