export const MAX_IMAGE_BYTES = 5_000_000;
const ALLOWED_MIME_TYPES = ["image/jpeg", "image/png", "image/webp"] as const;
type AllowedMime = (typeof ALLOWED_MIME_TYPES)[number];

export type ValidatedImage = { bytes: Buffer; mimeType: AllowedMime; extension: "jpg" | "png" | "webp" };

function detectedMime(bytes: Buffer): AllowedMime | null {
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return "image/jpeg";
  if (bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (bytes.length >= 12 && bytes.subarray(0, 4).toString("ascii") === "RIFF" && bytes.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  return null;
}

export async function validateImageUpload(file: File): Promise<ValidatedImage> {
  const bytes = Buffer.from(await file.arrayBuffer());
  if (bytes.length === 0 || bytes.length > MAX_IMAGE_BYTES) throw new Error("INVALID_IMAGE_SIZE");
  const mimeType = detectedMime(bytes);
  if (!mimeType || !ALLOWED_MIME_TYPES.includes(file.type as AllowedMime) || mimeType !== file.type) {
    throw new Error("INVALID_IMAGE_TYPE");
  }
  const extension = mimeType === "image/jpeg" ? "jpg" : mimeType === "image/png" ? "png" : "webp";
  return { bytes, mimeType, extension };
}
