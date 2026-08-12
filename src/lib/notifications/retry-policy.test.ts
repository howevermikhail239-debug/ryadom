import assert from "node:assert/strict";
import test from "node:test";

import { MAX_NOTIFICATION_DELIVERY_ATTEMPTS, notificationRetryDecision } from "./retry-policy";

const now = new Date("2026-08-11T10:00:00.000Z");

test("retry delay grows exponentially", () => {
  assert.equal(notificationRetryDecision({ attempt: 1, retryable: true, now }).nextAttemptAt?.toISOString(), "2026-08-11T10:00:30.000Z");
  assert.equal(notificationRetryDecision({ attempt: 3, retryable: true, now }).nextAttemptAt?.toISOString(), "2026-08-11T10:02:00.000Z");
});

test("Telegram retry_after takes precedence and is bounded", () => {
  assert.equal(notificationRetryDecision({ attempt: 1, retryable: true, retryAfterSeconds: 90, now }).nextAttemptAt?.toISOString(), "2026-08-11T10:01:30.000Z");
});

test("permanent errors and exhausted attempts are terminal", () => {
  assert.equal(notificationRetryDecision({ attempt: 1, retryable: false, now }).terminal, true);
  assert.equal(notificationRetryDecision({ attempt: MAX_NOTIFICATION_DELIVERY_ATTEMPTS, retryable: true, now }).terminal, true);
});
