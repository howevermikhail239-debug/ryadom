import assert from "node:assert/strict";
import test from "node:test";

import {
  canSeeExactTaskLocation,
  isRepeatableTaskStatus,
  isTaskAvailableStatus,
  isTaskManageableStatus,
} from "./policy";

test("task status policy keeps management and matching boundaries explicit", () => {
  assert.equal(isTaskManageableStatus("DRAFT"), true);
  assert.equal(isTaskManageableStatus("IN_PROGRESS"), false);
  assert.equal(isTaskAvailableStatus("MATCHING"), true);
  assert.equal(isTaskAvailableStatus("ASSIGNED"), false);
});

test("a guest without a match never receives exact task location", () => {
  assert.equal(canSeeExactTaskLocation({ currentUserId: null, customerId: "customer", performerId: null, isAdmin: false }), false);
  assert.equal(canSeeExactTaskLocation({ currentUserId: "unrelated", customerId: "customer", performerId: null, isAdmin: false }), false);
  assert.equal(canSeeExactTaskLocation({ currentUserId: "customer", customerId: "customer", performerId: null, isAdmin: false }), true);
  assert.equal(canSeeExactTaskLocation({ currentUserId: "performer", customerId: "customer", performerId: "performer", isAdmin: false }), true);
  assert.equal(canSeeExactTaskLocation({ currentUserId: null, customerId: "customer", performerId: null, isAdmin: true }), true);
});

test("only terminal tasks can be repeated", () => {
  assert.equal(isRepeatableTaskStatus("COMPLETED"), true);
  assert.equal(isRepeatableTaskStatus("CANCELLED"), true);
  assert.equal(isRepeatableTaskStatus("EXPIRED"), true);
  assert.equal(isRepeatableTaskStatus("IN_PROGRESS"), false);
});
