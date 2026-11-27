import bcrypt from "bcryptjs";
import { createHash, randomBytes } from "node:crypto";
import mongoose from "mongoose";
import { AccountToken } from "../../models/account-token.model.js";
import { sendAccountEmail } from "../../services/email.service.js";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import { Membership } from "../../models/membership.model.js";
import { Organization } from "../../models/organization.model.js";
import { RefreshSession } from "../../models/refresh-session.model.js";
import { User } from "../../models/user.model.js";
import { createRefreshToken, createSessionFamilyId, hashRefreshToken, signAccessToken } from "../../security/tokens.js";
import { durationToMs } from "../../security/duration.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

const BCRYPT_ROUNDS = 12;
const refreshLifetimeMs = durationToMs(env.REFRESH_TOKEN_TTL);

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

function publicUser(user: { _id: { toString(): string }; name: string; email: string }) {
  return { id: user._id.toString(), name: user.name, email: user.email };
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
    accessToken: signAccessToken({ sub: userId, org: organizationId, membership: membershipId, sid: familyId }),
    refreshToken,
  };
}

export async function register(input: RegisterInput, _metadata: { userAgent?: string; ipAddress?: string }) {
  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const session = await mongoose.startSession();
  let created!: { user: typeof User.prototype; organization: typeof Organization.prototype; membership: typeof Membership.prototype };
  try {
    await session.withTransaction(async () => {
      const [user] = await User.create([{
        name: input.name, email: input.email.toLowerCase(), passwordHash,
      }], { session });
      const [organization] = await Organization.create([{
        name: input.organizationName,
        slug: await uniqueSlug(input.organizationName),
        createdBy: user._id,
      }], { session });
      const [membership] = await Membership.create([{
        userId: user._id, organizationId: organization._id, role: "owner",
      }], { session });
      created = { user, organization, membership };
    });
  } finally {
    await session.endSession();
  }

  const verificationToken = await createAccountToken(created.user.id, "email_verification");
  await sendAccountEmail({
    to: created.user.email,
    subject: "Verify your ProcuraOS email",
    text: `Verify your email by opening: ${env.WEB_ORIGIN}/verify-email?token=${encodeURIComponent(verificationToken)}`,
  });
  return {
    user: publicUser(created.user),
    organization: { id: created.organization.id, name: created.organization.name, slug: created.organization.slug },
    role: created.membership.role,
    verificationRequired: true,
  };
}

export async function login(input: LoginInput, metadata: { userAgent?: string; ipAddress?: string }) {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid || user.status !== "active") throw new AuthError("Invalid email or password", 401);
  if (!user.emailVerifiedAt) throw new AuthError("Verify your email address before signing in", 403);
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
  const session = await mongoose.startSession();
  let result!: { id: string; name: string; slug: string; role: string };
  try {
    await session.withTransaction(async () => {
      const [organization] = await Organization.create([{
        name, slug: `${await uniqueSlug(name)}-${randomUUID().slice(0, 6)}`, createdBy: userId,
      }], { session });
      const [membership] = await Membership.create([{
        userId, organizationId: organization._id, role: "owner",
      }], { session });
      result = { id: organization.id, name: organization.name, slug: organization.slug, role: membership.role };
    });
  } finally {
    await session.endSession();
  }
  return result;
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

const ACCOUNT_TOKEN_LIFETIMES = { email_verification: 24 * 60 * 60 * 1000, password_reset: 30 * 60 * 1000 } as const;
type AccountTokenPurpose = keyof typeof ACCOUNT_TOKEN_LIFETIMES;
function accountTokenHash(token: string) { return createHash("sha256").update(token).digest("hex"); }

async function createAccountToken(userId: string, purpose: AccountTokenPurpose) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + ACCOUNT_TOKEN_LIFETIMES[purpose]);
  await AccountToken.updateMany({ userId, purpose, consumedAt: null }, { $set: { consumedAt: new Date() } });
  await AccountToken.create({ userId, purpose, tokenHash: accountTokenHash(token), expiresAt });
  return token;
}

export async function verifyEmail(token: string) {
  const accountToken = await AccountToken.findOneAndUpdate(
    { tokenHash: accountTokenHash(token), purpose: "email_verification", consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } }, { new: true },
  );
  if (!accountToken) throw new AuthError("Verification link is invalid, expired or already used", 410);
  const user = await User.findOneAndUpdate(
    { _id: accountToken.userId, status: "active" },
    { $set: { emailVerifiedAt: new Date() } }, { new: true },
  );
  if (!user) throw new AuthError("Account is unavailable", 404);
  return { email: user.email, verified: true };
}

export async function requestPasswordReset(email: string) {
  const user = await User.findOne({ email: email.toLowerCase(), status: "active" }).select("email");
  if (!user) return;
  const token = await createAccountToken(user.id, "password_reset");
  await sendAccountEmail({
    to: user.email,
    subject: "Reset your ProcuraOS password",
    text: `Reset your password by opening: ${env.WEB_ORIGIN}/reset-password?token=${encodeURIComponent(token)}`,
  });
}

export async function resetPassword(token: string, password: string) {
  const accountToken = await AccountToken.findOneAndUpdate(
    { tokenHash: accountTokenHash(token), purpose: "password_reset", consumedAt: null, expiresAt: { $gt: new Date() } },
    { $set: { consumedAt: new Date() } }, { new: true },
  );
  if (!accountToken) throw new AuthError("Password reset link is invalid, expired or already used", 410);
  const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
  const user = await User.findOneAndUpdate(
    { _id: accountToken.userId, status: "active" },
    { $set: { passwordHash } }, { new: true },
  );
  if (!user) throw new AuthError("Account is unavailable", 404);
  await Promise.all([
    RefreshSession.updateMany({ userId: user._id, revokedAt: null }, { $set: { revokedAt: new Date() } }),
    AccountToken.updateMany({ userId: user._id, consumedAt: null }, { $set: { consumedAt: new Date() } }),
  ]);
  return { passwordReset: true };
}
