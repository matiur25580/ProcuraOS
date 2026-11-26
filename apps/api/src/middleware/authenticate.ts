import type { RequestHandler } from "express";
import { Membership } from "../models/membership.model.js";
import { User } from "../models/user.model.js";
import { verifyAccessToken } from "../security/tokens.js";

export const authenticate: RequestHandler = async (req, res, next) => {
  try {
    const authorization = req.header("authorization");
    if (!authorization?.startsWith("Bearer ")) {
      res.status(401).json({ success: false, error: { message: "Authentication required" } });
      return;
    }

    const claims = verifyAccessToken(authorization.slice(7));
    const [user, membership] = await Promise.all([
      User.findOne({ _id: claims.sub, status: "active" }).select("_id"),
      Membership.findOne({
        _id: claims.membership,
        userId: claims.sub,
        organizationId: claims.org,
        status: "active",
      }),
    ]);

    if (!user || !membership) {
      res.status(401).json({ success: false, error: { message: "Session is no longer valid" } });
      return;
    }

    req.auth = {
      userId: user.id,
      organizationId: membership.organizationId.toString(),
      membershipId: membership.id,
      role: membership.role,
    };
    next();
  } catch {
    res.status(401).json({ success: false, error: { message: "Invalid or expired access token" } });
  }
};
