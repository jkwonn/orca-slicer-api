/**
 * Shared error type used by both the HTTP API and the CLI.
 *
 * `status` doubles as an HTTP status code (for the API) and a severity hint
 * (for the CLI, which maps 4xx to "user error" exit code 1 and 5xx to
 * "internal error" exit code 2).
 */
export class AppError extends Error {
  status: number;
  causeMessage?: string;

  constructor(status: number, message: string, causeMessage?: string) {
    super(message);
    this.name = "AppError";
    this.status = status;
    this.causeMessage = causeMessage;
  }
}

/** Convenience constructor for 400-class (caller / input) errors. */
export function userError(message: string, cause?: string): AppError {
  return new AppError(400, message, cause);
}

/** Convenience constructor for 500-class (internal / slicer) errors. */
export function internalError(message: string, cause?: string): AppError {
  return new AppError(500, message, cause);
}
