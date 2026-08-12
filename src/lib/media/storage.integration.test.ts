import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import test from "node:test";

const endpoint = process.env.TEST_S3_ENDPOINT;

test("S3 adapter uploads, signs, lists and deletes an object", { skip: !endpoint, timeout: 30_000 }, async () => {
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
    S3_ENDPOINT: endpoint,
    S3_REGION: "us-east-1",
    S3_BUCKET: "ryadom-media",
    S3_ACCESS_KEY_ID: "minio-local",
    S3_SECRET_ACCESS_KEY: "minio-local-only-password",
    S3_FORCE_PATH_STYLE: "true",
  });
  const { getMediaStorage } = await import("@/lib/media/storage");
  const storage = getMediaStorage();
  const bytes = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00]);
  const locator = await storage.putImage({ taskId: randomUUID(), image: { bytes, mimeType: "image/png", extension: "png" } });
  try {
    assert.match(locator, /^s3:tasks\//);
    const readUrl = await storage.createReadUrl(locator);
    const response = await fetch(readUrl);
    assert.equal(response.status, 200);
    assert.deepEqual(Buffer.from(await response.arrayBuffer()), bytes);
    assert.equal((await storage.listObjects?.(100))?.some((object) => object.locator === locator), true);
  } finally {
    await storage.delete(locator);
  }
});
