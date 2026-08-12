import assert from "node:assert/strict";
import test from "node:test";

test("local media fallback stores a small validated image as a data URL", async () => {
  Object.assign(process.env, {
    NODE_ENV: "test",
    APP_URL: "http://localhost:3000",
    DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/unused",
    DIRECT_DATABASE_URL: process.env.TEST_DATABASE_URL ?? "postgresql://unused:unused@localhost:5432/unused",
    AUTH_SECRET: "integration-test-auth-secret-at-least-32-chars",
    OTP_PEPPER: "integration-test-otp-pepper-at-least-32-chars",
    YANDEX_GEOCODER_API_KEY: "integration-test-yandex-geocoder-key",
    TELEGRAM_BOT_TOKEN: "0000000000:INTEGRATION_TEST_TOKEN_123456789",
    TELEGRAM_WEBHOOK_SECRET: "integration-test-webhook-secret-at-least-32-chars",
  });
  delete process.env.S3_ENDPOINT;
  delete process.env.S3_REGION;
  delete process.env.S3_BUCKET;
  delete process.env.S3_ACCESS_KEY_ID;
  delete process.env.S3_SECRET_ACCESS_KEY;

  const { getMediaStorage } = await import("@/lib/media/storage");
  const storage = getMediaStorage();
  const locator = await storage.putImage({
    taskId: "task-1",
    image: { bytes: Buffer.from("small-image"), mimeType: "image/png", extension: "png" },
  });

  assert.match(locator, /^data:image\/png;base64,/);
  assert.equal(await storage.createReadUrl(locator), locator);
  await storage.delete(locator);
});

test("local media fallback rejects images that would bloat the database", async () => {
  const { getMediaStorage } = await import("@/lib/media/storage");
  await assert.rejects(
    getMediaStorage().putImage({
      taskId: "task-1",
      image: { bytes: Buffer.alloc(600_001), mimeType: "image/png", extension: "png" },
    }),
    /LOCAL_MEDIA_LIMIT/,
  );
});
