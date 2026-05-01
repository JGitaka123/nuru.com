/**
 * Typed errors. Throw these from services; map to HTTP at the route boundary.
 */

export class AppError extends Error {
  constructor(
    message: string,
    public readonly code: string,
    public readonly status: number,
    public readonly details?: unknown,
  ) {
    super(message);
    this.name = this.constructor.name;
  }
}

export class ValidationError extends AppError {
  constructor(message: string, details?: unknown) {
    super(message, "VALIDATION_ERROR", 400, details);
  }
}

export class AuthError extends AppError {
  constructor(message = "Unauthorized") {
    super(message, "AUTH_ERROR", 401);
  }
}

export class ForbiddenError extends AppError {
  constructor(message = "Forbidden") {
    super(message, "FORBIDDEN", 403);
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(`${resource} not found`, "NOT_FOUND", 404);
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(message, "CONFLICT", 409);
  }
}

export class RateLimitError extends AppError {
  constructor(message = "Too many requests") {
    super(message, "RATE_LIMIT", 429);
  }
}

export class ExternalServiceError extends AppError {
  constructor(service: string, cause?: unknown) {
    super(`${service} error`, "EXTERNAL_SERVICE", 502, cause);
  }
}

export function toHttpError(err: unknown): { status: number; body: { code: string; message: string; details?: unknown } } {
  if (err instanceof AppError) {
    return { status: err.status, body: { code: err.code, message: err.message, details: err.details } };
  }
  return { status: 500, body: { code: "INTERNAL_ERROR", message: "Internal server error" } };
}
