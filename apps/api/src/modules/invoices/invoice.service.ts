import mongoose, { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { PurchaseOrder } from "../../models/purchase-order.model.js";
import { SupplierInvoice } from "../../models/supplier-invoice.model.js";
import type { SubmitInvoiceInput } from "./invoice.schemas.js";
type Meta = { ipAddress?: string; userAgent?: string };
type Finding = { code: string; message: string; purchaseOrderItemId?: Types.ObjectId; expectedMinor?: number; actualMinor?: number };
export class InvoiceError extends Error { constructor(message: string, readonly statusCode = 400) { super(message); this.name = "InvoiceError"; } }
const validId = (id: string) => Types.ObjectId.isValid(id);
async function audit(org: string, actor: string, action: string, id: string, metadata: Record<string, unknown>, meta: Meta, session?: mongoose.ClientSession) {
 const event = { organizationId: org, actorUserId: actor, action, targetType: "supplier_invoice", targetId: id, metadata, ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}), ...(meta.userAgent ? { userAgent: meta.userAgent } : {}) };
 if (session) await AuditEvent.create([event], { session });
 else await AuditEvent.create(event);
}
export async function listSupplierInvoices(org: string) {
 return SupplierInvoice.find({ organizationId: org }).sort({ createdAt: -1 }).limit(200).populate("supplierId", "displayName email").populate("purchaseOrderId", "poNumber status").lean();
}
export async function submitSupplierInvoice(org: string, actor: string, input: SubmitInvoiceInput, meta: Meta) {
 if (!validId(input.purchaseOrderId)) throw new InvoiceError("Invalid purchase order identifier");
 const session = await mongoose.startSession();
 let created: InstanceType<typeof SupplierInvoice> | undefined;
 try {
  await session.withTransaction(async () => {
   const order = await PurchaseOrder.findOne({ _id: input.purchaseOrderId, organizationId: org, status: { $in: ["issued", "partially_received", "received"] } }).session(session);
   if (!order) throw new InvoiceError("Invoices can only be submitted against an issued purchase order", 409);
   // Optimistic concurrency on the PO serializes submissions sharing this order.
   order.invoiceSequence += 1;
   try { await order.save({ session }); }
   catch (error) { if (error instanceof Error && error.name === "VersionError") { const conflict = new Error("Purchase order changed concurrently; retry invoice submission"); conflict.name = "TransientTransactionError"; throw conflict; } throw error; }
   if (await SupplierInvoice.exists({ organizationId: org, invoiceNumber: input.invoiceNumber }).session(session)) throw new InvoiceError("An invoice with this number already exists in this organization", 409);
   const seen = new Set<string>(), findings: Finding[] = [], invoiceItems = [];
   let subtotalMinor = 0;
   for (const item of input.items) {
    if (seen.has(item.purchaseOrderItemId)) throw new InvoiceError("Invoice contains duplicate purchase order lines");
    seen.add(item.purchaseOrderItemId);
    const poLine = order.items.id(item.purchaseOrderItemId);
    if (!poLine) throw new InvoiceError("Invoice references a line outside this purchase order");
    const lineTotalMinor = item.quantity * item.unitPriceMinor;
    if (!Number.isSafeInteger(lineTotalMinor) || !Number.isSafeInteger(subtotalMinor + lineTotalMinor)) throw new InvoiceError("Invoice amount exceeds safe monetary precision");
    subtotalMinor += lineTotalMinor;
    if (item.quantity > poLine.quantity) findings.push({ code: "QUANTITY_EXCEEDS_ORDER", message: "Invoiced quantity exceeds ordered quantity for " + poLine.description, purchaseOrderItemId: poLine._id, expectedMinor: poLine.quantity, actualMinor: item.quantity });
    if (item.unitPriceMinor !== poLine.unitPriceMinor) findings.push({ code: "UNIT_PRICE_MISMATCH", message: "Invoice unit price differs from the purchase order for " + poLine.description, purchaseOrderItemId: poLine._id, expectedMinor: poLine.unitPriceMinor, actualMinor: item.unitPriceMinor });
    const prior = await SupplierInvoice.find({ organizationId: org, purchaseOrderId: order._id, status: { $ne: "rejected" }, "items.purchaseOrderItemId": poLine._id }).select("items").session(session);
    const billed = prior.reduce((sum, invoice) => sum + invoice.items.filter(line => line.purchaseOrderItemId.equals(poLine._id)).reduce((quantity, line) => quantity + line.quantity, 0), 0);
    if (billed + item.quantity > poLine.quantity) findings.push({ code: "DUPLICATE_BILLING_QUANTITY", message: "Cumulative invoices exceed ordered quantity for " + poLine.description, purchaseOrderItemId: poLine._id, expectedMinor: poLine.quantity - billed, actualMinor: item.quantity });
    if (billed + item.quantity > poLine.receivedQuantity) findings.push({ code: "INVOICED_EXCEEDS_RECEIPTS", message: "Cumulative invoiced quantity exceeds cumulative goods received for " + poLine.description, purchaseOrderItemId: poLine._id, expectedMinor: Math.max(0, poLine.receivedQuantity - billed), actualMinor: item.quantity });
    invoiceItems.push({ purchaseOrderItemId: poLine._id, description: poLine.description, quantity: item.quantity, unitPriceMinor: item.unitPriceMinor, lineTotalMinor });
   }
   const totalMinor = subtotalMinor + input.taxMinor;
   if (!Number.isSafeInteger(totalMinor)) throw new InvoiceError("Invoice total exceeds safe monetary precision");
   const docs = await SupplierInvoice.create([{ organizationId: org, invoiceNumber: input.invoiceNumber, supplierId: order.supplierId, purchaseOrderId: order._id, purchaseOrderNumber: order.poNumber, currency: order.currency, invoiceDate: new Date(input.invoiceDate), dueDate: input.dueDate ? new Date(input.dueDate) : null, items: invoiceItems, subtotalMinor, taxMinor: input.taxMinor, totalMinor, status: findings.length ? "needs_review" : "matched", matchFindings: findings, notes: input.notes, submittedBy: actor }], { session });
   const invoice = docs[0];
   if (!invoice) throw new Error("Invoice creation did not return a document");
   await audit(org, actor, "supplier_invoice.submitted", invoice.id, { invoiceNumber: invoice.invoiceNumber, purchaseOrderNumber: order.poNumber, status: invoice.status, totalMinor, currency: order.currency, findingCount: findings.length }, meta, session);
   created = invoice;
  });
 } catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new InvoiceError("An invoice with this number already exists in this organization", 409);
  throw error;
 } finally { await session.endSession(); }
 if (!created) throw new Error("Invoice transaction completed without creating an invoice");
 return created;
}
export async function approveSupplierInvoice(org: string, actor: string, id: string, meta: Meta) {
 if (!validId(id)) throw new InvoiceError("Invalid supplier invoice identifier");
 const invoice = await SupplierInvoice.findOneAndUpdate({ _id: id, organizationId: org, status: "matched" }, { $set: { status: "approved", reviewedBy: actor, reviewedAt: new Date() } }, { new: true, runValidators: true });
 if (!invoice) throw new InvoiceError("Only a successfully matched invoice can be approved", 409);
 await audit(org, actor, "supplier_invoice.approved", invoice.id, { invoiceNumber: invoice.invoiceNumber, purchaseOrderNumber: invoice.purchaseOrderNumber, totalMinor: invoice.totalMinor, currency: invoice.currency }, meta);
 return invoice;
}
export async function rejectSupplierInvoice(org: string, actor: string, id: string, reason: string, meta: Meta) {
 if (!validId(id)) throw new InvoiceError("Invalid supplier invoice identifier");
 const invoice = await SupplierInvoice.findOneAndUpdate({ _id: id, organizationId: org, status: { $in: ["matched", "needs_review"] } }, { $set: { status: "rejected", rejectionReason: reason, reviewedBy: actor, reviewedAt: new Date() } }, { new: true, runValidators: true });
 if (!invoice) throw new InvoiceError("Invoice was not found or has already been decided", 409);
 await audit(org, actor, "supplier_invoice.rejected", invoice.id, { invoiceNumber: invoice.invoiceNumber, reason, previousFindings: invoice.matchFindings.map(f => f.code) }, meta);
 return invoice;
}
