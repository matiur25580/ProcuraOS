import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { Invitation } from "../../models/invitation.model.js";
import { Membership, type OrganizationRole } from "../../models/membership.model.js";
import { Organization } from "../../models/organization.model.js";
import { RefreshSession } from "../../models/refresh-session.model.js";
import { User } from "../../models/user.model.js";
import type { CreateInvitationInput, UpdateMemberInput } from "./organization.schemas.js";

const INVITATION_LIFETIME_MS = 7 * 24 * 60 * 60 * 1000;

export class OrganizationError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "OrganizationError";
  }
}

function tokenHash(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

async function audit(input: {
  organizationId: string;
  actorUserId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}) {
  await AuditEvent.create({
    organizationId: input.organizationId,
    actorUserId: input.actorUserId,
    action: input.action,
    targetType: input.targetType,
    ...(input.targetId ? { targetId: input.targetId } : {}),
    metadata: input.metadata ?? {},
    ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
    ...(input.userAgent ? { userAgent: input.userAgent } : {}),
  });
}

export async function getOrganization(organizationId: string) {
  const organization = await Organization.findOne({ _id: organizationId, status: "active" }).select("name slug status");
  if (!organization) throw new OrganizationError("Organization was not found", 404);
  return { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status };
}

export async function updateOrganization(
  organizationId: string,
  actorUserId: string,
  name: string,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  const organization = await Organization.findOneAndUpdate(
    { _id: organizationId, status: "active" },
    { $set: { name } },
    { new: true, runValidators: true },
  );
  if (!organization) throw new OrganizationError("Organization was not found", 404);
  await audit({ organizationId, actorUserId, action: "organization.updated", targetType: "organization", targetId: organizationId, metadata: { name }, ...metadata });
  return { id: organization.id, name: organization.name, slug: organization.slug, status: organization.status };
}

export async function listMembers(organizationId: string) {
  const memberships = await Membership.find({ organizationId }).sort({ createdAt: 1 }).lean();
  const userIds = memberships.map((membership) => membership.userId);
  const users = await User.find({ _id: { $in: userIds } }).select("name email status").lean();
  const userById = new Map(users.map((user) => [user._id.toString(), user]));
  return memberships.map((membership) => {
    const user = userById.get(membership.userId.toString());
    return {
      membershipId: membership._id.toString(),
      userId: membership.userId.toString(),
      name: user?.name ?? "Unavailable account",
      email: user?.email ?? "",
      accountStatus: user?.status ?? "unavailable",
      role: membership.role,
      status: membership.status,
      joinedAt: membership.createdAt,
    };
  });
}

export async function updateMember(
  organizationId: string,
  actorUserId: string,
  membershipId: string,
  changes: UpdateMemberInput,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  if (!Types.ObjectId.isValid(membershipId)) throw new OrganizationError("Invalid membership identifier", 400);
  const membership = await Membership.findOne({ _id: membershipId, organizationId });
  if (!membership) throw new OrganizationError("Organization member was not found", 404);
  if (membership.role === "owner") throw new OrganizationError("Owner membership is protected; use a dedicated ownership-transfer workflow", 409);
  if (membership.userId.toString() === actorUserId) throw new OrganizationError("You cannot change your own membership", 409);

  const previous = { role: membership.role, status: membership.status };
  if (changes.role) membership.role = changes.role as OrganizationRole;
  if (changes.status) membership.status = changes.status;
  await membership.save();

  if (changes.status === "suspended") {
    await RefreshSession.updateMany(
      { userId: membership.userId, organizationId, revokedAt: null },
      { $set: { revokedAt: new Date() } },
    );
  }
  await audit({
    organizationId, actorUserId, action: "member.updated", targetType: "membership",
    targetId: membership.id, metadata: { previous, current: { role: membership.role, status: membership.status } }, ...metadata,
  });
  return { membershipId: membership.id, userId: membership.userId.toString(), role: membership.role, status: membership.status };
}

export async function removeMember(
  organizationId: string,
  actorUserId: string,
  membershipId: string,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  if (!Types.ObjectId.isValid(membershipId)) throw new OrganizationError("Invalid membership identifier", 400);
  const membership = await Membership.findOne({ _id: membershipId, organizationId });
  if (!membership) throw new OrganizationError("Organization member was not found", 404);
  if (membership.role === "owner") throw new OrganizationError("Owner membership is protected; use a dedicated ownership-transfer workflow", 409);
  if (membership.userId.toString() === actorUserId) throw new OrganizationError("You cannot remove your own membership", 409);

  await Membership.deleteOne({ _id: membership._id, organizationId });
  await RefreshSession.updateMany(
    { userId: membership.userId, organizationId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  await audit({
    organizationId, actorUserId, action: "member.removed", targetType: "membership",
    targetId: membership.id, metadata: { removedUserId: membership.userId.toString(), previousRole: membership.role }, ...metadata,
  });
}

export async function createInvitation(
  organizationId: string,
  actorUserId: string,
  input: CreateInvitationInput,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  const email = input.email.toLowerCase();
  const existingUser = await User.findOne({ email }).select("_id");
  if (existingUser && await Membership.exists({ userId: existingUser._id, organizationId })) {
    throw new OrganizationError("This user is already a member of the organization", 409);
  }
  await Invitation.updateMany({ organizationId, email, status: "pending", expiresAt: { $lte: new Date() } }, { $set: { status: "revoked", revokedAt: new Date() } });\n  const pending = await Invitation.findOne({ organizationId, email, status: "pending", expiresAt: { $gt: new Date() } });
  if (pending) throw new OrganizationError("A pending invitation already exists for this email", 409);

  const token = randomBytes(32).toString("base64url");
  const invitation = await Invitation.create({
    organizationId, email, role: input.role, tokenHash: tokenHash(token), invitedBy: actorUserId,
    expiresAt: new Date(Date.now() + INVITATION_LIFETIME_MS),
  });
  await audit({
    organizationId, actorUserId, action: "invitation.created", targetType: "invitation",
    targetId: invitation.id, metadata: { email, role: input.role, expiresAt: invitation.expiresAt }, ...metadata,
  });
  return {
    id: invitation.id, email: invitation.email, role: invitation.role,
    status: invitation.status, expiresAt: invitation.expiresAt, invitationToken: token,
  };
}

export async function listInvitations(organizationId: string) {
  const invitations = await Invitation.find({ organizationId, status: "pending", expiresAt: { $gt: new Date() } })
    .select("-tokenHash").sort({ createdAt: -1 }).lean();
  return invitations.map((invitation) => ({
    id: invitation._id.toString(), email: invitation.email, role: invitation.role,
    status: invitation.status, expiresAt: invitation.expiresAt, createdAt: invitation.createdAt,
  }));
}

export async function revokeInvitation(
  organizationId: string,
  actorUserId: string,
  invitationId: string,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  if (!Types.ObjectId.isValid(invitationId)) throw new OrganizationError("Invalid invitation identifier", 400);
  const invitation = await Invitation.findOneAndUpdate(
    { _id: invitationId, organizationId, status: "pending" },
    { $set: { status: "revoked", revokedAt: new Date() } },
    { new: true },
  );
  if (!invitation) throw new OrganizationError("Pending invitation was not found", 404);
  await audit({
    organizationId, actorUserId, action: "invitation.revoked", targetType: "invitation",
    targetId: invitation.id, metadata: { email: invitation.email }, ...metadata,
  });
}

export async function acceptInvitation(
  actorUserId: string,
  token: string,
  metadata: { ipAddress?: string; userAgent?: string },
) {
  const user = await User.findOne({ _id: actorUserId, status: "active" }).select("email");
  if (!user) throw new OrganizationError("Account is unavailable", 401);
  const invitation = await Invitation.findOne({
    tokenHash: tokenHash(token), status: "pending", expiresAt: { $gt: new Date() },
  }).select("+tokenHash");
  if (!invitation) throw new OrganizationError("Invitation is invalid, expired or already used", 410);
  if (invitation.email !== user.email) throw new OrganizationError("Sign in with the email address that received this invitation", 403);
  if (await Membership.exists({ userId: actorUserId, organizationId: invitation.organizationId })) {
    throw new OrganizationError("You are already a member of this organization", 409);
  }

  const claimed = await Invitation.updateOne(
    { _id: invitation._id, status: "pending", expiresAt: { $gt: new Date() } },
    { $set: { status: "accepted", acceptedAt: new Date() } },
  );
  if (claimed.modifiedCount !== 1) throw new OrganizationError("Invitation has already been used", 409);

  try {
    const membership = await Membership.create({
      userId: actorUserId, organizationId: invitation.organizationId, role: invitation.role,
    });
    await audit({
      organizationId: invitation.organizationId.toString(), actorUserId,
      action: "invitation.accepted", targetType: "membership", targetId: membership.id,
      metadata: { invitationId: invitation.id, role: membership.role }, ...metadata,
    });
    const organization = await Organization.findById(invitation.organizationId).select("name slug");
    return {
      membershipId: membership.id, role: membership.role,
      organization: organization ? { id: organization.id, name: organization.name, slug: organization.slug } : null,
    };
  } catch (error) {
    await Invitation.updateOne({ _id: invitation._id, status: "accepted" }, { $set: { status: "pending", acceptedAt: null } });
    throw error;
  }
}

export async function listAuditEvents(organizationId: string, limit: number) {
  const events = await AuditEvent.find({ organizationId }).sort({ createdAt: -1, _id: -1 }).limit(limit).lean();
  const actorIds = events.flatMap((event) => event.actorUserId ? [event.actorUserId] : []);
  const actors = await User.find({ _id: { $in: actorIds } }).select("name email").lean();
  const actorById = new Map(actors.map((actor) => [actor._id.toString(), actor]));
  return events.map((event) => {
    const actor = event.actorUserId ? actorById.get(event.actorUserId.toString()) : undefined;
    return {
      id: event._id.toString(), action: event.action, targetType: event.targetType,
      targetId: event.targetId, metadata: event.metadata,
      actor: actor ? { id: actor._id.toString(), name: actor.name, email: actor.email } : null,
      createdAt: event.createdAt,
    };
  });
}

export async function listSessions(userId: string, organizationId: string, currentFamilyId: string) {
  const sessions = await RefreshSession.find({ userId, organizationId, revokedAt: null, expiresAt: { $gt: new Date() } })
    .select("familyId userAgent ipAddress createdAt expiresAt").sort({ createdAt: -1 }).lean();
  const latestByFamily = new Map<string, typeof sessions[number]>();
  for (const session of sessions) if (!latestByFamily.has(session.familyId)) latestByFamily.set(session.familyId, session);
  return [...latestByFamily.values()].map((session) => ({
    id: session.familyId, current: session.familyId === currentFamilyId,
    userAgent: session.userAgent ?? "Unknown device", ipAddress: session.ipAddress ?? null,
    createdAt: session.createdAt, expiresAt: session.expiresAt,
  }));
}

export async function revokeSession(userId: string, organizationId: string, familyId: string) {
  const result = await RefreshSession.updateMany(
    { userId, organizationId, familyId, revokedAt: null },
    { $set: { revokedAt: new Date() } },
  );
  if (result.modifiedCount === 0) throw new OrganizationError("Active session was not found", 404);
}
