import bcrypt from "bcryptjs";
import { createHash, randomBytes, createCipheriv, createDecipheriv, createHmac } from "node:crypto";
import mongoose from "mongoose";
import { AccountToken } from "../../models/account-token.model.js";
import { StepUpGrant } from "../../models/step-up-grant.model.js";
import { AuditEvent } from "../../models/audit-event.model.js";
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

async function recordAuthenticationEvent(input: { organizationId?: unknown; actorUserId?: unknown; action: string; outcome?: "success" | "failure"; metadata?: Record<string, unknown>; ipAddress?: string; userAgent?: string }) {
  await AuditEvent.create({
    organizationId: input.organizationId ?? null,
    actorUserId: input.actorUserId ?? null,
    action: input.action,
    outcome: input.outcome ?? "success",
    targetType: "authentication",
    metadata: input.metadata ?? {},
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
  });
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
      const users = await User.create([{
        name: input.name, email: input.email.toLowerCase(), passwordHash,
      }], { session });
      const user = users[0];
      if (!user) throw new Error("User provisioning did not return a document");
      const organizations = await Organization.create([{
        name: input.organizationName,
        slug: await uniqueSlug(input.organizationName),
        createdBy: user._id,
      }], { session });
      const organization = organizations[0];
      if (!organization) throw new Error("Organization provisioning did not return a document");
      const memberships = await Membership.create([{
        userId: user._id, organizationId: organization._id, role: "owner",
      }], { session });
      const membership = memberships[0];
      if (!membership) throw new Error("Owner membership provisioning did not return a document");
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
    ...(env.NODE_ENV === "test" ? { verificationToken } : {}),
  };
}

export async function login(input: LoginInput, metadata: { userAgent?: string; ipAddress?: string }) {
  const user = await User.findOne({ email: input.email.toLowerCase() }).select("+passwordHash");
  const valid = user ? await bcrypt.compare(input.password, user.passwordHash) : false;
  if (!user || !valid || user.status !== "active") {
    const membership = user ? await Membership.findOne({ userId: user._id, status: "active" }).select("organizationId") : null;
    await recordAuthenticationEvent({ organizationId: membership?.organizationId, actorUserId: user?._id, action: "auth.login.failed", outcome: "failure", metadata: { reason: "invalid_credentials" }, ...metadata });
    throw new AuthError("Invalid email or password", 401);
  }
  if (!user.emailVerifiedAt) {
    await recordAuthenticationEvent({ actorUserId: user._id, action: "auth.login.failed", outcome: "failure", metadata: { reason: "email_unverified" }, ...metadata });
    throw new AuthError("Verify your email address before signing in", 403);
  }
  if (user.mfaEnabled) {
    if (!input.otp) { await recordAuthenticationEvent({ actorUserId: user._id, action: "auth.login.failed", outcome: "failure", metadata: { reason: "mfa_required" }, ...metadata }); throw new AuthError("A one-time password or recovery code is required", 401); }
    const securedUser = await User.findById(user._id).select("+mfaSecretEncrypted +mfaRecoveryCodeHashes");
    if (!securedUser || !(await consumeMfaCredential(securedUser, input.otp))) { await recordAuthenticationEvent({ actorUserId: user._id, action: "auth.login.failed", outcome: "failure", metadata: { reason: "invalid_mfa" }, ...metadata }); throw new AuthError("Invalid one-time password or recovery code", 401); }
  }
  const membership = await Membership.findOne({ userId: user._id, status: "active" }).sort({ createdAt: 1 });
  if (!membership) throw new AuthError("No active organization membership was found", 403);
  const organization = await Organization.findOne({ _id: membership.organizationId, status: "active" });
  if (!organization) throw new AuthError("Organization is unavailable", 403);
  user.lastLoginAt = new Date();
  await user.save();
  const tokens = await issueSession(user.id, organization.id, membership.id, metadata);
  await recordAuthenticationEvent({ organizationId: organization._id, actorUserId: user._id, action: "auth.login.succeeded", metadata });
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
  await recordAuthenticationEvent({ organizationId: organization._id, actorUserId: user._id, action: "auth.session.refreshed", metadata });
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
      const organizations = await Organization.create([{
        name, slug: `${await uniqueSlug(name)}-${randomUUID().slice(0, 6)}`, createdBy: userId,
      }], { session });
      const organization = organizations[0];
      if (!organization) throw new Error("Organization provisioning did not return a document");
      const memberships = await Membership.create([{
        userId, organizationId: organization._id, role: "owner",
      }], { session });
      const membership = memberships[0];
      if (!membership) throw new Error("Owner membership provisioning did not return a document");
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
  await recordAuthenticationEvent({ organizationId: organization._id, actorUserId: user._id, action: "auth.organization.switched", metadata: { toOrganizationId: organization.id }, ...metadata });
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
  return env.NODE_ENV === "test" ? token : undefined;
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

const MFA_ISSUER = "ProcuraOS";
function mfaKey() { return env.MFA_ENCRYPTION_KEY ? Buffer.from(env.MFA_ENCRYPTION_KEY, "hex") : createHash("sha256").update(env.JWT_ACCESS_SECRET).digest(); }
function encryptMfaSecret(secret: string) {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", mfaKey(), iv);
  const encrypted = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return [iv.toString("base64url"), cipher.getAuthTag().toString("base64url"), encrypted.toString("base64url")].join(".");
}
function decryptMfaSecret(value: string) {
  const [iv, tag, ciphertext] = value.split(".");
  if (!iv || !tag || !ciphertext) throw new AuthError("MFA configuration is invalid", 500);
  const decipher = createDecipheriv("aes-256-gcm", mfaKey(), Buffer.from(iv, "base64url"));
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
function base32Encode(bytes: Buffer) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, value = 0, output = "";
  for (const byte of bytes) { value = (value << 8) | byte; bits += 8; while (bits >= 5) { output += alphabet[(value >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits) output += alphabet[(value << (5 - bits)) & 31];
  return output;
}
function base32Decode(value: string) {
  const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
  let bits = 0, buffer = 0;
  const output: number[] = [];
  for (const char of value.replace(/=+$/g, "").toUpperCase()) {
    const index = alphabet.indexOf(char);
    if (index < 0) throw new AuthError("Invalid MFA secret", 400);
    buffer = (buffer << 5) | index; bits += 5;
    if (bits >= 8) { output.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(output);
}
function totp(secret: string, counter: number) {
  const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac("sha1", base32Decode(secret)).update(message).digest();
  const offset = digest[digest.length - 1]! & 15;
  const binary = ((digest[offset]! & 127) << 24) | ((digest[offset + 1]! & 255) << 16) | ((digest[offset + 2]! & 255) << 8) | (digest[offset + 3]! & 255);
  return String(binary % 1_000_000).padStart(6, "0");
}
function verifyTotp(secret: string, code: string) {
  if (!/^\d{6}$/.test(code)) return false;
  const counter = Math.floor(Date.now() / 30_000);
  return [-1, 0, 1].some((drift) => totp(secret, counter + drift) === code);
}
function recoveryHash(code: string) { return createHash("sha256").update(code.replace(/-/g, "").toUpperCase()).digest("hex"); }
async function consumeMfaCredential(user: { mfaSecretEncrypted?: string | null; mfaRecoveryCodeHashes?: string[]; save(): Promise<unknown> }, code: string) {
  if (user.mfaSecretEncrypted && verifyTotp(decryptMfaSecret(user.mfaSecretEncrypted), code)) return true;
  const hash = recoveryHash(code);
  const result = await User.updateOne({ _id: (user as any)._id, mfaRecoveryCodeHashes: hash }, { $pull: { mfaRecoveryCodeHashes: hash } });
  return result.modifiedCount === 1;
}
async function recordMfaAudit(organizationId: string, userId: string, action: string, metadata: { ipAddress?: string; userAgent?: string }) {
  await AuditEvent.create({ organizationId, actorUserId: userId, action, targetType: "user", targetId: userId, metadata: {}, ...metadata });
}
export async function setupMfa(userId: string, organizationId: string, metadata: { ipAddress?: string; userAgent?: string }) {
  const user = await User.findOne({ _id: userId, status: "active" }).select("+mfaSecretEncrypted");
  if (!user) throw new AuthError("Account is unavailable", 404);
  if (user.mfaEnabled) throw new AuthError("Multi-factor authentication is already enabled", 409);
  const secret = base32Encode(randomBytes(20));
  user.mfaPendingSecretEncrypted = encryptMfaSecret(secret);
  await user.save();
  const label = encodeURIComponent(user.email);
  return { secret, otpauthUrl: `otpauth://totp/${encodeURIComponent(MFA_ISSUER)}:${label}?secret=${secret}&issuer=${encodeURIComponent(MFA_ISSUER)}&algorithm=SHA1&digits=6&period=30` };
}
export async function enableMfa(userId: string, organizationId: string, code: string, metadata: { ipAddress?: string; userAgent?: string }) {
  const user = await User.findById(userId).select("+mfaPendingSecretEncrypted +mfaSecretEncrypted +mfaRecoveryCodeHashes");
  if (!user?.mfaPendingSecretEncrypted) throw new AuthError("Start MFA enrollment before confirming it", 409);
  const secret = decryptMfaSecret(user.mfaPendingSecretEncrypted);
  if (!verifyTotp(secret, code)) throw new AuthError("The authenticator code is invalid", 400);
  const recoveryCodes = Array.from({ length: 10 }, () => {
    const raw = randomBytes(5).toString("hex").toUpperCase();
    return raw.match(/.{1,5}/g)!.join("-");
  });
  user.mfaSecretEncrypted = user.mfaPendingSecretEncrypted;
  user.mfaPendingSecretEncrypted = null;
  user.mfaRecoveryCodeHashes = recoveryCodes.map(recoveryHash);
  user.mfaEnabled = true;
  await user.save();
  await recordMfaAudit(organizationId, userId, "auth.mfa.enabled", metadata);
  return { mfaEnabled: true, recoveryCodes };
}
export async function disableMfa(userId: string, organizationId: string, password: string, code: string, metadata: { ipAddress?: string; userAgent?: string }) {
  const user = await User.findOne({ _id: userId, status: "active" }).select("+passwordHash +mfaSecretEncrypted +mfaRecoveryCodeHashes");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) throw new AuthError("Invalid account credentials", 401);
  if (!user.mfaEnabled || !(await consumeMfaCredential(user, code))) throw new AuthError("Invalid MFA credential", 401);
  user.mfaEnabled = false;
  user.mfaSecretEncrypted = null;
  user.mfaPendingSecretEncrypted = null;
  user.mfaRecoveryCodeHashes = [];
  await user.save();
  await recordMfaAudit(organizationId, userId, "auth.mfa.disabled", metadata);
}

const STEP_UP_LIFETIME_MS = 5 * 60 * 1000;
export async function issueStepUpGrant(userId: string, organizationId: string, sessionFamilyId: string, password: string, otp: string | undefined, metadata: { ipAddress?: string; userAgent?: string }) {
  const user = await User.findOne({ _id: userId, status: "active" }).select("+passwordHash +mfaSecretEncrypted +mfaRecoveryCodeHashes");
  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    await recordAuthenticationEvent({ organizationId, actorUserId: userId, action: "auth.step_up.failed", outcome: "failure", metadata: { reason: "invalid_password" }, ...metadata });
    throw new AuthError("Account verification failed", 401);
  }
  if (user.mfaEnabled) {
    if (!otp || !(await consumeMfaCredential(user, otp))) {
      await recordAuthenticationEvent({ organizationId, actorUserId: userId, action: "auth.step_up.failed", outcome: "failure", metadata: { reason: "invalid_or_missing_mfa" }, ...metadata });
      throw new AuthError("A valid authenticator or unused recovery code is required", 401);
    }
  }
  const token = randomBytes(32).toString("base64url");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + STEP_UP_LIFETIME_MS);
  const grant = await StepUpGrant.create({ tokenHash, userId, organizationId, sessionFamilyId, expiresAt });
  await recordAuthenticationEvent({ organizationId, actorUserId: userId, action: "auth.step_up.issued", metadata: { grantId: grant.id, expiresAt }, ...metadata });
  return { token, expiresAt };
}
