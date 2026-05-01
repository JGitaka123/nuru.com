/**
 * Photo upload signed URL.
 *
 *   POST /v1/photos/upload-url   (auth) { contentType, contentLength?, folder? }
 *     → { url, key, expiresAt }
 *
 * Client uploads directly to R2 via PUT to `url`. Then calls
 * POST /v1/listings/:id/photos with the returned key.
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { makeKey, signUploadUrl } from "../lib/r2";
import { ValidationError } from "../lib/errors";

const ALLOWED_MIME = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const MAX_PHOTO_BYTES = 15 * 1024 * 1024; // 15 MB

const Body = z.object({
  contentType: z.string().min(3).max(40),
  contentLength: z.number().int().positive().max(MAX_PHOTO_BYTES).optional(),
  folder: z.enum(["listings", "ids", "leases", "voice", "tmp"]).default("listings"),
});

const EXT_FROM_MIME: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/heic": "heic",
  "image/heif": "heif",
};

export async function photoRoutes(app: FastifyInstance) {
  app.post(
    "/v1/photos/upload-url",
    { preHandler: requireAuth },
    async (req, reply) => {
      if (!req.user) throw new ValidationError("No session");
      const { contentType, contentLength, folder } = Body.parse(req.body);

      // Photos are restricted by mime; other folders accept arbitrary docs.
      if (folder === "listings" && !ALLOWED_MIME.has(contentType)) {
        throw new ValidationError(`Unsupported photo type: ${contentType}`);
      }

      const ext = EXT_FROM_MIME[contentType] ?? contentType.split("/")[1] ?? "bin";
      const key = makeKey(folder, req.user.sub, ext);
      const signed = await signUploadUrl({
        key,
        contentType,
        contentLengthMax: contentLength,
        expirySeconds: 300,
      });
      return reply.send(signed);
    },
  );
}
