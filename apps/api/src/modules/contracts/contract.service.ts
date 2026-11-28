import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { Contract } from "../../models/contract.model.js";
import { Membership } from "../../models/membership.model.js";
import { PurchaseOrder } from "../../models/purchase-order.model.js";
import { Supplier } from "../../models/supplier.model.js";
import type { CreateContractInput, ListContractsInput } from "./contract.schemas.js";

type Meta = { ipAddress?: string; userAgent?: string };
export class ContractWorkflowError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); this.name = "ContractWorkflowError"; }
}
const validId = (id: string) => Types.ObjectId.isValid(id);
const contractNumber = () => "CTR-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(3).toString("hex").toUpperCase();

async function audit(org: string, actor: string, action: string, targetId: string, metadata: Record<string, unknown>, meta: Meta) {
  await AuditEvent.create({
    organizationId: org, actorUserId: actor, action, targetType: "contract", targetId, metadata,
    ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
    ...(meta.userAgent ? { userAgent: meta.userAgent } : {})
  });
}
function escapeRegex(value: string) { return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
function present<T extends { endDate: Date | string }>(contract: T) {
  const end = new Date(contract.endDate);
  const milliseconds = end.getTime() - Date.now();
  const isExpired = milliseconds < 0 && (contract as { status?: string }).status === "active";
  return { ...contract, ...(isExpired ? { status: "expired" } : {}), isExpired, daysToExpiry: Math.ceil(milliseconds / 86_400_000) };
}

export async function createContract(org: string, actor: string, input: CreateContractInput, meta: Meta) {
  const supplier = await Supplier.findOne({ _id: input.supplierId, organizationId: org, status: "approved" }).select("_id");
  if (!supplier) throw new ContractWorkflowError("The contract supplier must be approved in this organization", 409);
  if (input.purchaseOrderId) {
    const order = await PurchaseOrder.findOne({ _id: input.purchaseOrderId, organizationId: org }).select("supplierId status");
    if (!order || String(order.supplierId) !== input.supplierId) throw new ContractWorkflowError("The linked purchase order must belong to this supplier and organization", 409);
    if (order.status === "cancelled") throw new ContractWorkflowError("A cancelled purchase order cannot be linked to a new contract", 409);
  }
  const ownerIds = [...new Set([input.ownerUserId, ...input.obligations.flatMap(item => item.ownerUserId ? [item.ownerUserId] : [])])];
  const activeOwners = await Membership.countDocuments({ userId: { $in: ownerIds }, organizationId: org, status: "active" });
  if (activeOwners !== ownerIds.length) throw new ContractWorkflowError("The contract owner and every obligation owner must be active members of this organization", 400);
  const contract = await Contract.create({
    ...input, organizationId: org, contractNumber: contractNumber(),
    startDate: new Date(input.startDate), endDate: new Date(input.endDate),
    obligations: input.obligations.map(item => ({
      ...item, dueAt: new Date(item.dueAt), ...(item.ownerUserId ? { ownerUserId: item.ownerUserId } : {})
    })),
    createdBy: actor, updatedBy: actor
  });
  await audit(org, actor, "contract.created", contract.id, { contractNumber: contract.contractNumber, supplierId: input.supplierId, valueMinor: input.valueMinor, currency: input.currency }, meta);
  return getContract(org, contract.id);
}

export async function listContracts(org: string, input: ListContractsInput) {
  const filter: Record<string, unknown> = { organizationId: org };
  if (input.status === "expired") {
    filter.status = "active";
    filter.endDate = { $lt: new Date() };
  } else {
    if (input.status === "active") { filter.status = "active"; filter.endDate = { $gte: new Date() }; }
    else if (input.status) filter.status = input.status;
    if (input.expiresBefore) filter.endDate = { ...(filter.endDate as object || {}), $lte: new Date(input.expiresBefore) };
  }
  if (input.supplierId) filter.supplierId = input.supplierId;
  if (input.search) {
    const expression = new RegExp(escapeRegex(input.search), "i");
    filter.$or = [{ contractNumber: expression }, { title: expression }];
  }
  const [items, total] = await Promise.all([
    Contract.find(filter).sort({ [input.sortBy]: input.sortOrder === "asc" ? 1 : -1, _id: 1 })
      .skip((input.page - 1) * input.limit).limit(input.limit)
      .populate("supplierId", "displayName legalName email").populate("ownerUserId", "name email").lean(),
    Contract.countDocuments(filter)
  ]);
  return { contracts: items.map(item => present(item)), pagination: { page: input.page, limit: input.limit, total, pages: Math.ceil(total / input.limit) } };
}

export async function getContract(org: string, id: string) {
  if (!validId(id)) throw new ContractWorkflowError("Invalid contract identifier", 400);
  const contract = await Contract.findOne({ _id: id, organizationId: org })
    .populate("supplierId", "displayName legalName email country")
    .populate("purchaseOrderId", "poNumber status totalMinor currency")
    .populate("ownerUserId", "name email")
    .populate("approvedBy", "name email").lean();
  if (!contract) throw new ContractWorkflowError("Contract was not found", 404);
  return present(contract);
}

export async function submitContract(org: string, actor: string, id: string, meta: Meta) {
  if (!validId(id)) throw new ContractWorkflowError("Invalid contract identifier", 400);
  const contract = await Contract.findOne({ _id: id, organizationId: org, status: "draft" });
  if (!contract) throw new ContractWorkflowError("Only a draft contract can be submitted for approval", 409);
  contract.status = "pending_approval";
  contract.submittedAt = new Date();
  contract.updatedBy = new Types.ObjectId(actor);
  await contract.save();
  await audit(org, actor, "contract.submitted", contract.id, { contractNumber: contract.contractNumber }, meta);
  return getContract(org, contract.id);
}

export async function reviewContract(org: string, actor: string, id: string, decision: "approve" | "reject", reason: string, meta: Meta) {
  if (!validId(id)) throw new ContractWorkflowError("Invalid contract identifier", 400);
  const contract = await Contract.findOne({ _id: id, organizationId: org, status: "pending_approval" });
  if (!contract) throw new ContractWorkflowError("A contract pending approval was not found", 409);
  if (String(contract.createdBy) === actor) throw new ContractWorkflowError("The contract creator cannot approve or reject their own contract", 403);
  contract.status = decision === "approve" ? "approved" : "rejected";
  contract.approvedBy = decision === "approve" ? new Types.ObjectId(actor) : null;
  contract.approvedAt = decision === "approve" ? new Date() : null;
  contract.rejectionReason = decision === "reject" ? reason : "";
  contract.updatedBy = new Types.ObjectId(actor);
  await contract.save();
  await audit(org, actor, decision === "approve" ? "contract.approved" : "contract.rejected", contract.id, { reason }, meta);
  return getContract(org, contract.id);
}

export async function activateContract(org: string, actor: string, id: string, meta: Meta) {
  if (!validId(id)) throw new ContractWorkflowError("Invalid contract identifier", 400);
  const contract = await Contract.findOne({ _id: id, organizationId: org, status: "approved" });
  if (!contract) throw new ContractWorkflowError("Only an approved contract can be activated", 409);
  const now = new Date();
  if (contract.startDate > now || contract.endDate <= now) throw new ContractWorkflowError("A contract can only be activated within its effective date range", 409);
  const supplier = await Supplier.findOne({ _id: contract.supplierId, organizationId: org, status: "approved" }).select("_id");
  if (!supplier) throw new ContractWorkflowError("The supplier is no longer approved", 409);
  contract.status = "active";
  contract.activatedAt = now;
  contract.updatedBy = new Types.ObjectId(actor);
  await contract.save();
  await audit(org, actor, "contract.activated", contract.id, { contractNumber: contract.contractNumber }, meta);
  return getContract(org, contract.id);
}

export async function terminateContract(org: string, actor: string, id: string, reason: string, meta: Meta) {
  if (!validId(id)) throw new ContractWorkflowError("Invalid contract identifier", 400);
  const contract = await Contract.findOne({ _id: id, organizationId: org, status: "active" });
  if (!contract) throw new ContractWorkflowError("Only an active contract can be terminated", 409);
  contract.status = "terminated";
  contract.terminatedAt = new Date();
  contract.terminationReason = reason;
  contract.updatedBy = new Types.ObjectId(actor);
  await contract.save();
  await audit(org, actor, "contract.terminated", contract.id, { reason }, meta);
  return getContract(org, contract.id);
}

export async function updateObligation(org: string, actor: string, id: string, obligationId: string, status: "completed" | "waived", note: string, meta: Meta) {
  if (!validId(id) || !validId(obligationId)) throw new ContractWorkflowError("Invalid contract or obligation identifier", 400);
  const contract = await Contract.findOne({ _id: id, organizationId: org, status: "active", endDate: { $gte: new Date() } });
  if (!contract) throw new ContractWorkflowError("Obligations can only be updated on a non-expired active contract", 409);
  const obligation = contract.obligations.id(obligationId);
  if (!obligation) throw new ContractWorkflowError("Contract obligation was not found", 404);
  if (obligation.status !== "open") throw new ContractWorkflowError("Only open obligations can be completed or waived", 409);
  obligation.status = status;
  obligation.completedAt = new Date();
  obligation.completedBy = new Types.ObjectId(actor);
  obligation.resolutionNote = note;
  contract.updatedBy = new Types.ObjectId(actor);
  await contract.save();
  await audit(org, actor, status === "completed" ? "contract.obligation_completed" : "contract.obligation_waived", contract.id, { obligationId, title: obligation.title, note }, meta);
  return getContract(org, contract.id);
}

export async function getContractSummary(org: string) {
  const now = new Date();
  const in30 = new Date(now.getTime() + 30 * 86_400_000);
  const in90 = new Date(now.getTime() + 90 * 86_400_000);
  const [active, pendingApproval, expiring30Days, expiring90Days, overdueObligations] = await Promise.all([
    Contract.countDocuments({ organizationId: org, status: "active", endDate: { $gte: now } }),
    Contract.countDocuments({ organizationId: org, status: "pending_approval" }),
    Contract.countDocuments({ organizationId: org, status: "active", endDate: { $gte: now, $lte: in30 } }),
    Contract.countDocuments({ organizationId: org, status: "active", endDate: { $gt: in30, $lte: in90 } }),
    Contract.countDocuments({ organizationId: org, status: "active", obligations: { $elemMatch: { status: "open", dueAt: { $lt: now } } } })
  ]);
  return { active, pendingApproval, expiring30Days, expiring90Days, contractsWithOverdueObligations: overdueObligations, generatedAt: now.toISOString() };
}
