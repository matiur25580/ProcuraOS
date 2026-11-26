import { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { Budget } from "../../models/budget.model.js";
import { Membership } from "../../models/membership.model.js";
import { Requisition } from "../../models/requisition.model.js";
import { User } from "../../models/user.model.js";
import type { CreateRequisitionInput, UpdateRequisitionInput } from "./requisition.schemas.js";

export class RequisitionError extends Error {
  constructor(message: string, readonly statusCode = 400) {
    super(message);
    this.name = "RequisitionError";
  }
}

type AuditMeta = { ipAddress?: string; userAgent?: string };
const validId = (id: string) => Types.ObjectId.isValid(id);

async function audit(organizationId: string, actorUserId: string, action: string, targetId: string, metadata: Record<string, unknown> = {}, meta: AuditMeta = {}) {
  await AuditEvent.create({
    organizationId, actorUserId, action, targetType: "requisition", targetId, metadata,
    ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
    ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
  });
}

function calculateTotal(items: CreateRequisitionInput["items"]) {
  const total = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
  if (!Number.isSafeInteger(total) || total > 1000000000000) throw new RequisitionError("Requisition total exceeds the supported limit", 400);
  return total;
}

async function validateApprovers(organizationId: string, requesterId: string, approverIds: string[]) {
  const unique = [...new Set(approverIds)];
  if (unique.length !== approverIds.length) throw new RequisitionError("Approval chain cannot contain duplicate approvers", 400);
  if (unique.includes(requesterId)) throw new RequisitionError("Requester cannot approve their own requisition", 400);
  const memberships = await Membership.find({
    organizationId, userId: { $in: unique }, status: "active",
  }).select("userId role").lean();
  if (memberships.length !== unique.length) throw new RequisitionError("Every approver must be an active member of this organization", 400);
  const users = await User.find({ _id: { $in: unique }, status: "active" }).select("_id").lean();
  if (users.length !== unique.length) throw new RequisitionError("An approver account is unavailable", 400);
}

function normalizeInput(input: CreateRequisitionInput) {
  return {
    title: input.title,
    department: input.department,
    costCenter: input.costCenter,
    justification: input.justification,
    neededBy: new Date(input.neededBy),
    currency: input.currency.toUpperCase(),
    items: input.items,
    approverIds: input.approverIds,
  };
}

export async function createRequisition(organizationId: string, requesterId: string, input: CreateRequisitionInput, meta: AuditMeta) {
  await validateApprovers(organizationId, requesterId, input.approverIds);
  const normalized = normalizeInput(input);
  const requisition = await Requisition.create({
    organizationId, requesterId, ...normalized, totalMinor: calculateTotal(input.items), status: "draft",
  });
  await audit(organizationId, requesterId, "requisition.created", requisition.id, { totalMinor: requisition.totalMinor, currency: requisition.currency }, meta);
  return getRequisition(organizationId, requisition.id);
}

export async function listRequisitions(organizationId: string, userId: string, role: string, status?: string) {
  const filter: Record<string, unknown> = { organizationId };
  if (status) filter.status = status;
  if (!["owner", "admin", "procurement_manager", "finance_manager", "auditor"].includes(role)) {
    filter.$or = [{ requesterId: userId }, { currentApproverId: userId }, { approverIds: userId }];
  }
  const records = await Requisition.find(filter).sort({ createdAt: -1 }).limit(100)
    .populate("requesterId", "name email").populate("approvals.approverId", "name email").lean();
  return records.map((record) => ({
    ...record,
    id: record._id.toString(),
    requester: record.requesterId && typeof record.requesterId === "object" && "name" in record.requesterId
      ? { id: (record.requesterId as { _id: Types.ObjectId })._id.toString(), name: (record.requesterId as { name: string }).name, email: (record.requesterId as unknown as { email: string }).email }
      : null,
    requesterId: typeof record.requesterId === "object" ? (record.requesterId as { _id: Types.ObjectId })._id.toString() : String(record.requesterId),
    approvals: record.approvals.map((step) => ({
      ...step,
      approver: step.approverId && typeof step.approverId === "object" && "name" in step.approverId
        ? { id: (step.approverId as { _id: Types.ObjectId })._id.toString(), name: (step.approverId as { name: string }).name, email: (step.approverId as unknown as { email: string }).email }
        : null,
      approverId: typeof step.approverId === "object" ? (step.approverId as { _id: Types.ObjectId })._id.toString() : String(step.approverId),
    })),
  }));
}

export async function getRequisition(organizationId: string, requisitionId: string) {
  if (!validId(requisitionId)) throw new RequisitionError("Invalid requisition identifier", 400);
  const record = await Requisition.findOne({ _id: requisitionId, organizationId })
    .populate("requesterId", "name email").populate("approvals.approverId", "name email").lean();
  if (!record) throw new RequisitionError("Requisition was not found", 404);
  return {
    ...record,
    id: record._id.toString(),
    requester: record.requesterId && typeof record.requesterId === "object" && "name" in record.requesterId
      ? { id: (record.requesterId as { _id: Types.ObjectId })._id.toString(), name: (record.requesterId as { name: string }).name, email: (record.requesterId as unknown as { email: string }).email }
      : null,
    requesterId: typeof record.requesterId === "object" ? (record.requesterId as { _id: Types.ObjectId })._id.toString() : String(record.requesterId),
    approvals: record.approvals.map((step) => ({
      ...step,
      approver: step.approverId && typeof step.approverId === "object" && "name" in step.approverId
        ? { id: (step.approverId as { _id: Types.ObjectId })._id.toString(), name: (step.approverId as { name: string }).name, email: (step.approverId as unknown as { email: string }).email }
        : null,
      approverId: typeof step.approverId === "object" ? (step.approverId as { _id: Types.ObjectId })._id.toString() : String(step.approverId),
    })),
  };
}

export async function updateRequisition(organizationId: string, requesterId: string, requisitionId: string, changes: UpdateRequisitionInput, meta: AuditMeta) {
  if (!validId(requisitionId)) throw new RequisitionError("Invalid requisition identifier", 400);
  const requisition = await Requisition.findOne({ _id: requisitionId, organizationId, requesterId });
  if (!requisition) throw new RequisitionError("Draft requisition was not found", 404);
  if (requisition.status !== "draft") throw new RequisitionError("Only draft requisitions can be edited", 409);
  const merged = {
    title: changes.title ?? requisition.title,
    department: changes.department ?? requisition.department,
    costCenter: changes.costCenter ?? requisition.costCenter,
    justification: changes.justification ?? requisition.justification,
    neededBy: changes.neededBy ? new Date(changes.neededBy) : requisition.neededBy,
    currency: changes.currency?.toUpperCase() ?? requisition.currency,
    items: changes.items ?? requisition.items.map((item) => ({ description: item.description, quantity: item.quantity, unit: item.unit, unitPriceMinor: item.unitPriceMinor })),
    approverIds: changes.approverIds ?? requisition.approverIds.map((id) => id.toString()),
  };
  await validateApprovers(organizationId, requesterId, merged.approverIds);
  requisition.set({ ...merged, totalMinor: calculateTotal(merged.items) });
  await requisition.save();
  await audit(organizationId, requesterId, "requisition.updated", requisition.id, { totalMinor: requisition.totalMinor }, meta);
  return getRequisition(organizationId, requisition.id);
}

export async function submitRequisition(organizationId: string, requesterId: string, requisitionId: string, meta: AuditMeta) {
  if (!validId(requisitionId)) throw new RequisitionError("Invalid requisition identifier", 400);
  const requisition = await Requisition.findOne({ _id: requisitionId, organizationId, requesterId });
  if (!requisition) throw new RequisitionError("Requisition was not found", 404);
  if (requisition.status !== "draft") throw new RequisitionError("Only draft requisitions can be submitted", 409);
  const approverIds = requisition.approverIds.map((id) => id.toString());
  await validateApprovers(organizationId, requesterId, approverIds);

  const fiscalYear = requisition.neededBy.getUTCFullYear();
  const budget = await Budget.findOne({
    organizationId, costCenter: requisition.costCenter, fiscalYear, active: true,
  }).lean();
  let budgetStatus: "within_budget" | "over_budget" | "unconfigured" = "unconfigured";
  if (budget) {
    if (budget.currency !== requisition.currency) throw new RequisitionError("Requisition currency does not match the configured cost-centre budget", 409);
    const committed = await Requisition.aggregate<{ total: number }>([
      { $match: { organizationId: new Types.ObjectId(organizationId), costCenter: requisition.costCenter, currency: requisition.currency, status: { $in: ["pending_approval", "approved"] }, _id: { $ne: requisition._id }, neededBy: { $gte: new Date(Date.UTC(fiscalYear, 0, 1)), $lt: new Date(Date.UTC(fiscalYear + 1, 0, 1)) } } },
      { $group: { _id: null, total: { $sum: "$totalMinor" } } },
    ]);
    budgetStatus = (Number(committed[0]?.total ?? 0) + requisition.totalMinor) <= budget.limitMinor ? "within_budget" : "over_budget";
    if (budgetStatus === "over_budget") throw new RequisitionError("This requisition would exceed the configured cost-centre budget", 409);
  }

  requisition.approvals = approverIds.map((approverId, index) => ({
    approverId: new Types.ObjectId(approverId), level: index + 1, status: "pending",
  })) as typeof requisition.approvals;
  requisition.currentApproverId = new Types.ObjectId(approverIds[0]);
  requisition.status = "pending_approval";
  requisition.submittedAt = new Date();
  requisition.budgetStatus = budgetStatus;
  await requisition.save();
  await audit(organizationId, requesterId, "requisition.submitted", requisition.id, { totalMinor: requisition.totalMinor, currency: requisition.currency, budgetStatus, approvalLevels: approverIds.length }, meta);
  return getRequisition(organizationId, requisition.id);
}

export async function decideRequisition(organizationId: string, approverId: string, requisitionId: string, decision: "approve" | "reject", comment: string, meta: AuditMeta) {
  if (!validId(requisitionId)) throw new RequisitionError("Invalid requisition identifier", 400);
  const requisition = await Requisition.findOne({ _id: requisitionId, organizationId, status: "pending_approval", currentApproverId: approverId });
  if (!requisition) throw new RequisitionError("No pending approval assigned to this user was found", 404);
  const currentIndex = requisition.approvals.findIndex((step) => step.approverId.toString() === approverId && step.status === "pending");
  if (currentIndex < 0) throw new RequisitionError("Approval step is no longer pending", 409);
  const now = new Date();
  const nextApproverId = decision === "approve" ? requisition.approvals[currentIndex + 1]?.approverId : null;
  const update: Record<string, unknown> = {
    "approvals.$.status": decision === "approve" ? "approved" : "rejected",
    "approvals.$.comment": comment,
    "approvals.$.actedAt": now,
    ...(decision === "reject" ? { status: "rejected", decidedAt: now, currentApproverId: null, rejectionReason: comment } :
      nextApproverId ? { currentApproverId: nextApproverId } : { status: "approved", decidedAt: now, currentApproverId: null }),
  };
  const result = await Requisition.updateOne({
    _id: requisition._id, organizationId, status: "pending_approval", currentApproverId: approverId,
    approvals: { $elemMatch: { approverId: new Types.ObjectId(approverId), status: "pending" } },
  }, { $set: update });
  if (result.modifiedCount !== 1) throw new RequisitionError("This approval was already processed; refresh and try again", 409);
  const action = decision === "approve" ? "requisition.approved_step" : "requisition.rejected";
  await audit(organizationId, approverId, action, requisition.id, { comment, level: currentIndex + 1, final: decision === "reject" || !nextApproverId }, meta);
  return getRequisition(organizationId, requisition.id);
}

export async function cancelRequisition(organizationId: string, requesterId: string, requisitionId: string, meta: AuditMeta) {
  if (!validId(requisitionId)) throw new RequisitionError("Invalid requisition identifier", 400);
  const result = await Requisition.findOneAndUpdate(
    { _id: requisitionId, organizationId, requesterId, status: "draft" },
    { $set: { status: "cancelled", decidedAt: new Date() } },
    { new: true },
  );
  if (!result) throw new RequisitionError("Only your own draft requisitions can be cancelled", 409);
  await audit(organizationId, requesterId, "requisition.cancelled", result.id, {}, meta);
  return getRequisition(organizationId, result.id);
}

export async function listBudgets(organizationId: string) {
  return Budget.find({ organizationId, active: true }).sort({ fiscalYear: -1, costCenter: 1 }).lean();
}

export async function upsertBudget(organizationId: string, actorUserId: string, costCenter: string, input: { fiscalYear: number; currency: string; limitMinor: number }, meta: AuditMeta) {
  const budget = await Budget.findOneAndUpdate(
    { organizationId, costCenter, fiscalYear: input.fiscalYear },
    { $set: { currency: input.currency.toUpperCase(), limitMinor: input.limitMinor, active: true } },
    { new: true, upsert: true, runValidators: true, setDefaultsOnInsert: true },
  );
  await AuditEvent.create({
    organizationId, actorUserId, action: "budget.updated", targetType: "budget", targetId: budget.id,
    metadata: { costCenter, fiscalYear: input.fiscalYear, currency: input.currency.toUpperCase(), limitMinor: input.limitMinor },
    ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
    ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
  });
  return budget;
}
