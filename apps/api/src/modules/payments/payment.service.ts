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
async function audit(org: string, actor: string, action: string, id: string, metadata: Record<string, unknown>, meta: Meta, session?: mongoose.ClientSession) {
 const event = { organizationId: org, actorUserId: actor, action, targetType: "supplier_payment", targetId: id, metadata, ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}), ...(meta.userAgent ? { userAgent: meta.userAgent } : {}) };
 if (session) await AuditEvent.create([event], { session }); else await AuditEvent.create(event);
}
export async function listSupplierPayments(org: string) {
 return SupplierPayment.find({ organizationId: org }).sort({ dueDate: 1, createdAt: -1 }).limit(300)
  .populate("supplierId", "displayName legalName").populate("invoiceId", "invoiceNumber status").lean();
}
export async function scheduleSupplierPayment(org: string, actor: string, input: SchedulePaymentInput, meta: Meta) {
 if (!validId(input.invoiceId)) throw new PaymentError("Invalid supplier invoice identifier");
 const session = await mongoose.startSession();
 let created: InstanceType<typeof SupplierPayment> | undefined;
 try {
  await session.withTransaction(async () => {
   const invoice = await SupplierInvoice.findOne({ _id: input.invoiceId, organizationId: org, status: "approved" }).session(session);
   if (!invoice) throw new PaymentError("Only an approved invoice can be scheduled for payment", 409);
   if (await SupplierPayment.exists({ organizationId: org, invoiceId: invoice._id }).session(session)) throw new PaymentError("A payment record already exists for this invoice", 409);
   const docs = await SupplierPayment.create([{
    organizationId: org, invoiceId: invoice._id, invoiceNumber: invoice.invoiceNumber,
    supplierId: invoice.supplierId, purchaseOrderId: invoice.purchaseOrderId,
    currency: invoice.currency, amountMinor: invoice.totalMinor,
    dueDate: input.dueDate ? new Date(input.dueDate) : invoice.dueDate,
    paymentMethod: input.paymentMethod, recordedBy: actor,
   }], { session });
   const payment = docs[0];
   if (!payment) throw new Error("Payment schedule creation returned no document");
   await audit(org, actor, "supplier_payment.scheduled", payment.id, { invoiceNumber: invoice.invoiceNumber, amountMinor: invoice.totalMinor, currency: invoice.currency, paymentMethod: input.paymentMethod }, meta, session);
   created = payment;
  });
 } catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new PaymentError("A payment record already exists for this invoice", 409);
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
   const payment = await SupplierPayment.findOneAndUpdate({ _id: id, organizationId: org, status: "scheduled" }, { $set: { status: "paid", externalReference, paidAt: paidAt ? new Date(paidAt) : new Date(), settledBy: actor } }, { new: true, runValidators: true, session });
   if (!payment) throw new PaymentError("Only a scheduled payment can be marked as paid", 409);
   await audit(org, actor, "supplier_payment.settled", payment.id, { invoiceNumber: payment.invoiceNumber, amountMinor: payment.amountMinor, currency: payment.currency, externalReference }, meta, session);
   settled = payment;
  });
 } finally { await session.endSession(); }
 const result = settled as InstanceType<typeof SupplierPayment> | null;
 if (!result) throw new PaymentError("Payment could not be settled", 409);
 return result;
}
export async function failSupplierPayment(org: string, actor: string, id: string, reason: string, meta: Meta) {
 if (!validId(id)) throw new PaymentError("Invalid payment identifier");
 const payment = await SupplierPayment.findOneAndUpdate(
  { _id: id, organizationId: org, status: "scheduled" },
  { $set: { status: "failed", failureReason: reason } },
  { new: true, runValidators: true },
 );
 if (!payment) throw new PaymentError("Only a scheduled payment can be marked as failed", 409);
 await audit(org, actor, "supplier_payment.failed", payment.id, { invoiceNumber: payment.invoiceNumber, reason }, meta);
 return payment;
}
export async function cancelSupplierPayment(org: string, actor: string, id: string, meta: Meta) {
 if (!validId(id)) throw new PaymentError("Invalid payment identifier");
 const payment = await SupplierPayment.findOneAndUpdate(
  { _id: id, organizationId: org, status: "scheduled" },
  { $set: { status: "cancelled" } },
  { new: true, runValidators: true },
 );
 if (!payment) throw new PaymentError("Only a scheduled payment can be cancelled", 409);
 await audit(org, actor, "supplier_payment.cancelled", payment.id, { invoiceNumber: payment.invoiceNumber }, meta);
 return payment;
}
