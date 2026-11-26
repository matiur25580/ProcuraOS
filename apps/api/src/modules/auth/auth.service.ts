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
  for (let suffix = 1; await Organization.exists({ slug }); suffix += 1) slug = `${base}-${suffix}`;
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
  return {
    accessToken: signAccessToken({ sub: userId, org: organizationId, membership: membershipId }),
    refreshToken,
  };
}

export async function register(input: RegisterInput, metadata: { userAgent?: string; ipAddress?: string }) {
  if (await User.exists({ email: input.email.toLowerCase() })) throw new AuthError("An account with this email already exists", 409);
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const user = await User.create({ name: input.name, email: input.email.toLowerCase(), passwordHash });
  let organizationId: string | undefined;
  try {
    const organization = await Organization.create({ name: input.organizationName, slug: await uniqueSlug(input.organizationName), createdBy: user._id });
    organizationId = organization.id;
    const membership = await Membership.create({ userId: user._id, organizationId: organization._id, role: "owner" });
    const tokens = await issueSession(user.id, organization.id, membership.id, metadata);
    return { user: publicUser(user), organization: { id: organization.id, name: organization.name, slug: organization.slug }, role: membership.role, ...tokens };
  } catch (error) {
    if (organizationId) {
      await Promise.all([
        Membership.deleteMany({ userId: user._id, organizationId }),
        Organization.deleteOne({ _id: organizationId }),
      ]);
    }
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

  const [membership, user, organization] = await Promise.all([
    Membership.findOne({ userId: existing.userId, organizationId: existing.organizationId, status: "active" }),
    User.findOne({ _id: existing.userId, status: "active" }),
    Organization.findOne({ _id: existing.organizationId, status: "active" }),
  ]);
  if (!membership || !user || !organization) {
    await RefreshSession.updateMany({ familyId: existing.familyId, revokedAt: null }, { $set: { revokedAt: new Date() } });
    throw new AuthError("Session membership is no longer active", 401);
  }

  const nextToken = createRefreshToken();
  const nextHash = hashRefreshToken(nextToken);
  await RefreshSession.create({
    userId: existing.userId, organizationId: existing.organizationId, tokenHash: nextHash,
    familyId: existing.familyId, expiresAt: new Date(Date.now() + refreshLifetimeMs),
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
    accessToken: signAccessToken({ sub: user.id, org: organization.id, membership: membership.id, sid: existing.familyId }),
    refreshToken: nextToken,
  };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  await RefreshSession.updateOne({ tokenHash: hashRefreshToken(token), revokedAt: null }, { $set: { revokedAt: new Date() } });
}
export async function revokeAllUserSessions(userId: string): Promise<void> {
  await RefreshSession.updateMany({ userId, revokedAt: null }, { $set: { revokedAt: new Date() } });
}

export async function createOrganizationForUser(userId: string, name: string) {
  const organization = await Organization.create({
    name, slug: `${await uniqueSlug(name)}-${randomUUID().slice(0, 6)}`, createdBy: userId,
  });
  try {
    const membership = await Membership.create({ userId, organizationId: organization._id, role: "owner" });
    return { id: organization.id, name: organization.name, slug: organization.slug, role: membership.role };
  } catch (error) {
    await Organization.deleteOne({ _id: organization._id });
    throw error;
  }
}

export async function listUserOrganizations(userId: string) {
  const memberships = await Membership.find({ userId, status: "active" }).select("organizationId role");
  const organizations = await Organization.find({
    _id: { $in: memberships.map((membership) => membership.organizationId) }, status: "active",
  }).select("name slug");
  const byId = new Map(organizations.map((organization) => [organization.id, organization]));
  return memberships.flatMap((membership) => {
    const organization = byId.get(membership.organizationId.toString());
    return organization ? [{ id: organization.id, name: organization.name, slug: organization.slug, role: membership.role }] : [];
  });
}

export async function switchUserOrganization(userId: string, organizationId: string, metadata: { userAgent?: string; ipAddress?: string }) {
  const [membership, organization] = await Promise.all([
    Membership.findOne({ userId, organizationId, status: "active" }),
    Organization.findOne({ _id: organizationId, status: "active" }),
  ]);
  if (!membership || !organization) throw new AuthError("You are not an active member of this organization", 403);
  const user = await User.findOne({ _id: userId, status: "active" });
  if (!user) throw new AuthError("Account is unavailable", 401);
  const tokens = await issueSession(user.id, organization.id, membership.id, metadata);
  return { organization: { id: organization.id, name: organization.name, slug: organization.slug }, role: membership.role, ...tokens };
}

export async function updateUserProfile(userId: string, name: string) {
  const user = await User.findOneAndUpdate({ _id: userId, status: "active" }, { $set: { name } }, { new: true }).select("name email");
  if (!user) throw new AuthError("Account is unavailable", 404);
  return publicUser(user);
}

export const refreshCookieOptions = {
  httpOnly: true,
  secure: env.NODE_ENV === "production",
  sameSite: "strict" as const,
  path: `${env.API_PREFIX}/auth`,
  maxAge: refreshLifetimeMs,
};
