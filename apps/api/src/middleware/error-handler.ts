import type { ErrorRequestHandler } from "express";

export const errorHandler: ErrorRequestHandler = (error, _req, res, _next) => {
  const statusCode =
    typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
      ? error.statusCode
      : 500;

  const message =
    statusCode >= 500 && process.env.NODE_ENV === "production"
      ? "An unexpected error occurred"
      : error instanceof Error
        ? error.message
        : "An unexpected error occurred";

  res.status(statusCode).json({
    success: false,
    error: { message },
  });
};
