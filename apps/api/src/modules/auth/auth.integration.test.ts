import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { requireStepUp } from "../../middleware/require-step-up.js";

let replicaSet!: MongoMemoryReplSet;
let mongoose!: typeof import("mongoose").default;
let auth: typeof import("./auth.service.js");
let User: typeof import("../../models/user.model.js").User;
let Organization: typeof import("../../models/organization.model.js").Organization;
let Membership: typeof import("../../models/membership.model.js").Membership;
let RefreshSession: typeof import("../../models/refresh-session.model.js").RefreshSession;
let StepUpGrant: typeof import("../../models/step-up-grant.model.js").StepUpGrant;
let AuditEvent: typeof import("../../models/audit-event.model.js").AuditEvent;

const metadata = { userAgent: "ProcuraOS integration test", ipAddress: "127.0.0.1" };

async function registerUser(email: string, organizationName: string) {
  const registered = await auth.register({
    name: "Integration User",
    email,
    password: "CorrectHorseBattery9",
    organizationName,
  }, metadata);
  await auth.verifyEmail(registered.verificationToken!);
  const session = await auth.login({ email, password: "CorrectHorseBattery9" }, metadata);
  return { ...registered, ...session };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({
    replSet: { count: 1, storageEngine: "wiredTiger" },
  });

  process.env.NODE_ENV = "test";
  const mongoUri = replicaSet.getUri("procuraos_auth_integration");
  process.env.MONGODB_URI = mongoUri;
  process.env.JWT_ACCESS_SECRET = "integration-test-secret-that-is-long-enough-32";
  process.env.ACCESS_TOKEN_TTL = "15m";
  process.env.REFRESH_TOKEN_TTL = "7d";
  process.env.WEB_ORIGIN = "http://localhost:5173";

  const mongooseModule = await import("mongoose");
  mongoose = mongooseModule.default;
  await mongoose.connect(mongoUri);

  auth = await import("./auth.service.js");
  ({ User } = await import("../../models/user.model.js"));
  ({ Organization } = await import("../../models/organization.model.js"));
  ({ Membership } = await import("../../models/membership.model.js"));
  ({ RefreshSession } = await import("../../models/refresh-session.model.js"));
  ({ StepUpGrant } = await import("../../models/step-up-grant.model.js"));
  ({ AuditEvent } = await import("../../models/audit-event.model.js"));

  await Promise.all([
    User.init(),
    Organization.init(),
    Membership.init(),
    RefreshSession.init(),
    StepUpGrant.init(),
    AuditEvent.init(),
    (await import("../../models/account-token.model.js")).AccountToken.init(),
  ]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Membership.deleteMany({}),
    RefreshSession.deleteMany({}),
    StepUpGrant.deleteMany({}),
    AuditEvent.deleteMany({}),
    (await import("../../models/account-token.model.js")).AccountToken.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose?.disconnect();
  await replicaSet?.stop();
});

describe("authentication and tenant integration", () => {
  it("registers a user, creates an owner tenant and stores only a password hash", async () => {
    const result = await registerUser("owner@example.test", "Acme Procurement");

    const user = await User.findOne({ email: "owner@example.test" }).select("+passwordHash");
    const membership = await Membership.findOne({ userId: user?._id });
    const organization = await Organization.findById(result.organization.id);
    const session = await RefreshSession.findOne({ userId: user?._id }).select("+tokenHash");

    expect(user).not.toBeNull();
    expect(user?.passwordHash).not.toBe("CorrectHorseBattery9");
    const bcrypt = await import("bcryptjs");
    expect(await bcrypt.compare("CorrectHorseBattery9", user!.passwordHash)).toBe(true);
    expect(membership?.role).toBe("owner");
    expect(membership?.organizationId.toString()).toBe(organization?.id);
    expect(session?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(session?.tokenHash).not.toBe(result.refreshToken);
    expect(result.accessToken).toBeTruthy();
  });

  it("requires email verification before login and consumes verification links once", async () => {
    const registered = await auth.register({
      name: "Integration User", email: "verify@example.test", password: "CorrectHorseBattery9",
      organizationName: "Verification Tenant",
    }, metadata);
    await expect(auth.login({ email: "verify@example.test", password: "CorrectHorseBattery9" }, metadata))
      .rejects.toMatchObject({ statusCode: 403 });
    const verified = await auth.verifyEmail(registered.verificationToken!);
    expect(verified.verified).toBe(true);
    await expect(auth.verifyEmail(registered.verificationToken!)).rejects.toMatchObject({ statusCode: 410 });
    const login = await auth.login({ email: "verify@example.test", password: "CorrectHorseBattery9" }, metadata);
    expect(login.accessToken).toBeTruthy();
  });

  it("resets a password once and revokes existing sessions", async () => {
    const registered = await registerUser("reset@example.test", "Reset Tenant");
    const login = await auth.login({ email: "reset@example.test", password: "CorrectHorseBattery9" }, metadata);
    const token = await auth.requestPasswordReset("reset@example.test");
    expect(token).toBeTruthy();
    await auth.resetPassword(token!, "NewSecurePassword2026");
    expect(await RefreshSession.countDocuments({ userId: registered.user.id, revokedAt: null })).toBe(0);
    await expect(auth.login({ email: "reset@example.test", password: "CorrectHorseBattery9" }, metadata))
      .rejects.toMatchObject({ statusCode: 401 });
    const renewed = await auth.login({ email: "reset@example.test", password: "NewSecurePassword2026" }, metadata);
    expect(renewed.accessToken).toBeTruthy();
    await expect(auth.resetPassword(token!, "AnotherSecurePassword2026"))
      .rejects.toMatchObject({ statusCode: 410 });
  });


  it("enforces TOTP MFA and consumes recovery codes exactly once", async () => {
    const registered = await registerUser("mfa@example.test", "MFA Tenant");
    const enrollment = await auth.setupMfa(registered.user.id, registered.organization.id, metadata);
    const decodeBase32 = (value: string) => {
      const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
      let bits = 0, buffer = 0;
      const output: number[] = [];
      for (const char of value) {
        buffer = (buffer << 5) | alphabet.indexOf(char); bits += 5;
        if (bits >= 8) { output.push((buffer >>> (bits - 8)) & 255); bits -= 8; }
      }
      return Buffer.from(output);
    };
    const counter = Math.floor(Date.now() / 30_000);
    const codeFor = async (offsetCounter: number) => {
      const message = Buffer.alloc(8); message.writeBigUInt64BE(BigInt(counter + offsetCounter));
      const digest = (await import("node:crypto")).createHmac("sha1", decodeBase32(enrollment.secret)).update(message).digest();
      const offset = digest[digest.length - 1]! & 15;
      const binary = ((digest[offset]! & 127) << 24) | ((digest[offset + 1]! & 255) << 16) | ((digest[offset + 2]! & 255) << 8) | (digest[offset + 3]! & 255);
      return String(binary % 1_000_000).padStart(6, "0");
    };
    const code = await codeFor(0);
    const enabled = await auth.enableMfa(registered.user.id, registered.organization.id, code, metadata);
    expect(enabled.mfaEnabled).toBe(true);
    expect(enabled.recoveryCodes).toHaveLength(10);
    const stored = await User.findById(registered.user.id).select("+mfaSecretEncrypted +mfaRecoveryCodeHashes");
    expect(stored?.mfaSecretEncrypted).not.toContain(enrollment.secret);
    await expect(auth.login({ email: "mfa@example.test", password: "CorrectHorseBattery9" }, metadata))
      .rejects.toMatchObject({ statusCode: 401 });
    const nextCode = await codeFor(1);
    const signedIn = await auth.login({ email: "mfa@example.test", password: "CorrectHorseBattery9", otp: nextCode }, metadata);
    expect(signedIn.accessToken).toBeTruthy();
    const recovery = enabled.recoveryCodes[0]!;
    await expect(auth.login({ email: "mfa@example.test", password: "CorrectHorseBattery9", otp: nextCode }, metadata)).rejects.toMatchObject({ statusCode: 401 });
    const recovered = await auth.login({ email: "mfa@example.test", password: "CorrectHorseBattery9", otp: recovery }, metadata);
    expect(recovered.accessToken).toBeTruthy();
    await expect(auth.login({ email: "mfa@example.test", password: "CorrectHorseBattery9", otp: recovery }, metadata))
      .rejects.toMatchObject({ statusCode: 401 });
  });


  it("issues short-lived, session-bound step-up grants and stores only their hashes", async () => {
    const registered = await registerUser("stepup@example.test", "Step Up Tenant");
    const session = await RefreshSession.findOne({ userId: registered.user.id }).sort({ createdAt: -1 });
    const grant = await auth.issueStepUpGrant(registered.user.id, registered.organization.id, session!.familyId, "CorrectHorseBattery9", undefined, metadata);
    const stored = await StepUpGrant.findOne({ userId: registered.user.id }).select("+tokenHash");
    expect(grant.token).toBeTruthy();
    expect(grant.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(stored?.tokenHash).toMatch(/^[a-f0-9]{64}$/);
    expect(stored?.tokenHash).not.toBe(grant.token);
    const request = (sessionFamilyId: string) => ({
      header: (name: string) => name === "x-step-up-token" ? grant.token : undefined,
      get: () => "ProcuraOS integration test",
      ip: "127.0.0.1",
      path: "/api/v1/purchase-orders/test/approve",
      auth: { userId: registered.user.id, organizationId: registered.organization.id, sessionFamilyId },
    });
    const response = () => ({
      statusCode: 200, body: null,
      status(code: number) { this.statusCode = code; return this; },
      json(body: unknown) { this.body = body; return this; },
    });
    let nextCalls = 0;
    const next = (error?: unknown) => { if (error) throw error; nextCalls += 1; };
    const wrongSessionResponse = response();
    await requireStepUp(request("different-session") as never, wrongSessionResponse as never, next as never);
    expect(wrongSessionResponse.statusCode).toBe(403);
    const acceptedResponse = response();
    await requireStepUp(request(session!.familyId) as never, acceptedResponse as never, next as never);
    expect(nextCalls).toBe(1);
    const replayResponse = response();
    await requireStepUp(request(session!.familyId) as never, replayResponse as never, next as never);
    expect(replayResponse.statusCode).toBe(403);

    const filter = {
      tokenHash: (await import("node:crypto")).createHash("sha256").update(grant.token).digest("hex"),
      userId: registered.user.id, organizationId: registered.organization.id,
      sessionFamilyId: session!.familyId, consumedAt: null, expiresAt: { $gt: new Date() },
    };
    expect(await StepUpGrant.findOneAndUpdate(filter, { $set: { consumedAt: new Date() } }, { new: true })).not.toBeNull();
    expect(await StepUpGrant.findOneAndUpdate(filter, { $set: { consumedAt: new Date() } }, { new: true })).toBeNull();
  });

  it("authenticates with bcrypt and rejects an incorrect password", async () => {
    const registered = await registerUser("login@example.test", "Login Tenant");

    const result = await auth.login({
      email: "login@example.test",
      password: "CorrectHorseBattery9",
    }, metadata);

    expect(result.user.email).toBe("login@example.test");
    expect(result.accessToken).toBeTruthy();

    await expect(auth.login({
      email: "login@example.test",
      password: "WrongPassword123",
    }, metadata)).rejects.toMatchObject({ statusCode: 401 });
    const failureEvent = await AuditEvent.findOne({ action: "auth.login.failed", actorUserId: registered.user.id });
    expect(failureEvent?.outcome).toBe("failure");
  });

  it("rotates refresh tokens and revokes the family when the old token is replayed", async () => {
    const registered = await registerUser("rotate@example.test", "Rotation Tenant");
    const rotated = await auth.rotateRefreshToken(registered.refreshToken, metadata);

    expect(rotated.refreshToken).not.toBe(registered.refreshToken);
    await expect(auth.rotateRefreshToken(registered.refreshToken, metadata))
      .rejects.toMatchObject({ statusCode: 401 });

    const sessions = await RefreshSession.find({ userId: registered.user.id });
    expect(sessions.length).toBe(2);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });

  it("fails closed when two requests race to rotate the same refresh token", async () => {
    const registered = await registerUser("race@example.test", "Race Tenant");

    const attempts = await Promise.allSettled([
      auth.rotateRefreshToken(registered.refreshToken, metadata),
      auth.rotateRefreshToken(registered.refreshToken, metadata),
    ]);

    expect(attempts.filter((attempt) => attempt.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((attempt) => attempt.status === "rejected")).toHaveLength(1);

    const sessions = await RefreshSession.find({ userId: registered.user.id });
    expect(sessions.length).toBeGreaterThanOrEqual(1);
    expect(sessions.every((session) => session.revokedAt !== null)).toBe(true);
  });

  it("revokes every active session when the user signs out everywhere", async () => {
    const registered = await registerUser("revoke@example.test", "Revocation Tenant");
    await auth.rotateRefreshToken(registered.refreshToken, metadata);
    await auth.revokeAllUserSessions(registered.user.id);

    expect(await RefreshSession.countDocuments({
      userId: registered.user.id,
      revokedAt: null,
    })).toBe(0);
  });

  it("does not allow a user to switch into an organization without active membership", async () => {
    const first = await registerUser("first@example.test", "First Tenant");
    const second = await registerUser("second@example.test", "Second Tenant");

    await expect(auth.switchUserOrganization(
      first.user.id,
      second.organization.id,
      metadata,
    )).rejects.toMatchObject({ statusCode: 403 });
  });

  it("issues a new tenant-bound session only after verifying membership", async () => {
    const registered = await registerUser("switch@example.test", "Original Tenant");
    const secondOrganization = await auth.createOrganizationForUser(
      registered.user.id,
      "Additional Tenant",
    );

    const switched = await auth.switchUserOrganization(
      registered.user.id,
      secondOrganization.id,
      metadata,
    );

    expect(switched.organization.id).toBe(secondOrganization.id);
    expect(switched.role).toBe("owner");
    expect(switched.accessToken).toBeTruthy();
  });
});
