import mongoose, { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { SupplierInvoice } from "../../models/supplier-invoice.model.js";
import { SupplierPayment } from "../../models/supplier-payment.model.js";
import type { SchedulePaymentInput } from "./payment.schemas.js";
type Meta = { ipAddress?: string; userAgent?: string };
export class PaymentError extends Error {
 constructor(message: string, readonly statusCode = 400) { super(message); this.name = "PaymentError"; }
}
const validId = (id: string) => Types.ObjectId.isValid(id);
async function audit(org: string, actor: string, action: string, id: string, metadata: Record<string, unknown>, meta: Meta, session: mongoose.ClientSession) {
 await AuditEvent.create([{
  organizationId: org, actorUserId: actor, action, targetType: "supplier_payment", targetId: id, metadata,
  ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}),
  ...(meta.userAgent ? { userAgent: meta.userAgent } : {}),
 }], { session });
}
function assertIdempotent(existing: { invoiceId: Types.ObjectId; amountMinor: number; paymentMethod: string }, input: SchedulePaymentInput) {
 if (String(existing.invoiceId) !== input.invoiceId || existing.amountMinor !== input.amountMinor || existing.paymentMethod !== input.paymentMethod) {
  throw new PaymentError("This idempotency key was already used for a different payment request", 409);
 }
}
export async function listSupplierPayments(org: string) {
 return SupplierPayment.find({ organizationId: org }).sort({ dueDate: 1, createdAt: -1 }).limit(500)
  .populate("supplierId", "displayName legalName")
  .populate("invoiceId", "invoiceNumber status totalMinor currency")
  .lean();
}
export async function scheduleSupplierPayment(org: string, actor: string, input: SchedulePaymentInput, meta: Meta) {
 if (!validId(input.invoiceId)) throw new PaymentError("Invalid supplier invoice identifier");
 const prior = await SupplierPayment.findOne({ organizationId: org, idempotencyKey: input.idempotencyKey });
 if (prior) { assertIdempotent(prior, input); return prior; }
 const session = await mongoose.startSession();
 let created: InstanceType<typeof SupplierPayment> | undefined;
 try {
  await session.withTransaction(async () => {
   const existing = await SupplierPayment.findOne({ organizationId: org, idempotencyKey: input.idempotencyKey }).session(session);
   if (existing) { assertIdempotent(existing, input); created = existing; return; }

   // This write serializes allocations for one invoice. Concurrent transactions
   // contend on the same invoice document and retry before computing the balance.
   const invoice = await SupplierInvoice.findOneAndUpdate(
    { _id: input.invoiceId, organizationId: org, status: "approved" },
    { $inc: { paymentAllocationVersion: 1 } },
    { new: true, session, runValidators: true },
   );
   if (!invoice) throw new PaymentError("Only an approved invoice can be scheduled for payment", 409);

   const commitments = await SupplierPayment.find({
    organizationId: org, invoiceId: invoice._id, status: { $in: ["scheduled", "paid"] },
   }).select("amountMinor").session(session).lean();
   const committedMinor = commitments.reduce((sum, item) => sum + item.amountMinor, 0);
   if (!Number.isSafeInteger(committedMinor)) throw new PaymentError("Existing payment allocations exceed safe monetary precision", 409);
   const remainingMinor = invoice.totalMinor - committedMinor;
   if (remainingMinor <= 0) throw new PaymentError("This invoice has no remaining payable balance", 409);
   if (input.amountMinor > remainingMinor) throw new PaymentError(`Payment exceeds the remaining invoice balance of ${remainingMinor} minor units`, 409);

   const docs = await SupplierPayment.create([{
    organizationId: org, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber,
    supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId,
    currency: invoice.currency, amountMinor: input.amountMinor, idempotencyKey: input.idempotencyKey,
    dueDate: input.dueDate ? new Date(input.dueDate) : invoice.dueDate,
    paymentMethod: input.paymentMethod, recordedBy: actor,
   }], { session });
   const payment = docs[0];
   if (!payment) throw new Error("Payment schedule creation returned no document");
   await audit(org, actor, "supplier_payment.scheduled", payment.id, {
    invoiceNumber: invoice.invoiceNumber, amountMinor: input.amountMinor, currency: invoice.currency,
    paymentMethod: input.paymentMethod, remainingAfterScheduleMinor: remainingMinor - input.amountMinor,
   }, meta, session);
   created = payment;
  });
 } catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === 11000) {
   const duplicate = await SupplierPayment.findOne({ organizationId: org, idempotencyKey: input.idempotencyKey });
   if (duplicate) { assertIdempotent(duplicate, input); return duplicate; }
   throw new PaymentError("A payment request with this idempotency key already exists", 409);
  }
  throw error;
 } finally { await session.endSession(); }
 if (!created) throw new Error("Payment transaction completed without a payment record");
 return created;
}
export async function settleSupplierPayment(org: string, actor: string, id: string, externalReference: string, paidAt: string | undefined, meta: Meta) {
 if (!validId(id)) throw new PaymentError("Invalid payment identifier");
 const session = await mongoose.startSession();
 let settled: InstanceType<typeof SupplierPayment> | null = null;
 try {
  await session.withTransaction(async () => {
   const payment = await SupplierPayment.findOneAndUpdate(
    { _id: id, organizationId: org, status: "scheduled" },
    { $set: { status: "paid", externalReference, paidAt: paidAt ? new Date(paidAt) : new Date(), settledBy: actor } },
    { new: true, runValidators: true, session },
   );
   if (!payment) throw new PaymentError("Only a scheduled payment can be marked as paid", 409);
   await audit(org, actor, "supplier_payment.settled", payment.id, {
    invoiceNumber: payment.invoiceNumber, amountMinor: payment.amountMinor, currency: payment.currency, externalReference,
   }, meta, session);
   settled = payment;
  });
 } finally { await session.endSession(); }
 const result = settled as InstanceType<typeof SupplierPayment> | null;
 if (!result) throw new PaymentError("Payment could not be settled", 409);
 return result;
}
async function transitionScheduledPayment(org: string, actor: string, id: string, status: "failed" | "cancelled", meta: Meta, reason?: string) {
 if (!validId(id)) throw new PaymentError("Invalid payment identifier");
 const session = await mongoose.startSession();
 let updated: InstanceType<typeof SupplierPayment> | null = null;
 try {
  await session.withTransaction(async () => {
   const payment = await SupplierPayment.findOneAndUpdate(
    { _id: id, organizationId: org, status: "scheduled" },
    { $set: { status, ...(reason ? { failureReason: reason } : {}) } },
    { new: true, runValidators: true, session },
   );
   if (!payment) throw new PaymentError("Only a scheduled payment can be updated", 409);
   await audit(org, actor, status === "failed" ? "supplier_payment.failed" : "supplier_payment.cancelled", payment.id, {
    invoiceNumber: payment.invoiceNumber, amountMinor: payment.amountMinor, currency: payment.currency,
    ...(reason ? { reason } : {}),
   }, meta, session);
   updated = payment;
  });
 } finally { await session.endSession(); }
 const result = updated as InstanceType<typeof SupplierPayment> | null;
 if (!result) throw new PaymentError("Payment could not be updated", 409);
 return result;
}
export async function failSupplierPayment(org: string, actor: string, id: string, reason: string, meta: Meta) {
 return transitionScheduledPayment(org, actor, id, "failed", meta, reason);
}
export async function cancelSupplierPayment(org: string, actor: string, id: string, meta: Meta) {
 return transitionScheduledPayment(org, actor, id, "cancelled", meta);
}
