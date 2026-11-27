import type { Request, Response } from "express";
import { Membership } from "../../models/membership.model.js";
import { Organization } from "../../models/organization.model.js";
import { User } from "../../models/user.model.js";
import { listSessions, revokeSession } from "../organization/organization.service.js";
import { AuthError, createOrganizationForUser, listUserOrganizations, login, refreshCookieOptions, register, revokeAllUserSessions, revokeRefreshToken, rotateRefreshToken, switchUserOrganization, updateUserProfile, verifyEmail, requestPasswordReset, resetPassword, setupMfa, enableMfa, disableMfa, issueStepUpGrant } from "./auth.service.js";
import type { LoginInput, RegisterInput } from "./auth.schemas.js";

function metadata(req: Request) {
  return {
    ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}),
    ...(req.ip ? { ipAddress: req.ip } : {}),
  };
}
function setRefreshCookie(res: Response, token: string) { res.cookie("procuraos_refresh", token, refreshCookieOptions); }
function clearRefreshCookie(res: Response) { res.clearCookie("procuraos_refresh", { httpOnly: true, secure: refreshCookieOptions.secure, sameSite: "strict", path: refreshCookieOptions.path }); }

export async function registerController(req: Request, res: Response) {
  const result = await register(req.body as RegisterInput, metadata(req));
  res.status(201).json({ success: true, data: { user: result.user, organization: result.organization, role: result.role, verificationRequired: result.verificationRequired } });
}
export async function loginController(req: Request, res: Response) {
  const result = await login(req.body as LoginInput, metadata(req));
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ success: true, data: { user: result.user, organization: result.organization, role: result.role, accessToken: result.accessToken } });
}
export async function refreshController(req: Request, res: Response) {
  const token = req.cookies?.procuraos_refresh as string | undefined;
  if (!token) throw new AuthError("Refresh session is required", 401);
  const result = await rotateRefreshToken(token, metadata(req));
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ success: true, data: { accessToken: result.accessToken } });
}
export async function logoutController(req: Request, res: Response) {
  const token = req.cookies?.procuraos_refresh as string | undefined;
  if (token) await revokeRefreshToken(token, metadata(req));
  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: { message: "Signed out successfully" } });
}
export async function logoutAllController(req: Request, res: Response) {
  await revokeAllUserSessions(req.auth!.userId, metadata(req));
  clearRefreshCookie(res);
  res.status(200).json({ success: true, data: { message: "All sessions revoked" } });
}
export async function meController(req: Request, res: Response) {
  const [user, membership, organization] = await Promise.all([
    User.findById(req.auth!.userId).select("name email mfaEnabled"),
    Membership.findById(req.auth!.membershipId).select("role"),
    Organization.findById(req.auth!.organizationId).select("name slug"),
  ]);
  if (!user || !membership || !organization) throw new AuthError("Account context is unavailable", 401);
  res.status(200).json({ success: true, data: { user: { id: user.id, name: user.name, email: user.email, mfaEnabled: user.mfaEnabled }, organization: { id: organization.id, name: organization.name, slug: organization.slug }, role: membership.role } });
}
export async function createOrganizationController(req: Request, res: Response) {
  const organization = await createOrganizationForUser(req.auth!.userId, req.body.name as string);
  res.status(201).json({ success: true, data: { organization } });
}
export async function listOrganizationsController(req: Request, res: Response) {
  const organizations = await listUserOrganizations(req.auth!.userId);
  res.status(200).json({ success: true, data: { organizations } });
}
export async function switchOrganizationController(req: Request, res: Response) {
  const oldToken = req.cookies?.procuraos_refresh as string | undefined;
  const result = await switchUserOrganization(req.auth!.userId, req.body.organizationId as string, metadata(req), req.auth!.organizationId);
  if (oldToken) await revokeRefreshToken(oldToken, metadata(req));
  setRefreshCookie(res, result.refreshToken);
  res.status(200).json({ success: true, data: { organization: result.organization, role: result.role, accessToken: result.accessToken } });
}
export async function updateProfileController(req: Request, res: Response) {
  const user = await updateUserProfile(req.auth!.userId, req.body.name as string);
  res.status(200).json({ success: true, data: { user } });
}

export async function listSessionsController(req: Request, res: Response) {
  const sessions = await listSessions(req.auth!.userId, req.auth!.organizationId, req.auth!.sessionFamilyId);
  res.status(200).json({ success: true, data: { sessions } });
}
export async function revokeSessionController(req: Request, res: Response) {
  await revokeSession(req.auth!.userId, req.auth!.organizationId, String(req.params.sessionId ?? ""));
  res.status(200).json({ success: true, data: { message: "Session revoked" } });
}

export async function verifyEmailController(req: Request, res: Response) {
  const result = await verifyEmail(req.body.token as string);
  res.status(200).json({ success: true, data: result });
}
export async function forgotPasswordController(req: Request, res: Response) {
  await requestPasswordReset(req.body.email as string);
  res.status(202).json({ success: true, data: { message: "If the account exists, password reset instructions have been sent." } });
}
export async function resetPasswordController(req: Request, res: Response) {
  const result = await resetPassword(req.body.token as string, req.body.password as string);
  res.status(200).json({ success: true, data: result });
}

export async function setupMfaController(req: Request, res: Response) {
  const result = await setupMfa(req.auth!.userId, req.auth!.organizationId, metadata(req));
  res.status(200).json({ success: true, data: result });
}
export async function enableMfaController(req: Request, res: Response) {
  const result = await enableMfa(req.auth!.userId, req.auth!.organizationId, req.body.code as string, metadata(req));
  res.status(200).json({ success: true, data: result });
}
export async function disableMfaController(req: Request, res: Response) {
  await disableMfa(req.auth!.userId, req.auth!.organizationId, req.body.password as string, req.body.code as string, metadata(req));
  res.status(200).json({ success: true, data: { mfaEnabled: false } });
}

export async function stepUpController(req: Request, res: Response) {
  const result = await issueStepUpGrant(req.auth!.userId, req.auth!.organizationId, req.auth!.sessionFamilyId, req.body.password as string, req.body.otp as string | undefined, metadata(req));
  res.status(200).json({ success: true, data: result });
}
