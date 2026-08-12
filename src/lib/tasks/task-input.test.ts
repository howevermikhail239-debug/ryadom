import assert from "node:assert/strict";
import test from "node:test";

import { resolveTaskTiming } from "./task-input";

const now = new Date("2026-08-10T12:00:00.000Z");

test("urgent immediate task expires in one hour", () => {
  assert.equal(resolveTaskTiming({ isUrgent: true, startsAt: null }, now).expiresAt.toISOString(), "2026-08-10T13:00:00.000Z");
});

test("normal immediate task expires in two hours", () => {
  assert.equal(resolveTaskTiming({ isUrgent: false, startsAt: null }, now).expiresAt.toISOString(), "2026-08-10T14:00:00.000Z");
});

test("scheduled task expires thirty minutes after its start regardless of urgency", () => {
  assert.equal(
    resolveTaskTiming({ isUrgent: true, startsAt: "2026-08-10T16:00:00.000Z" }, now).expiresAt.toISOString(),
    "2026-08-10T16:30:00.000Z",
  );
});

test("past startsAt is rejected", () => {
  assert.throws(
    () => resolveTaskTiming({ isUrgent: false, startsAt: "2026-08-10T11:00:00.000Z" }, now),
    /TASK_START_IN_PAST/,
  );
});
