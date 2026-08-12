import "server-only";

import { randomUUID } from "node:crypto";
import { DeleteObjectCommand, GetObjectCommand, ListObjectsV2Command, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

import { serverEnv } from "@/config/server-env";
import type { ValidatedImage } from "@/lib/media/validation";

export interface MediaStorage {
  putImage(input: { taskId: string; image: ValidatedImage }): Promise<string>;
  createReadUrl(locator: string): Promise<string>;
  delete(locator: string): Promise<void>;
  listObjects?(limit: number): Promise<Array<{ locator: string; lastModified: Date }>>;
}

class DataUrlMediaStorage implements MediaStorage {
  async putImage({ image }: { taskId: string; image: ValidatedImage }) {
    if (image.bytes.length > 600_000) throw new Error("LOCAL_MEDIA_LIMIT");
    return `data:${image.mimeType};base64,${image.bytes.toString("base64")}`;
  }
  async createReadUrl(locator: string) { return locator; }
  async delete() { return; }
}

class S3MediaStorage implements MediaStorage {
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    this.bucket = serverEnv.S3_BUCKET!;
    this.client = new S3Client({
      endpoint: serverEnv.S3_ENDPOINT,
      region: serverEnv.S3_REGION,
      forcePathStyle: serverEnv.S3_FORCE_PATH_STYLE,
      credentials: {
        accessKeyId: serverEnv.S3_ACCESS_KEY_ID!,
        secretAccessKey: serverEnv.S3_SECRET_ACCESS_KEY!,
      },
    });
  }

  async putImage({ taskId, image }: { taskId: string; image: ValidatedImage }) {
    const now = new Date();
    const key = `tasks/${taskId}/${now.getUTCFullYear()}/${String(now.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}.${image.extension}`;
    await this.client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: image.bytes, ContentType: image.mimeType, CacheControl: "private, max-age=300" }));
    return `s3:${key}`;
  }

  async createReadUrl(locator: string) {
    const key = locator.slice(3);
    if (!locator.startsWith("s3:tasks/") || key.includes("..") || key.includes("\\")) throw new Error("INVALID_MEDIA_LOCATOR");
    return getSignedUrl(this.client, new GetObjectCommand({ Bucket: this.bucket, Key: key }), { expiresIn: 300 });
  }

  async delete(locator: string) {
    if (!locator.startsWith("s3:tasks/")) return;
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: locator.slice(3) }));
  }

  async listObjects(limit: number) {
    const result = await this.client.send(new ListObjectsV2Command({ Bucket: this.bucket, Prefix: "tasks/", MaxKeys: Math.max(1, Math.min(limit, 1000)) }));
    return (result.Contents ?? []).flatMap((object) => object.Key && object.LastModified ? [{ locator: `s3:${object.Key}`, lastModified: object.LastModified }] : []);
  }
}

let storage: MediaStorage | undefined;

export function getMediaStorage(): MediaStorage {
  storage ??= serverEnv.S3_BUCKET ? new S3MediaStorage() : new DataUrlMediaStorage();
  return storage;
}
