import type { Request, Response } from "express";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  verifyAccessToken: vi.fn(),
  userFindOne: vi.fn(),
  membershipFindOne: vi.fn(),
  organizationFindOne: vi.fn(),
  sessionExists: vi.fn(),
}));

vi.mock("../models/user.model.js", () => ({ User: { findOne: mocks.userFindOne } }));
vi.mock("../models/membership.model.js", () => ({ Membership: { findOne: mocks.membershipFindOne } }));
vi.mock("../models/organization.model.js", () => ({ Organization: { findOne: mocks.organizationFindOne } }));
vi.mock("../models/refresh-session.model.js", () => ({ RefreshSession: { exists: mocks.sessionExists } }));
vi.mock("../security/tokens.js", () => ({ verifyAccessToken: mocks.verifyAccessToken }));

import { authenticate } from "./authenticate.js";

function setupActiveTenant() {
  const membership = {
    id: "membership-a",
    organizationId: { toString: () => "org-a" },
    role: "procurement_officer",
  };

  mocks.verifyAccessToken.mockReturnValue({
    sub: "user-a",
    org: "org-a",
    membership: "membership-a",
    sid: "session-family-a",
  });
  mocks.userFindOne.mockReturnValue({
    select: vi.fn().mockResolvedValue({ id: "user-a" }),
  });
  mocks.membershipFindOne.mockResolvedValue(membership);
  mocks.organizationFindOne.mockReturnValue({
    select: vi.fn().mockResolvedValue({ id: "org-a" }),
  });
  mocks.sessionExists.mockResolvedValue(true);

  return membership;
}

function makeResponse() {
  return {
    status: vi.fn().mockReturnThis(),
    json: vi.fn(),
  } as unknown as Response;
}

describe("authenticate tenant context", () => {
  beforeEach(() => vi.clearAllMocks());

  it("derives the active tenant from verified claims and an exact membership match", async () => {
    setupActiveTenant();
    const req = {
      header: vi.fn().mockReturnValue("Bearer signed-token"),
    } as unknown as Request;
    const res = makeResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(mocks.membershipFindOne).toHaveBeenCalledWith({
      _id: "membership-a",
      userId: "user-a",
      organizationId: "org-a",
      status: "active",
    });
    expect(mocks.organizationFindOne).toHaveBeenCalledWith({ _id: "org-a", status: "active" });
    expect(mocks.sessionExists).toHaveBeenCalledWith({
      familyId: "session-family-a",
      userId: "user-a",
      organizationId: "org-a",
      revokedAt: null,
      expiresAt: { $gt: expect.any(Date) },
    });
    expect(req.auth).toMatchObject({
      userId: "user-a",
      organizationId: "org-a",
      membershipId: "membership-a",
      sessionFamilyId: "session-family-a",
      role: "procurement_officer",
    });
    expect(next).toHaveBeenCalledOnce();
    expect(res.status).not.toHaveBeenCalled();
  });

  it("rejects a verified user whose membership is not active in the claimed tenant", async () => {
    setupActiveTenant();
    mocks.membershipFindOne.mockResolvedValue(null);
    const req = {
      header: vi.fn().mockReturnValue("Bearer signed-token"),
    } as unknown as Request;
    const res = makeResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  it("rejects requests without a bearer access token", async () => {
    const req = {
      header: vi.fn().mockReturnValue(undefined),
    } as unknown as Request;
    const res = makeResponse();
    const next = vi.fn();

    await authenticate(req, res, next);

    expect(mocks.verifyAccessToken).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });
});
