import type { Request, Response } from "express";
import { Membership } from "../../models/membership.model.js";
import { User } from "../../models/user.model.js";
import { cancelRequisition, createRequisition, decideRequisition, getRequisition, listBudgets, listRequisitions, submitRequisition, updateRequisition, upsertBudget } from "./requisition.service.js";

function metadata(req: Request) {
  return { ...(req.ip ? { ipAddress: req.ip } : {}), ...(req.get("user-agent") ? { userAgent: req.get("user-agent")! } : {}) };
}
export async function listApproversController(req: Request, res: Response) {
  const memberships = await Membership.find({ organizationId: req.auth!.organizationId, status: "active", userId: { $ne: req.auth!.userId } }).select("userId role").lean();
  const users = await User.find({ _id: { $in: memberships.map((member) => member.userId) }, status: "active" }).select("name email").lean();
  const byId = new Map(users.map((user) => [user._id.toString(), user]));
  const approvers = memberships.flatMap((member) => { const user = byId.get(member.userId.toString()); return user ? [{ id: user._id.toString(), name: user.name, email: user.email, role: member.role }] : []; });
  res.status(200).json({ success: true, data: { approvers } });
}
export async function createRequisitionController(req: Request, res: Response) {
  const data = await createRequisition(req.auth!.organizationId, req.auth!.userId, req.body, metadata(req));
  res.status(201).json({ success: true, data });
}
export async function listRequisitionsController(req: Request, res: Response) {
  const status = typeof req.query.status === "string" ? req.query.status : undefined;
  const data = await listRequisitions(req.auth!.organizationId, req.auth!.userId, req.auth!.role, status);
  res.status(200).json({ success: true, data: { requisitions: data } });
}
export async function getRequisitionController(req: Request, res: Response) {
  const requisition = await getRequisition(req.auth!.organizationId, String(req.params.requisitionId ?? ""));
  const broadReadRoles = ["owner", "admin", "procurement_manager", "finance_manager", "auditor"];
  const requesterId = String(requisition.requesterId);
  const approverIds = Array.isArray(requisition.approverIds) ? requisition.approverIds.map(String) : [];
  if (!broadReadRoles.includes(req.auth!.role) && requesterId !== req.auth!.userId && !approverIds.includes(req.auth!.userId)) {
    res.status(404).json({ success: false, error: { message: "Requisition was not found" } }); return;
  }
  res.status(200).json({ success: true, data: { requisition } });
}
export async function updateRequisitionController(req: Request, res: Response) {
  const requisition = await updateRequisition(req.auth!.organizationId, req.auth!.userId, String(req.params.requisitionId ?? ""), req.body, metadata(req));
  res.status(200).json({ success: true, data: { requisition } });
}
export async function submitRequisitionController(req: Request, res: Response) {
  const requisition = await submitRequisition(req.auth!.organizationId, req.auth!.userId, String(req.params.requisitionId ?? ""), metadata(req));
  res.status(200).json({ success: true, data: { requisition } });
}
export async function approveRequisitionController(req: Request, res: Response) {
  const requisition = await decideRequisition(req.auth!.organizationId, req.auth!.userId, String(req.params.requisitionId ?? ""), "approve", req.body.comment ?? "", metadata(req));
  res.status(200).json({ success: true, data: { requisition } });
}
export async function rejectRequisitionController(req: Request, res: Response) {
  const requisition = await decideRequisition(req.auth!.organizationId, req.auth!.userId, String(req.params.requisitionId ?? ""), "reject", req.body.reason, metadata(req));
  res.status(200).json({ success: true, data: { requisition } });
}
export async function cancelRequisitionController(req: Request, res: Response) {
  const requisition = await cancelRequisition(req.auth!.organizationId, req.auth!.userId, String(req.params.requisitionId ?? ""), metadata(req));
  res.status(200).json({ success: true, data: { requisition } });
}
export async function listBudgetsController(req: Request, res: Response) {
  const budgets = await listBudgets(req.auth!.organizationId);
  res.status(200).json({ success: true, data: { budgets } });
}
export async function upsertBudgetController(req: Request, res: Response) {
  const budget = await upsertBudget(req.auth!.organizationId, req.auth!.userId, String(req.params.costCenter ?? ""), req.body, metadata(req));
  res.status(200).json({ success: true, data: { budget } });
}
