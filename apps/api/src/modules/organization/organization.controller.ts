import type { Request, Response } from "express";
import { OrganizationError, acceptInvitation, createInvitation, getOrganization, listAuditEvents, listInvitations, listMembers, removeMember, revokeInvitation, updateMember, updateOrganization } from "./organization.service.js";

function metadata(req: Request) {
  return {
    ...(req.ip ? { ipAddress: req.ip } : {}),
    ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}),
  };
}

export async function getOrganizationController(req: Request, res: Response) {
  const organization = await getOrganization(req.auth!.organizationId);
  res.status(200).json({ success: true, data: { organization } });
}
export async function updateOrganizationController(req: Request, res: Response) {
  const organization = await updateOrganization(req.auth!.organizationId, req.auth!.userId, req.body.name as string, metadata(req));
  res.status(200).json({ success: true, data: { organization } });
}
export async function listMembersController(req: Request, res: Response) {
  const members = await listMembers(req.auth!.organizationId);
  res.status(200).json({ success: true, data: { members } });
}
export async function updateMemberController(req: Request, res: Response) {
  const member = await updateMember(req.auth!.organizationId, req.auth!.userId, String(req.params.membershipId ?? ""), req.body, metadata(req));
  res.status(200).json({ success: true, data: { member } });
}
export async function removeMemberController(req: Request, res: Response) {
  await removeMember(req.auth!.organizationId, req.auth!.userId, String(req.params.membershipId ?? ""), metadata(req));
  res.status(200).json({ success: true, data: { message: "Organization member removed" } });
}
export async function createInvitationController(req: Request, res: Response) {
  const invitation = await createInvitation(req.auth!.organizationId, req.auth!.userId, req.body, metadata(req));
  res.status(201).json({ success: true, data: { invitation } });
}
export async function listInvitationsController(req: Request, res: Response) {
  const invitations = await listInvitations(req.auth!.organizationId);
  res.status(200).json({ success: true, data: { invitations } });
}
export async function revokeInvitationController(req: Request, res: Response) {
  await revokeInvitation(req.auth!.organizationId, req.auth!.userId, String(req.params.invitationId ?? ""), metadata(req));
  res.status(200).json({ success: true, data: { message: "Invitation revoked" } });
}
export async function acceptInvitationController(req: Request, res: Response) {
  const membership = await acceptInvitation(req.auth!.userId, req.body.token as string, metadata(req));
  if (!membership.organization) throw new OrganizationError("Organization is unavailable", 404);
  res.status(200).json({ success: true, data: { membership } });
}
export async function listAuditEventsController(req: Request, res: Response) {
  const parsed = Number.parseInt(String(req.query.limit ?? "50"), 10);
  const limit = Number.isFinite(parsed) ? Math.min(100, Math.max(1, parsed)) : 50;
  const events = await listAuditEvents(req.auth!.organizationId, limit);
  res.status(200).json({ success: true, data: { events } });
}
