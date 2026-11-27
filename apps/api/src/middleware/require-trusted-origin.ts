import type { RequestHandler } from "express";
import { env } from "../config/env.js";

const trustedOrigin = new URL(env.WEB_ORIGIN).origin;

export const requireTrustedOrigin: RequestHandler = (req, res, next) => {
  const origin = req.get("origin");
  const fetchSite = req.get("sec-fetch-site");

  if (!origin) {
    if (fetchSite === "cross-site") {
      res.status(403).json({ success: false, error: { message: "Request origin is not trusted" } });
      return;
    }
    next();
    return;
  }

  let requestOrigin: string;
  try {
    requestOrigin = new URL(origin).origin;
  } catch {
    res.status(403).json({ success: false, error: { message: "Request origin is not trusted" } });
    return;
  }

  if (requestOrigin !== trustedOrigin) {
    res.status(403).json({ success: false, error: { message: "Request origin is not trusted" } });
    return;
  }

  next();
};
