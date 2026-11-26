import { createHash, randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { Quotation } from "../../models/quotation.model.js";
import { Requisition } from "../../models/requisition.model.js";
import { Rfq } from "../../models/rfq.model.js";
import { Supplier } from "../../models/supplier.model.js";
import type { CreateRfqInput, CreateSupplierInput, ReviewSupplierInput, SubmitQuotationInput } from "./supplier.schemas.js";
type Meta = { ipAddress?: string; userAgent?: string };
const validId = (id: string) => Types.ObjectId.isValid(id);
const hash = (value: string) => createHash("sha256").update(value).digest("hex");
export class SupplierWorkflowError extends Error {
  constructor(message: string, readonly statusCode = 400) { super(message); this.name = "SupplierWorkflowError"; }
}
async function audit(org: string, actor: string | null, action: string, type: string, id: string, metadata: Record<string, unknown>, meta: Meta = {}) {
  await AuditEvent.create({ organizationId: org, actorUserId: actor, action, targetType: type, targetId: id, metadata,
    ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}), ...(meta.userAgent ? { userAgent: meta.userAgent } : {}) });
}
export async function createSupplier(org: string, actor: string, input: CreateSupplierInput, meta: Meta) {
  if (await Supplier.exists({ organizationId: org, taxId: input.taxId.toUpperCase() })) throw new SupplierWorkflowError("A supplier with this tax identifier already exists", 409);
  const supplier = await Supplier.create({ organizationId: org, ...input, email: input.email.toLowerCase(), taxId: input.taxId.toUpperCase(),
    documents: input.documents.map((d) => ({ ...d, ...(d.expiresAt ? { expiresAt: new Date(d.expiresAt) } : {}) })) });
  await audit(org, actor, "supplier.created", "supplier", supplier.id, { legalName: supplier.legalName, email: supplier.email }, meta);
  return supplier;
}
export async function listSuppliers(org: string, status?: string) {
  return Supplier.find({ organizationId: org, ...(status ? { status } : {}) }).sort({ createdAt: -1 }).limit(200).lean();
}
export async function reviewSupplier(org: string, actor: string, id: string, input: ReviewSupplierInput, meta: Meta) {
  if (!validId(id)) throw new SupplierWorkflowError("Invalid supplier identifier", 400);
  const supplier = await Supplier.findOneAndUpdate({ _id: id, organizationId: org, status: { $ne: "suspended" } },
    { $set: { status: input.status, ...(input.riskLevel ? { riskLevel: input.riskLevel } : {}),
      rejectionReason: input.status === "rejected" ? input.rejectionReason : "", reviewedBy: actor, reviewedAt: new Date() } },
    { new: true, runValidators: true });
  if (!supplier) throw new SupplierWorkflowError("Supplier was not found or is suspended", 404);
  await audit(org, actor, "supplier.reviewed", "supplier", supplier.id, { status: supplier.status, riskLevel: supplier.riskLevel, rejectionReason: supplier.rejectionReason }, meta);
  return supplier;
}
export async function addSupplierDocument(org: string, actor: string, id: string, input: { name: string; type: string; referenceUrl: string; expiresAt?: string }, meta: Meta) {
  if (!validId(id)) throw new SupplierWorkflowError("Invalid supplier identifier", 400);
  const supplier = await Supplier.findOne({ _id: id, organizationId: org });
  if (!supplier) throw new SupplierWorkflowError("Supplier was not found", 404);
  supplier.documents.push({ ...input, ...(input.expiresAt ? { expiresAt: new Date(input.expiresAt) } : {}), status: "pending" } as never);
  await supplier.save();
  await audit(org, actor, "supplier.document_added", "supplier", supplier.id, { documentName: input.name, documentType: input.type }, meta);
  return supplier;
}
const makeRfqNumber = () => "RFQ-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(3).toString("hex").toUpperCase();
export async function createRfq(org: string, actor: string, input: CreateRfqInput, meta: Meta) {
  if (new Date(input.submissionDeadline).getTime() <= Date.now()) throw new SupplierWorkflowError("Submission deadline must be in the future", 400);
  const ids = [...new Set(input.supplierIds)];
  if (ids.length !== input.supplierIds.length) throw new SupplierWorkflowError("Supplier list contains duplicates", 400);
  const suppliers = await Supplier.find({ _id: { $in: ids }, organizationId: org, status: "approved" }).select("_id").lean();
  if (suppliers.length !== ids.length) throw new SupplierWorkflowError("Every RFQ supplier must be approved in this organization", 400);
  if (input.requisitionId && (!validId(input.requisitionId) || !await Requisition.exists({ _id: input.requisitionId, organizationId: org, status: "approved" }))) {
    throw new SupplierWorkflowError("Linked requisition must exist and be approved in this organization", 400);
  }
  const rfq = await Rfq.create({ organizationId: org, createdBy: actor, rfqNumber: makeRfqNumber(), title: input.title, description: input.description,
    ...(input.requisitionId ? { requisitionId: input.requisitionId } : {}), currency: input.currency.toUpperCase(),
    submissionDeadline: new Date(input.submissionDeadline), supplierIds: ids, items: input.items, status: "draft" });
  await audit(org, actor, "rfq.created", "rfq", rfq.id, { rfqNumber: rfq.rfqNumber, supplierCount: ids.length }, meta);
  return rfq;
}
export async function listRfqs(org: string) {
  const rfqs = await Rfq.find({ organizationId: org }).sort({ createdAt: -1 }).limit(100).populate("invitations.supplierId", "displayName email").lean();
  const quotes = await Quotation.aggregate([{ $match: { organizationId: new Types.ObjectId(org), rfqId: { $in: rfqs.map((r) => r._id) } } },
    { $group: { _id: "$rfqId", count: { $sum: 1 }, lowestQuoteMinor: { $min: "$totalMinor" } } }]);
  const map = new Map(quotes.map((q) => [q._id.toString(), q]));
  return rfqs.map((r) => ({ ...r, quoteSummary: map.get(r._id.toString()) ?? { count: 0, lowestQuoteMinor: null } }));
}
export async function issueRfq(org: string, actor: string, id: string, meta: Meta) {
  if (!validId(id)) throw new SupplierWorkflowError("Invalid RFQ identifier", 400);
  const rfq = await Rfq.findOne({ _id: id, organizationId: org, status: "draft" });
  if (!rfq) throw new SupplierWorkflowError("Draft RFQ was not found", 404);
  if (rfq.submissionDeadline.getTime() <= Date.now()) throw new SupplierWorkflowError("RFQ deadline has passed", 409);
  const suppliers = await Supplier.find({ _id: { $in: rfq.supplierIds }, organizationId: org, status: "approved" }).select("_id displayName email").lean();
  if (!suppliers.length || suppliers.length !== rfq.supplierIds.length) throw new SupplierWorkflowError("One or more selected suppliers are no longer approved", 409);
  const issued = suppliers.map((supplier) => ({ supplier, token: randomBytes(32).toString("base64url") }));
  rfq.set("invitations", issued.map(({ supplier, token }) => ({ supplierId: supplier._id, tokenHash: hash(token), invitedAt: new Date(), expiresAt: rfq.submissionDeadline, status: "invited" })));
  rfq.status = "open"; rfq.issuedAt = new Date(); await rfq.save();
  await audit(org, actor, "rfq.issued", "rfq", rfq.id, { supplierCount: issued.length, submissionDeadline: rfq.submissionDeadline }, meta);
  return { rfq, invitations: issued.map(({ supplier, token }) => ({ supplierName: supplier.displayName, email: supplier.email, token })) };
}
export async function closeRfq(org: string, actor: string, id: string, meta: Meta) {
  if (!validId(id)) throw new SupplierWorkflowError("Invalid RFQ identifier", 400);
  const rfq = await Rfq.findOneAndUpdate({ _id: id, organizationId: org, status: "open" }, { $set: { status: "closed", closedAt: new Date() } }, { new: true });
  if (!rfq) throw new SupplierWorkflowError("Open RFQ was not found", 404);
  await audit(org, actor, "rfq.closed", "rfq", rfq.id, {}, meta); return rfq;
}
export async function listQuotations(org: string, rfqId: string) {
  if (!validId(rfqId)) throw new SupplierWorkflowError("Invalid RFQ identifier", 400);
  if (!await Rfq.exists({ _id: rfqId, organizationId: org })) throw new SupplierWorkflowError("RFQ was not found", 404);
  return Quotation.find({ organizationId: org, rfqId }).populate("supplierId", "displayName email riskLevel").sort({ totalMinor: 1 }).lean();
}
export async function getSupplierQuote(token: string) {
  const tokenHash = hash(token);
  const rfq = await Rfq.findOne({ status: "open", submissionDeadline: { $gt: new Date() }, "invitations.tokenHash": tokenHash }).select("+invitations.tokenHash");
  if (!rfq) throw new SupplierWorkflowError("Supplier invitation is invalid, expired or closed", 410);
  const invitation = (rfq.invitations as unknown as { supplierId: Types.ObjectId; tokenHash: string; status: string }[]).find((entry) => entry.tokenHash === tokenHash);
  if (!invitation || invitation.status !== "invited") throw new SupplierWorkflowError("This supplier invitation has already been used", 409);
  const supplier = await Supplier.findOne({ _id: invitation.supplierId, organizationId: rfq.organizationId, status: "approved" }).select("displayName");
  if (!supplier) throw new SupplierWorkflowError("Supplier is not eligible to submit a quotation", 403);
  return { rfq: { id: rfq.id, rfqNumber: rfq.rfqNumber, title: rfq.title, description: rfq.description, currency: rfq.currency,
    submissionDeadline: rfq.submissionDeadline, items: rfq.items.map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unit: item.unit, specification: item.specification })) },
    supplierName: supplier.displayName };
}
export async function submitQuotation(input: SubmitQuotationInput, meta: Meta) {
  const tokenHash = hash(input.token);
  const rfq = await Rfq.findOne({ status: "open", submissionDeadline: { $gt: new Date() }, "invitations.tokenHash": tokenHash }).select("+invitations.tokenHash");
  if (!rfq) throw new SupplierWorkflowError("Supplier invitation is invalid, expired or closed", 410);
  const invitation = (rfq.invitations as unknown as { supplierId: Types.ObjectId; tokenHash: string; status: string }[]).find((entry) => entry.tokenHash === tokenHash);
  if (!invitation || invitation.status !== "invited") throw new SupplierWorkflowError("This supplier invitation has already been used", 409);
  const supplier = await Supplier.findOne({ _id: invitation.supplierId, organizationId: rfq.organizationId, status: "approved" });
  if (!supplier) throw new SupplierWorkflowError("Supplier is not eligible to submit a quotation", 403);
  if (new Date(input.validUntil).getTime() <= Date.now()) throw new SupplierWorkflowError("Quotation validity must be in the future", 400);
  const expected = new Map(rfq.items.map((item) => [item._id.toString(), item]));
  const provided = new Set(input.items.map((item) => item.rfqItemId));
  if (provided.size !== rfq.items.length || provided.size !== input.items.length || [...provided].some((id) => !expected.has(id))) throw new SupplierWorkflowError("Provide exactly one price for every RFQ line item", 400);
  const totalMinor = input.items.reduce((sum, item) => sum + expected.get(item.rfqItemId)!.quantity * item.unitPriceMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor > 1000000000000) throw new SupplierWorkflowError("Quotation total exceeds the supported limit", 400);
  const claim = await Rfq.updateOne({ _id: rfq._id, status: "open", invitations: { $elemMatch: { tokenHash, status: "invited" } } }, { $set: { "invitations.$.status": "quoted" } });
  if (claim.modifiedCount !== 1) throw new SupplierWorkflowError("This invitation has already been used", 409);
  try {
    const quote = await Quotation.create({ organizationId: rfq.organizationId, rfqId: rfq._id, supplierId: supplier._id, currency: rfq.currency,
      items: input.items, totalMinor, validUntil: new Date(input.validUntil), deliveryDays: input.deliveryDays, notes: input.notes });
    await audit(rfq.organizationId.toString(), null, "quotation.submitted", "quotation", quote.id, { rfqId: rfq.id, supplierId: supplier.id, totalMinor }, meta);
    return { rfqNumber: rfq.rfqNumber, quotationId: quote.id, status: quote.status };
  } catch (error) {
    await Rfq.updateOne({ _id: rfq._id, "invitations.tokenHash": tokenHash }, { $set: { "invitations.$.status": "invited" } }); throw error;
  }
}
export async function updateQuotationStatus(org: string, actor: string, rfqId: string, quoteId: string, status: "shortlisted" | "awarded" | "rejected", meta: Meta) {
  if (!validId(rfqId) || !validId(quoteId)) throw new SupplierWorkflowError("Invalid RFQ or quotation identifier", 400);
  const rfq = await Rfq.findOne({ _id: rfqId, organizationId: org, status: "closed" });
  if (!rfq) throw new SupplierWorkflowError("Close the RFQ before evaluating or awarding quotations", 409);
  const quote = await Quotation.findOne({ _id: quoteId, rfqId, organizationId: org });
  if (!quote) throw new SupplierWorkflowError("Quotation was not found", 404);
  if (status === "awarded") {
    const claimed = await Rfq.updateOne({ _id: rfqId, organizationId: org, status: "closed" }, { $set: { status: "awarded" } });
    if (claimed.modifiedCount !== 1) throw new SupplierWorkflowError("RFQ has already been awarded", 409);
    await Quotation.updateMany({ organizationId: org, rfqId }, { $set: { status: "rejected" } });
  }
  const updated = await Quotation.findOneAndUpdate({ _id: quoteId, rfqId, organizationId: org }, { $set: { status } }, { new: true });
  await audit(org, actor, status === "awarded" ? "quotation.awarded" : "quotation." + status, "quotation", quote.id, { rfqId, supplierId: quote.supplierId.toString(), totalMinor: quote.totalMinor }, meta);
  return updated;
}
