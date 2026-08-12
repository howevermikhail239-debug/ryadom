import assert from "node:assert/strict";
import test from "node:test";

import { MAX_IMAGE_BYTES, validateImageUpload } from "./validation";

test("accepts PNG by both declared MIME and binary signature", async () => {
  const png = new File([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00])], "proof.png", { type: "image/png" });
  const result = await validateImageUpload(png);
  assert.equal(result.mimeType, "image/png");
  assert.equal(result.extension, "png");
});

test("rejects SVG content disguised as PNG", async () => {
  const spoofed = new File(["<svg><script>alert(1)</script></svg>"], "proof.png", { type: "image/png" });
  await assert.rejects(validateImageUpload(spoofed), /INVALID_IMAGE_TYPE/);
});

test("rejects images above the upload limit", async () => {
  const oversized = new File([Buffer.alloc(MAX_IMAGE_BYTES + 1, 0xff)], "proof.jpg", { type: "image/jpeg" });
  await assert.rejects(validateImageUpload(oversized), /INVALID_IMAGE_SIZE/);
});
