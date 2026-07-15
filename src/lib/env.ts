/**
 * Startup environment validation.
 *
 * The goal is fail-fast: a misconfigured secret should crash the process at
 * boot with a clear message — never surface as an opaque 500 mid-request.
 *
 * Historically a too-short (or missing) JWT_SECRET let the API boot and pass
 * health checks, then threw a raw Error from signToken() at the very end of
 * OTP verification — after the code was already consumed. Users saw
 * "Internal server error" right after entering a valid SMS code, with no way
 * to tell config from bug. Validating here turns that into an obvious,
 * diagnosable boot failure.
 */

import { logger } from "./logger";

/** Minimum length for the HMAC signing secret (also used as the OTP pepper). */
export const JWT_SECRET_MIN_LENGTH = 32;

export interface EnvProblem {
  key: string;
  message: string;
}

/**
 * Collect configuration problems without throwing. Pure — easy to unit test.
 * Returns an empty array when the environment is valid.
 */
export function collectEnvProblems(env: NodeJS.ProcessEnv = process.env): EnvProblem[] {
  const problems: EnvProblem[] = [];

  const jwt = env.JWT_SECRET;
  if (!jwt || jwt.trim().length === 0) {
    problems.push({
      key: "JWT_SECRET",
      message:
        "JWT_SECRET is not set. Set it to a random string of at least " +
        `${JWT_SECRET_MIN_LENGTH} characters (e.g. \`openssl rand -base64 48\`).`,
    });
  } else if (jwt.length < JWT_SECRET_MIN_LENGTH) {
    problems.push({
      key: "JWT_SECRET",
      message:
        `JWT_SECRET is only ${jwt.length} characters; it must be at least ` +
        `${JWT_SECRET_MIN_LENGTH}. A short secret breaks sign-in: OTP ` +
        "verification succeeds but the session token can't be signed, so " +
        "users get a 500 after entering a valid code.",
    });
  }

  if (!env.DATABASE_URL || env.DATABASE_URL.trim().length === 0) {
    problems.push({ key: "DATABASE_URL", message: "DATABASE_URL is not set." });
  }

  return problems;
}

/**
 * Validate the environment or exit the process. Call once at server startup,
 * before binding the port.
 */
export function validateEnvOrExit(env: NodeJS.ProcessEnv = process.env): void {
  const problems = collectEnvProblems(env);
  if (problems.length === 0) return;

  for (const p of problems) {
    logger.fatal({ key: p.key }, `invalid configuration: ${p.message}`);
  }
  logger.fatal(
    `Refusing to start with ${problems.length} configuration problem(s). ` +
      "Fix the environment variable(s) above and redeploy.",
  );
  process.exit(1);
}
