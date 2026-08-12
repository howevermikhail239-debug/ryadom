import assert from "node:assert/strict";
import test from "node:test";

import { isAllowedRequestOrigin } from "./origin-policy";

test("accepts public and forwarded local origins but rejects a foreign site", () => {
  const base = { requestOrigin: "http://app:3000", appOrigin: "https://example.ngrok.app", forwardedHost: "localhost:3000", forwardedProto: "http" };
  assert.equal(isAllowedRequestOrigin({ ...base, origin: "https://example.ngrok.app" }), true);
  assert.equal(isAllowedRequestOrigin({ ...base, origin: "http://localhost:3000" }), true);
  assert.equal(isAllowedRequestOrigin({ ...base, origin: "https://evil.example" }), false);
  assert.equal(isAllowedRequestOrigin({ ...base, origin: "not a url" }), false);
});
