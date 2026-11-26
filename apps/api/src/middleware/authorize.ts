import type { RequestHandler } from "express";
import type { Permission } from "../models/membership.model.js";
import { hasPermission } from "../security/permissions.js";

export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: { message: "Authentication required" } });
      return;
    }
    if (!hasPermission(req.auth.role, permission)) {
      res.status(403).json({ success: false, error: { message: "You do not have permission to perform this action" } });
      return;
    }
    next();
  };
}
