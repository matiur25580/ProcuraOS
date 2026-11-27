import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { MongoMemoryReplSet } from "mongodb-memory-server";

let replicaSet!: MongoMemoryReplSet;
let mongoose!: typeof import("mongoose").default;
let auth: typeof import("./auth.service.js");
let User: typeof import("../../models/user.model.js").User;
let Organization: typeof import("../../models/organization.model.js").Organization;
let Membership: typeof import("../../models/membership.model.js").Membership;
let RefreshSession: typeof import("../../models/refresh-session.model.js").RefreshSession;

const metadata = { userAgent: "ProcuraOS integration test", ipAddress: "127.0.0.1" };

async function registerUser(email: string, organizationName: string) {
  return auth.register({
    name: "Integration User",
    email,
    password: "CorrectHorseBattery9",
    organizationName,
  }, metadata);
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

  await Promise.all([
    User.init(),
    Organization.init(),
    Membership.init(),
    RefreshSession.init(),
  ]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    User.deleteMany({}),
    Organization.deleteMany({}),
    Membership.deleteMany({}),
    RefreshSession.deleteMany({}),
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

  it("authenticates with bcrypt and rejects an incorrect password", async () => {
    await registerUser("login@example.test", "Login Tenant");

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
