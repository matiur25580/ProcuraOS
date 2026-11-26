import type { RequestHandler } from "express";
import { z, type ZodType } from "zod";

export function validateBody<T>(schema: ZodType<T>): RequestHandler {
  return (req, res, next) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: { message: "Request validation failed", details: z.flattenError(parsed.error).fieldErrors },
      });
      return;
    }
    req.body = parsed.data;
    next();
  };
}
