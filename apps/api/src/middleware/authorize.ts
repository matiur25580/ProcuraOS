import type { RequestHandler } from "express";
import { ROLE_PERMISSIONS, type Permission } from "../models/membership.model.js";

export function requirePermission(permission: Permission): RequestHandler {
  return (req, res, next) => {
    if (!req.auth) {
      res.status(401).json({ success: false, error: { message: "Authentication required" } });
      return;
    }
    const permissions: readonly string[] = ROLE_PERMISSIONS[req.auth.role];
    if (!permissions.includes("*") && !permissions.includes(permission)) {
      res.status(403).json({ success: false, error: { message: "You do not have permission to perform this action" } });
      return;
    }
    next();
  };
}
