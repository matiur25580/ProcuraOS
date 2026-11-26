import { createHash, randomBytes, randomUUID } from "node:crypto";
import jwt, { type JwtPayload, type SignOptions } from "jsonwebtoken";
import { env } from "../config/env.js";

export interface AccessClaims extends JwtPayload {
  sub: string;
  org: string;
  membership: string;
  sid: string;
}

export function signAccessToken(claims: AccessClaims): string {
  return jwt.sign(claims, env.JWT_ACCESS_SECRET, {
    algorithm: "HS256",
    expiresIn: env.ACCESS_TOKEN_TTL as SignOptions["expiresIn"],
    issuer: "procuraos-api",
    audience: "procuraos-web",
  });
}

export function verifyAccessToken(token: string): AccessClaims {
  const payload = jwt.verify(token, env.JWT_ACCESS_SECRET, {
    algorithms: ["HS256"], issuer: "procuraos-api", audience: "procuraos-web",
  });
  if (typeof payload === "string" || !payload.sub || !payload.org || !payload.membership || !payload.sid) {
    throw new Error("Invalid access token claims");
  }
  return payload as AccessClaims;
}

export function createRefreshToken(): string { return randomBytes(48).toString("base64url"); }
export function hashRefreshToken(token: string): string { return createHash("sha256").update(token).digest("hex"); }
export function createSessionFamilyId(): string { return randomUUID(); }
