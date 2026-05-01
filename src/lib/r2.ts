/**
 * Cloudflare R2 storage. R2 is S3-compatible, so we use the AWS SDK.
 *
 * Upload pattern: client requests a signed PUT URL from our API, then
 * uploads directly to R2. Our API never proxies the bytes — Kenya bandwidth
 * is precious and we pay for it on the API side.
 *
 * Read pattern: published listings get the public CDN URL
 * (https://photos.nuru.com/<key>). Private docs (IDs, leases) get short-lived
 * signed GET URLs.
 */

import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { ExternalServiceError } from "./errors";

const accountId = process.env.R2_ACCOUNT_ID;
const accessKeyId = process.env.R2_ACCESS_KEY_ID;
const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
const bucket = process.env.R2_BUCKET ?? "nuru-photos";
const publicUrl = process.env.R2_PUBLIC_URL ?? "https://photos.nuru.com";

let _client: S3Client | undefined;
function client(): S3Client {
  if (_client) return _client;
  if (!accountId || !accessKeyId || !secretAccessKey) {
    throw new ExternalServiceError("R2 not configured (missing R2_* env vars)");
  }
  _client = new S3Client({
    region: "auto",
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    credentials: { accessKeyId, secretAccessKey },
  });
  return _client;
}

export type R2Folder = "listings" | "ids" | "leases" | "voice" | "tmp";

/** Generate a unique R2 key under a folder. Includes a uuid to avoid collisions. */
export function makeKey(folder: R2Folder, ownerId: string, ext: string): string {
  const safe = ext.replace(/[^a-z0-9]/gi, "").toLowerCase().slice(0, 8);
  return `${folder}/${ownerId}/${randomUUID()}.${safe}`;
}

/** Public URL for a listing photo (only valid after R2 object exists). */
export function publicUrlFor(key: string): string {
  return `${publicUrl}/${key}`;
}

/**
 * Signed PUT URL — client uploads directly to R2. Expires in `expirySeconds`
 * (default 5 minutes). The client must send the `Content-Type` header that
 * was passed in here.
 */
export async function signUploadUrl(opts: {
  key: string;
  contentType: string;
  contentLengthMax?: number;
  expirySeconds?: number;
}): Promise<{ url: string; key: string; expiresAt: string }> {
  const cmd = new PutObjectCommand({
    Bucket: bucket,
    Key: opts.key,
    ContentType: opts.contentType,
    ContentLength: opts.contentLengthMax,
  });
  const expirySeconds = opts.expirySeconds ?? 300;
  const url = await getSignedUrl(client(), cmd, { expiresIn: expirySeconds });
  return {
    url,
    key: opts.key,
    expiresAt: new Date(Date.now() + expirySeconds * 1000).toISOString(),
  };
}

/** Signed GET URL — for private documents. Listings use the public CDN. */
export async function signDownloadUrl(opts: {
  key: string;
  expirySeconds?: number;
}): Promise<string> {
  const cmd = new GetObjectCommand({ Bucket: bucket, Key: opts.key });
  return getSignedUrl(client(), cmd, { expiresIn: opts.expirySeconds ?? 300 });
}

export async function deleteObject(key: string): Promise<void> {
  await client().send(new DeleteObjectCommand({ Bucket: bucket, Key: key }));
}
