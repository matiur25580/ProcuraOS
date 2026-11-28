import { randomBytes } from "node:crypto";
import { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { PurchaseOrder } from "../../models/purchase-order.model.js";
import { Quotation } from "../../models/quotation.model.js";
import { Requisition } from "../../models/requisition.model.js";
import { Rfq } from "../../models/rfq.model.js";
import { Supplier } from "../../models/supplier.model.js";
import type { CreatePurchaseOrderInput, ReceiveGoodsInput } from "./purchase-order.schemas.js";
type Meta = { ipAddress?: string; userAgent?: string };
export class PurchaseOrderError extends Error { constructor(message: string, readonly statusCode = 400) { super(message); this.name = "PurchaseOrderError"; } }
const validId = (id: string) => Types.ObjectId.isValid(id);
async function audit(org: string, actor: string, action: string, type: string, id: string, metadata: Record<string, unknown>, meta: Meta) {
  await AuditEvent.create({ organizationId: org, actorUserId: actor, action, targetType: type, targetId: id, metadata, ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}), ...(meta.userAgent ? { userAgent: meta.userAgent } : {}) });
}
const poNumber = () => "PO-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(3).toString("hex").toUpperCase();
const receiptNumber = () => "GRN-" + new Date().toISOString().slice(0, 10).replaceAll("-", "") + "-" + randomBytes(3).toString("hex").toUpperCase();
export async function listPurchaseOrders(org: string) {
  return PurchaseOrder.find({ organizationId: org }).sort({ createdAt: -1 }).limit(200).populate("supplierId", "displayName email country").populate("rfqId", "rfqNumber title").lean();
}
export async function createPurchaseOrderFromAward(org: string, actor: string, input: CreatePurchaseOrderInput, meta: Meta) {
  if (!validId(input.rfqId) || !validId(input.quotationId)) throw new PurchaseOrderError("Invalid RFQ or quotation identifier", 400);
  const rfq = await Rfq.findOne({ _id: input.rfqId, organizationId: org, status: "awarded" });
  if (!rfq) throw new PurchaseOrderError("Only an awarded RFQ can generate a purchase order", 409);
  const quote = await Quotation.findOne({ _id: input.quotationId, organizationId: org, rfqId: rfq._id, status: "awarded" });
  if (!quote) throw new PurchaseOrderError("The selected quotation is not the awarded quotation for this RFQ", 409);
  if (quote.currency !== rfq.currency) throw new PurchaseOrderError("Quotation currency does not match the RFQ currency", 409);
  const supplier = await Supplier.findOne({ _id: quote.supplierId, organizationId: org, status: "approved" }).select("_id");
  if (!supplier) throw new PurchaseOrderError("Awarded supplier is no longer approved in this organization", 409);
  if (rfq.requisitionId && !await Requisition.exists({ _id: rfq.requisitionId, organizationId: org, status: "approved" })) throw new PurchaseOrderError("Linked requisition is not approved in this organization", 409);
  const existing = await PurchaseOrder.findOne({ organizationId: org, quotationId: quote._id });
  if (existing) return existing;
  const rfqItems = new Map(rfq.items.map((item) => [item._id.toString(), item]));
  const items = quote.items.map((line) => {
    const source = rfqItems.get(line.rfqItemId.toString());
    if (!source) throw new PurchaseOrderError("Awarded quotation contains an item outside the RFQ", 409);
    return { rfqItemId: source._id, description: source.description, quantity: source.quantity, unit: source.unit, unitPriceMinor: line.unitPriceMinor, receivedQuantity: 0 };
  });
  const totalMinor = items.reduce((sum, item) => sum + item.quantity * item.unitPriceMinor, 0);
  if (!Number.isSafeInteger(totalMinor) || totalMinor !== quote.totalMinor) throw new PurchaseOrderError("Awarded quotation total failed server verification", 409);
  try {
    const order = await PurchaseOrder.create({ organizationId: org, poNumber: poNumber(), supplierId: supplier._id, rfqId: rfq._id, quotationId: quote._id, requisitionId: rfq.requisitionId, currency: rfq.currency, items, totalMinor, status: "pending_approval", createdBy: actor });
    await audit(org, actor, "purchase_order.created_from_award", "purchase_order", order.id, { poNumber: order.poNumber, rfqId: rfq.id, quotationId: quote.id, totalMinor }, meta);
    return order;
  } catch (error) {
    const duplicate = await PurchaseOrder.findOne({ organizationId: org, quotationId: quote._id });
    if (duplicate) return duplicate;
    throw error;
  }
}
export async function approvePurchaseOrder(org: string, actor: string, id: string, meta: Meta) {
  if (!validId(id)) throw new PurchaseOrderError("Invalid purchase order identifier", 400);
  const order = await PurchaseOrder.findOneAndUpdate({ _id: id, organizationId: org, status: "pending_approval" }, { $set: { status: "approved", approvedBy: actor, approvedAt: new Date() } }, { new: true, runValidators: true });
  if (!order) throw new PurchaseOrderError("Pending purchase order was not found or has already been decided", 409);
  await audit(org, actor, "purchase_order.approved", "purchase_order", order.id, { poNumber: order.poNumber, totalMinor: order.totalMinor }, meta); return order;
}
export async function issuePurchaseOrder(org: string, actor: string, id: string, meta: Meta) {
  if (!validId(id)) throw new PurchaseOrderError("Invalid purchase order identifier", 400);
  const order = await PurchaseOrder.findOneAndUpdate({ _id: id, organizationId: org, status: "approved" }, { $set: { status: "issued", issuedBy: actor, issuedAt: new Date() } }, { new: true, runValidators: true });
  if (!order) throw new PurchaseOrderError("Only an approved purchase order can be issued", 409);
  await audit(org, actor, "purchase_order.issued", "purchase_order", order.id, { poNumber: order.poNumber }, meta); return order;
}
export async function receiveGoods(org: string, actor: string, id: string, input: ReceiveGoodsInput, meta: Meta) {
  if (!validId(id)) throw new PurchaseOrderError("Invalid purchase order identifier", 400);
  const order = await PurchaseOrder.findOne({ _id: id, organizationId: org, status: { $in: ["issued", "partially_received"] } });
  if (!order) throw new PurchaseOrderError("Goods can only be received against an issued, outstanding purchase order", 409);
  const seen = new Set<string>();
  for (const received of input.items) {
    if (seen.has(received.orderItemId)) throw new PurchaseOrderError("Receipt contains duplicate purchase order lines", 400);
    seen.add(received.orderItemId);
    const line = order.items.id(received.orderItemId);
    if (!line) throw new PurchaseOrderError("Receipt references a line outside this purchase order", 400);
    if (line.receivedQuantity + received.quantity > line.quantity) throw new PurchaseOrderError("Receipt quantity exceeds the outstanding ordered quantity for " + line.description, 409);
  }
  for (const received of input.items) order.items.id(received.orderItemId)!.receivedQuantity += received.quantity;
  order.receipts.push({ receiptNumber: receiptNumber(), items: input.items, receivedBy: actor, receivedAt: new Date(), notes: input.notes } as never);
  order.status = order.items.every((line) => line.receivedQuantity === line.quantity) ? "received" : "partially_received";
  try { await order.save(); } catch (error) {
    if (error instanceof Error && error.name === "VersionError") throw new PurchaseOrderError("Another receipt was recorded concurrently. Refresh the order and retry.", 409);
    throw error;
  }
  const receipt = order.receipts[order.receipts.length - 1]!;
  await audit(org, actor, "goods_receipt.recorded", "purchase_order", order.id, { poNumber: order.poNumber, receiptNumber: receipt.receiptNumber, status: order.status, items: input.items.map((item) => ({ orderItemId: item.orderItemId, quantity: item.quantity })) }, meta);
  return { order, receipt };
}
export async function recordPurchaseOrderRevision(org: string, actor: string, id: string, reason: string, meta: Meta) {
  if (!validId(id)) throw new PurchaseOrderError("Invalid purchase order identifier", 400);
  const order = await PurchaseOrder.findOne({ _id: id, organizationId: org, status: { $in: ["pending_approval", "approved"] } });
  if (!order) throw new PurchaseOrderError("Only an unissued purchase order can be revised", 409);
  const revision = order.revision + 1;
  order.revisions.push({ revision, reason, changedBy: actor, changedAt: new Date(), snapshot: { status: order.status, totalMinor: order.totalMinor, currency: order.currency, items: order.items.map((item) => ({ id: item.id, description: item.description, quantity: item.quantity, unit: item.unit, unitPriceMinor: item.unitPriceMinor })) } } as never);
  order.revision = revision; order.status = "pending_approval"; order.approvedBy = null; order.approvedAt = null;
  try { await order.save(); } catch (error) { if (error instanceof Error && error.name === "VersionError") throw new PurchaseOrderError("Purchase order changed concurrently. Refresh and retry.", 409); throw error; }
  await audit(org, actor, "purchase_order.revised", "purchase_order", order.id, { poNumber: order.poNumber, revision, reason }, meta); return order;
}
