import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const testDatabaseUrl = process.env.TEST_DATABASE_URL;

test("acceptTask serializes competing performers and same-key retries", { skip: !testDatabaseUrl, timeout: 60_000 }, async () => {
  Object.assign(process.env, { NODE_ENV: "test" });
  process.env.DATABASE_URL = testDatabaseUrl;
  process.env.DIRECT_DATABASE_URL = testDatabaseUrl;
  process.env.APP_URL ??= "http://localhost:3000";
  process.env.AUTH_SECRET ??= "integration-test-auth-secret-at-least-32-chars";
  process.env.OTP_PEPPER ??= "integration-test-otp-pepper-at-least-32-chars";
  process.env.YANDEX_GEOCODER_API_KEY ??= "integration-test-yandex-geocoder-key";
  process.env.TELEGRAM_BOT_TOKEN ??= "0000000000:INTEGRATION_TEST_TOKEN_123456789";
  process.env.TELEGRAM_WEBHOOK_SECRET ??= "integration-test-webhook-secret-at-least-32-chars";

  const [{ prisma }, { acceptTask }, { expirePublishedTasks }, { processMatchingWaves }] = await Promise.all([
    import("@/lib/db/prisma"),
    import("@/server/services/task-workflow"),
    import("@/server/jobs/task-expiry"),
    import("@/server/jobs/matching-waves"),
  ]);
  const suffix = randomUUID().slice(0, 8);
  const category = await prisma.category.create({ data: { slug: `concurrency-${suffix}`, name: "Concurrency test", icon: "test" } });
  const users = await Promise.all(["customer", "performer-a", "performer-b"].map((name, index) => prisma.user.create({
    data: { displayName: `${name}-${suffix}`, telegramId: BigInt(`99000000${index}${Date.now().toString().slice(-5)}`), roles: index === 0 ? ["CUSTOMER"] : ["CUSTOMER", "PERFORMER"], status: "ACTIVE" },
  })));
  const [customer, performerA, performerB] = users;
  const availableUntil = new Date(Date.now() + 60 * 60_000);
  await prisma.user.updateMany({ where: { id: { in: [performerA.id, performerB.id] } }, data: { availableUntil } });
  await Promise.all([performerA, performerB].map((performer, index) => prisma.userLocation.create({ data: {
    userId: performer.id,
    latitude: 55.751244 + index * 0.0001,
    longitude: 37.618423,
    accuracyMeters: 10,
    consentedAt: new Date(),
    expiresAt: availableUntil,
  } })));

  async function createTask(title: string) {
    return prisma.task.create({ data: {
      customerId: customer.id,
      categoryId: category.id,
      title,
      description: "Integration test task description",
      priceKopecks: 50_000,
      latitude: 55.751244,
      longitude: 37.618423,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      publishedAt: new Date(),
      status: "PUBLISHED",
    } });
  }

  const createdTaskIds: string[] = [];
  try {
    const retryTask = await createTask(`same-key-${suffix}`);
    createdTaskIds.push(retryTask.id);
    const retryKey = randomUUID();
    const sameKeyResults = await Promise.all([
      acceptTask(retryTask.id, { id: performerA.id, roles: ["CUSTOMER", "PERFORMER"] }, retryKey),
      acceptTask(retryTask.id, { id: performerA.id, roles: ["CUSTOMER", "PERFORMER"] }, retryKey),
    ]);
    assert.equal(sameKeyResults[0].id, sameKeyResults[1].id);
    assert.equal(await prisma.taskMatch.count({ where: { taskId: retryTask.id } }), 1);

    const raceTask = await createTask(`race-${suffix}`);
    createdTaskIds.push(raceTask.id);
    const competing = await Promise.allSettled([
      acceptTask(raceTask.id, { id: performerA.id, roles: ["CUSTOMER", "PERFORMER"] }, randomUUID()),
      acceptTask(raceTask.id, { id: performerB.id, roles: ["CUSTOMER", "PERFORMER"] }, randomUUID()),
    ]);
    assert.equal(competing.filter((result) => result.status === "fulfilled").length, 1);
    assert.equal(competing.filter((result) => result.status === "rejected").length, 1);
    assert.equal(await prisma.taskMatch.count({ where: { taskId: raceTask.id, status: "IN_PROGRESS" } }), 1);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: raceTask.id }, select: { status: true } })).status, "IN_PROGRESS");

    const expirable = await createTask(`expiry-${suffix}`);
    createdTaskIds.push(expirable.id);
    await prisma.task.update({ where: { id: expirable.id }, data: { expiresAt: new Date(Date.now() - 60_000) } });
    await prisma.task.update({ where: { id: retryTask.id }, data: { status: "PUBLISHED", expiresAt: new Date(Date.now() - 60_000) } });
    await Promise.all([expirePublishedTasks(), expirePublishedTasks()]);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: expirable.id }, select: { status: true } })).status, "EXPIRED");
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: retryTask.id }, select: { status: true } })).status, "PUBLISHED");
    assert.equal(await prisma.notification.count({ where: { taskId: expirable.id, type: "TASK_EXPIRED" } }), 1);

    const waveTask = await prisma.task.create({ data: {
      customerId: customer.id,
      categoryId: category.id,
      title: `wave-${suffix}`,
      description: "Wave matching integration test",
      priceKopecks: 75_000,
      latitude: 55.751244,
      longitude: 37.618423,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      publishedAt: new Date(),
      status: "PUBLISHED",
      nextMatchingAt: new Date(Date.now() - 1000),
    } });
    createdTaskIds.push(waveTask.id);
    await prisma.notificationPreference.create({ data: { userId: performerA.id, radiusMeters: 3000, categories: { create: { categoryId: category.id } } } });
    const moscowParts = new Intl.DateTimeFormat("en-GB", { timeZone: "Europe/Moscow", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date());
    const currentMoscowMinute = Number(moscowParts.find((part) => part.type === "hour")?.value) * 60 + Number(moscowParts.find((part) => part.type === "minute")?.value);
    await prisma.notificationPreference.create({ data: { userId: performerB.id, radiusMeters: 500, quietHoursStart: (currentMoscowMinute + 1439) % 1440, quietHoursEnd: (currentMoscowMinute + 1) % 1440 } });
    await Promise.all([processMatchingWaves(), processMatchingWaves()]);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: waveTask.id }, select: { matchingWave: true } })).matchingWave, 1);
    assert.equal(await prisma.notification.count({ where: { taskId: waveTask.id, type: "TASK_NEARBY" } }), 1);
    await prisma.task.update({ where: { id: waveTask.id }, data: { nextMatchingAt: new Date(Date.now() - 1000) } });
    await Promise.all([processMatchingWaves(), processMatchingWaves()]);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: waveTask.id }, select: { matchingWave: true } })).matchingWave, 2);
    assert.equal(await prisma.notification.count({ where: { taskId: waveTask.id, type: "TASK_NEARBY" } }), 1);

    const earlyTask = await prisma.task.create({ data: {
      customerId: customer.id,
      categoryId: category.id,
      title: `early-${suffix}`,
      description: "Early access integration test",
      priceKopecks: 80_000,
      latitude: 55.751244,
      longitude: 37.618423,
      expiresAt: new Date(Date.now() + 60 * 60_000),
      publishedAt: new Date(),
      status: "PUBLISHED",
      preferredPerformerId: performerA.id,
      earlyAccessUntil: new Date(Date.now() + 60_000),
      nextMatchingAt: new Date(Date.now() + 60_000),
    } });
    createdTaskIds.push(earlyTask.id);
    await assert.rejects(
      acceptTask(earlyTask.id, { id: performerB.id, roles: ["CUSTOMER", "PERFORMER"] }, randomUUID()),
      /EARLY_ACCESS_RESTRICTED/,
    );
    await prisma.task.update({ where: { id: earlyTask.id }, data: { earlyAccessUntil: new Date(Date.now() - 1000), nextMatchingAt: new Date(Date.now() - 1000) } });
    const releaseRace = await Promise.allSettled([
      processMatchingWaves(),
      acceptTask(earlyTask.id, { id: performerA.id, roles: ["CUSTOMER", "PERFORMER"] }, randomUUID()),
    ]);
    assert.equal(releaseRace[1].status, "fulfilled", releaseRace[1].status === "rejected" ? String(releaseRace[1].reason) : undefined);
    assert.equal(await prisma.taskMatch.count({ where: { taskId: earlyTask.id, status: "IN_PROGRESS" } }), 1);
    assert.equal((await prisma.task.findUniqueOrThrow({ where: { id: earlyTask.id }, select: { status: true } })).status, "IN_PROGRESS");
  } finally {
    await prisma.taskMatch.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.bid.deleteMany({ where: { taskId: { in: createdTaskIds } } });
    await prisma.task.deleteMany({ where: { id: { in: createdTaskIds } } });
    await prisma.user.deleteMany({ where: { id: { in: users.map((user) => user.id) } } });
    await prisma.category.delete({ where: { id: category.id } });
    await prisma.$disconnect();
  }
});
