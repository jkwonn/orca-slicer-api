import type { NextFunction, Response, Request } from "express";
import { AppError } from "../core/errors";

// Re-exported so existing `import { AppError } from "../../middleware/error"`
// call sites keep working after the type moved into the shared core.
export { AppError } from "../core/errors";

/* eslint-disable @typescript-eslint/no-unused-vars */
export function errorHandler(
  err: AppError,
  req: Request,
  res: Response,
  next: NextFunction
): void {
  console.error(
    `[${new Date().toISOString()}] Error: ${err.message}
    at ${req.method} ${req.originalUrl} with ${err.stack ?? "no stack trace"}
    ${err.causeMessage ? `Cause: ${err.causeMessage}` : ""}`
  );

  const status = typeof err.status === "number" ? err.status : 500;

  res.status(status).json({
    message: err.message,
  });
}
