import bcrypt from "bcryptjs";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { Membership } from "../../models/membership.model.js";
import { Organization } from "../../models/organization.model.js";
import { RefreshSession } from "../../models/refresh-session.model.js";
import { User } from "../../models/user.model.js";
import { createRefreshToken, createSessionFamilyId, hashRefreshToken, signAccessToken } from "../../security/tokens.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

const BCRYPT_ROUNDS = 12;
const refreshLifetimeMs = 7 * 24 * 60 * 60 * 1000;

export class AuthError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "AuthError";
  }
}

function slugify(value: string): string {
  return value.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 48);
}

async function uniqueSlug(name: string): Promise<string> {
  const base = slugify(name) || "organization";
  let slug = base;
  for (let suffix = 1; await Organization.exists({ slug }); suffix += 1) {
    slug = `${base}-${suffix}`;
  }
  return slug;
}

function publicUser(user: { id: string; name: string; email: string }) {
  return { id: user.id, name: user.name, email: user.email };
}

async function issueSession(userId: string, organizationId: string, membershipId: string, metadata: { userAgent?: string; ipAddress?: string }, familyId = createSessionFamilyId()) {
  const refreshToken = createRefreshToken();
  const tokenHash = hashRefreshToken(refreshToken);
  await RefreshSession.create({
    userId, organizationId, tokenHash, familyId,
    expiresAt: new Date(Date.now() + refreshLifetimeMs),
    ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
    ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
  });
  const accessToken = signAccessToken({ sub: userId, org: organizationId, membership: membershipId });
  return { accessToken, refreshToken };
}

export async function register(input: RegisterInput, metadata: { userAgent?: string; ipAddress?: string }) {
  const email = input.email.toLowerCase();
  if (await User.exists({ email })) throw new AuthError("An account with this email already exists", 409);

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await User.create({ name: input.name, email, passwordHash });
  try {
    const organization = await Organization.create({
      name: input.organizationName,
      slug: await uniqueSlug(input.organizationName),
      createdBy: user._id,
    });
    const membership = await Membership.create({
      userId: user._id,
      organizationId: organization._id,
      role: "owner",
    });
    const tokens = await issueSession(user.id, organization.id, membership.id, metadata);
    return { user: publicUser(user), organization: { id: organization.id, name: organization.name, slug: organization.slug }, role: membership.role, ...tokens };
  } catch (error) {
    await User.deleteOne({ _id: user._id });
    throw error;
  }
}

export async function login(input: LoginInput, metadata: { userAgent?: string; ipAddress?: string }) {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid || user.status !== "active") throw new AuthError("Invalid email or password", 401);

  const membership = await Membership.findOne({ userId: user._id, status: "active" }).sort({ createdAt: 1 });
  if (!membership) throw new AuthError("No active organization membership was found", 403);
  const organization = await Organization.findOne({ _id: membership.organizationId, status: "active" });
  if (!organization) throw new AuthError("Organization is unavailable", 403);

  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueSession(user.id, organization.id, membership.id, metadata);
  return { user: publicUser(user), organization: { id: organization.id, name: organization.name, slug: organization.slug }, role: membership.role, ...tokens };
}

export async function rotateRefreshToken(token: string, metadata: { userAgent?: string; ipAddress?: string }) {
  const oldHash = hashRefreshToken(token);
  const existing = await RefreshSession.findOne({ tokenHash: oldHash }).select("+tokenHash +replacedByHash");
  if (!existing) throw new AuthError("Refresh session is invalid or expired", 401);

  if (existing.revokedAt || existing.replacedByHash || existing.expiresAt <= new Date()) {
    await RefreshSession.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw new AuthError("Refresh token reuse detected; sign in again", 401);
  }

  const membership = await Membership.findOne({
    userId: existing.userId, organizationId: existing.organizationId, status: "active",
  });
  const user = await User.findOne({ _id: existing.userId, status: "active" });
  const organization = await Organization.findOne({ _id: existing.organizationId, status: "active" });
  if (!membership || !user || !organization) {
    await RefreshSession.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw new AuthError("Session membership is no longer active", 401);
  }

  const nextToken = createRefreshToken();
  const nextHash = hashRefreshToken(nextToken);
  await RefreshSession.create({
    userId: existing.userId,
    organizationId: existing.organizationId,
    tokenHash: nextHash,
    familyId: existing.familyId,
    expiresAt: new Date(Date.now() + refreshLifetimeMs),
    ...(metadata.userAgent ? { userAgent: metadata.userAgent } : {}),
    ...(metadata.ipAddress ? { ipAddress: metadata.ipAddress } : {}),
  });

  const claimed = await RefreshSession.updateOne(
    { _id: existing._id, revokedAt: null, replacedByHash: null, expiresAt: { $gt: new Date() } },
    { $set: { revokedAt: new Date(), replacedByHash: nextHash } },
  );
  if (claimed.modifiedCount !== 1) {
    await RefreshSession.deleteOne({ tokenHash: nextHash });
    await RefreshSession.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw new AuthError("Refresh token was already used; sign in again", 401);
  }

  return {
    accessToken: signAccessToken({ sub: user.id, org: organization.id, membership: membership.id }),
    refreshToken: nextToken,
  };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshSession.updateOne(
    { tokenHash: hashRefreshToken(token), revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
}

export async function revokeAllUserSessions(userId: string): Promise<void> {
  await RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function createOrganizationForUser(userId: string, name: string) {
  const organization = await Organization.create({
    name,
    slug: `${await uniqueSlug(name)}-${randomUUID().slice(0, 6)}`,
    createdBy: userId,
  });
  const membership = await Membership.create({ userId, organizationId: organization._id, role: "owner" });
  return { id: organization.id, name: organization.name, slug: organization.slug, role: membership.role };
}

export const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: "/api/v1/auth",
  maxAge: refreshLifetimeMs,
};
