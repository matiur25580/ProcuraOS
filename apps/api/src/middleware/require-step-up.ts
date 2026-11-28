import { createHash } from "node:crypto";
import type { RequestHandler } from "express";
import { AuditEvent } from "../models/audit-event.model.js";
import { StepUpGrant } from "../models/step-up-grant.model.js";

export const requireStepUp: RequestHandler = async (req, res, next) => {
  const token = req.header("x-step-up-token");
  if (!token || token.length > 256) {
    res.status(403).json({ success: false, error: { message: "Fresh step-up verification is required" } });
    return;
  }
  try {
    const tokenHash = createHash("sha256").update(token).digest("hex");
    const grant = await StepUpGrant.findOneAndUpdate({
      tokenHash,
      userId: req.auth!.userId,
      organizationId: req.auth!.organizationId,
      sessionFamilyId: req.auth!.sessionFamilyId,
      consumedAt: null,
      expiresAt: { $gt: new Date() },
    }, { $set: { consumedAt: new Date() } }, { new: true });
    if (!grant) {
      res.status(403).json({ success: false, error: { message: "Step-up token is invalid, expired or already used" } });
      return;
    }
    await AuditEvent.create({
      organizationId: req.auth!.organizationId,
      actorUserId: req.auth!.userId,
      action: "security.step_up.consumed",
      targetType: "security_grant",
      targetId: grant.id,
      metadata: { method: "password_and_mfa_or_password", path: req.path },
      ...(req.ip ? { ipAddress: req.ip } : {}),
      ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}),
    });
    next();
  } catch (error) {
    next(error);
  }
};
