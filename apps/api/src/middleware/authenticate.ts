import type { RequestHandler } from "express";
import { Membership, type OrganizationRole } from "../models/membership.model.js";
import { Organization } from "../models/organization.model.js";
import { RefreshSession } from "../models/refresh-session.model.js";
import { User } from "../models/user.model.js";
import { verifyAccessToken } from "../security/tokens.js";

export const authenticate: RequestHandler = async (req, res, next) => {
  const authorization = req.header("authorization");
  if (!authorization?.startsWith("Bearer ")) {
    res.status(401).json({ success: false, error: { message: "Authentication required" } });
    return;
  }

  let claims;
  try {
    claims = verifyAccessToken(authorization.slice(7));
  } catch {
    res.status(401).json({ success: false, error: { message: "Invalid or expired access token" } });
    return;
  }

  try {
    const [user, membership, organization, activeSession] = await Promise.all([
      User.findOne({ _id: claims.sub, status: "active" }).select("_id"),
      Membership.findOne({ _id: claims.membership, userId: claims.sub, organizationId: claims.org, status: "active" }),
      Organization.findOne({ _id: claims.org, status: "active" }).select("_id"),
      RefreshSession.exists({ familyId: claims.sid, userId: claims.sub, organizationId: claims.org, revokedAt: null, expiresAt: { $gt: new Date() } }),
    ]);

    if (!user || !membership || !organization || !activeSession) {
      res.status(401).json({ success: false, error: { message: "Session or organization membership is no longer active" } });
      return;
    }

    req.auth = {
      userId: user.id,
      organizationId: membership.organizationId.toString(),
      membershipId: membership.id,
      role: membership.role as OrganizationRole,
    };
    next();
  } catch (error) {
    next(error);
  }
};
