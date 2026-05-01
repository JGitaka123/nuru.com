/**
 * Voice search.
 *
 *   POST /v1/photos/upload-url   { folder: "voice", contentType: "audio/..." }
 *     → { url, key }
 *
 *   client uploads audio to R2 directly, then:
 *
 *   POST /v1/search/voice  { audioKey }
 *     → transcribe (whisper) → parse (haiku) → search (existing pipeline)
 *     → returns the same shape as /v1/search
 *
 * The transcribed text is also returned so the UI can show the user what
 * we heard ("Did you say 'natafuta keja Kile'?").
 */

import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireAuth } from "../lib/auth";
import { signDownloadUrl } from "../lib/r2";
import { transcribe } from "../services/inference";
import { parseSearchQuery } from "../prompts/search-parser";
import { ExternalServiceError, ValidationError } from "../lib/errors";

const VoiceBody = z.object({
  audioKey: z.string().min(5).max(300),
  language: z.enum(["en", "sw", "auto"]).default("auto"),
});

export async function voiceSearchRoutes(app: FastifyInstance) {
  app.post(
    "/v1/search/voice",
    { preHandler: requireAuth },
    async (req, reply) => {
      const { audioKey, language } = VoiceBody.parse(req.body);
      if (!req.user) throw new ValidationError("No session");

      // Voice files live in the private "voice" folder. We hand whisper a
      // short-lived signed GET URL so it can fetch directly.
      const downloadUrl = await signDownloadUrl({ key: audioKey, expirySeconds: 120 });

      const t = await transcribe({ audioUrl: downloadUrl, language }).catch((err) => {
        throw new ExternalServiceError("whisper", err);
      });

      // Empty/garbled transcript? Tell the client.
      if (!t.text || t.text.length < 3) {
        return reply.send({
          transcript: t.text,
          detectedLanguage: t.detectedLanguage,
          filters: null,
          results: [],
          message: "We couldn't understand the audio. Try again in a quieter spot.",
        });
      }

      const parsed = await parseSearchQuery(t.text);
      // We don't run the whole pipeline (embed + rerank) here — that lives
      // in /v1/search. The client typically follows up by calling /v1/search
      // with the transcript.
      return reply.send({
        transcript: t.text,
        detectedLanguage: t.detectedLanguage,
        filters: parsed.content,
      });
    },
  );
}
