import assert from "node:assert/strict";
import test from "node:test";

import { etaExpectedAt, remainingEtaMinutes } from "./eta";

test("ETA is based on the last update time", () => {
  const updatedAt = new Date("2026-08-11T10:00:00.000Z");
  assert.equal(etaExpectedAt(30, updatedAt).toISOString(), "2026-08-11T10:30:00.000Z");
  assert.equal(remainingEtaMinutes(30, updatedAt, new Date("2026-08-11T10:12:01.000Z")), 18);
});

test("elapsed ETA is not exposed as current", () => {
  assert.equal(remainingEtaMinutes(15, new Date("2026-08-11T10:00:00.000Z"), new Date("2026-08-11T10:15:00.000Z")), null);
});
