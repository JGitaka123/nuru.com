import pino from "pino";

export const logger = pino({
  level: process.env.LOG_LEVEL ?? "info",
  redact: {
    // Redact PII automatically. Add fields here as schemas evolve.
    paths: [
      "phoneE164",
      "phoneNumber",
      "*.phoneE164",
      "*.phoneNumber",
      "nationalIdHash",
      "*.nationalIdHash",
      "kraPin",
      "*.kraPin",
      "MPESA_PASSKEY",
      "MPESA_CONSUMER_SECRET",
      "ANTHROPIC_API_KEY",
    ],
    censor: "[REDACTED]",
  },
  ...(process.env.NODE_ENV === "development"
    ? { transport: { target: "pino-pretty", options: { colorize: true } } }
    : {}),
});
