import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const duplicateKey = typeof error === "object" && error !== null && "code" in error && error.code === 11000;
  const statusCode = duplicateKey ? 409 :
    typeof error === "object" && error !== null && "statusCode" in error && typeof error.statusCode === "number"
      ? error.statusCode : 500;

  const message = duplicateKey
    ? "A record with the supplied unique value already exists"
    : statusCode >= 500 && process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : error instanceof Error ? error.message : "An unexpected error occurred";

  res.status(statusCode).json({ success: false, error: { message } });
};
