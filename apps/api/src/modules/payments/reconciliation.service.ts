import mongoose, { Types } from "mongoose";
import { AuditEvent } from "../../models/audit-event.model.js";
import { BankStatementLine } from "../../models/bank-statement-line.model.js";
import { SupplierPayment } from "../../models/supplier-payment.model.js";
import type { ImportStatementLineInput } from "./reconciliation.schemas.js";
import { PaymentError } from "./payment.service.js";
type Meta = { ipAddress?: string; userAgent?: string };
const validId = (id: string) => Types.ObjectId.isValid(id);
async function writeAudit(org: string, actor: string, action: string, targetId: string, metadata: Record<string, unknown>, meta: Meta, session: mongoose.ClientSession) {
 await AuditEvent.create([{ organizationId: org, actorUserId: actor, action, targetType: "bank_statement_line", targetId, metadata, ...(meta.ipAddress ? { ipAddress: meta.ipAddress } : {}), ...(meta.userAgent ? { userAgent: meta.userAgent } : {}) }], { session });
}
export async function importStatementLine(org: string, actor: string, input: ImportStatementLineInput, meta: Meta) {
 const session = await mongoose.startSession();
 let created: InstanceType<typeof BankStatementLine> | null = null;
 try {
  await session.withTransaction(async () => {
   const docs = await BankStatementLine.create([{ ...input, organizationId: org, transactionDate: new Date(input.transactionDate), importedBy: actor }], { session });
   const line = docs[0];
   if (!line) throw new Error("Statement line import returned no document");
   await writeAudit(org, actor, "bank_statement_line.imported", line.id, { transactionId: line.transactionId, amountMinor: line.amountMinor, currency: line.currency }, meta, session);
   created = line;
  });
 } catch (error) {
  if (error && typeof error === "object" && "code" in error && error.code === 11000) throw new PaymentError("This bank transaction has already been imported", 409);
  throw error;
 } finally { await session.endSession(); }
 if (!created) throw new Error("Statement line import did not complete");
 return created;
}
export async function listStatementLines(org: string) {
 return BankStatementLine.find({ organizationId: org }).sort({ transactionDate: -1, createdAt: -1 }).limit(500)
  .populate("matchedPaymentId", "invoiceNumber amountMinor currency externalReference status").lean();
}
export async function matchStatementLine(org: string, actor: string, lineId: string, paymentId: string, meta: Meta) {
 if (!validId(lineId) || !validId(paymentId)) throw new PaymentError("Invalid reconciliation identifier");
 const session = await mongoose.startSession();
 let matched: InstanceType<typeof BankStatementLine> | null = null;
 try {
  await session.withTransaction(async () => {
   const line = await BankStatementLine.findOne({ _id: lineId, organizationId: org, status: "unmatched" }).session(session);
   if (!line) throw new PaymentError("Only an unmatched statement line can be reconciled", 409);
   const payment = await SupplierPayment.findOne({ _id: paymentId, organizationId: org, status: "paid" }).session(session);
   if (!payment) throw new PaymentError("Only a settled payment in this organization can be reconciled", 409);
   if (line.amountMinor !== payment.amountMinor || line.currency !== payment.currency || line.reference !== payment.externalReference)
    throw new PaymentError("Statement amount, currency and reference must exactly match the settled payment", 409);
   if (await BankStatementLine.exists({ organizationId: org, matchedPaymentId: payment._id }).session(session))
    throw new PaymentError("This payment is already reconciled to another statement line", 409);
   const updated = await BankStatementLine.findOneAndUpdate({ _id: line._id, organizationId: org, status: "unmatched" }, { $set: { status: "matched", matchedPaymentId: payment._id, matchedBy: actor, matchedAt: new Date() } }, { new: true, runValidators: true, session });
   if (!updated) throw new PaymentError("Statement line was updated by another request", 409);
   await writeAudit(org, actor, "bank_statement_line.matched", updated.id, { paymentId: payment.id, transactionId: line.transactionId, amountMinor: line.amountMinor, currency: line.currency }, meta, session);
   matched = updated;
  });
 } finally { await session.endSession(); }
 const result = matched as InstanceType<typeof BankStatementLine> | null;
 if (!result) throw new PaymentError("Reconciliation could not be completed", 409);
 return result;
}
export async function getPaymentReport(org: string) {
 const payments = await SupplierPayment.find({ organizationId: org }).select("amountMinor currency status dueDate paidAt").lean();
 const now = Date.now();
 const buckets = new Map<string, { scheduledMinor: number; paidMinor: number; failedMinor: number; cancelledMinor: number; overdueMinor: number; currentMinor: number; days1to30Minor: number; days31to60Minor: number; days61PlusMinor: number; counts: number }>();
 for (const payment of payments) {
  const row = buckets.get(payment.currency) ?? { scheduledMinor: 0, paidMinor: 0, failedMinor: 0, cancelledMinor: 0, overdueMinor: 0, currentMinor: 0, days1to30Minor: 0, days31to60Minor: 0, days61PlusMinor: 0, counts: 0 };
  row.counts++;
  if (payment.status === "scheduled") {
   row.scheduledMinor += payment.amountMinor;
   const due = payment.dueDate?.getTime();
   if (due !== undefined && due < now) {
    row.overdueMinor += payment.amountMinor;
    const age = Math.floor((now - due) / 86400000);
    if (age <= 30) row.days1to30Minor += payment.amountMinor;
    else if (age <= 60) row.days31to60Minor += payment.amountMinor;
    else row.days61PlusMinor += payment.amountMinor;
   } else row.currentMinor += payment.amountMinor;
  } else if (payment.status === "paid") row.paidMinor += payment.amountMinor;
  else if (payment.status === "failed") row.failedMinor += payment.amountMinor;
  else row.cancelledMinor += payment.amountMinor;
  buckets.set(payment.currency, row);
 }
 return { generatedAt: new Date().toISOString(), totalPaymentRecords: payments.length, currencies: [...buckets.entries()].map(([currency, totals]) => ({ currency, ...totals })) };
}
