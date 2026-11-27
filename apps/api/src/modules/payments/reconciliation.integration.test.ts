import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditEvent } from "../../models/audit-event.model.js";
import { BankStatementLine } from "../../models/bank-statement-line.model.js";
import { Organization } from "../../models/organization.model.js";
import { Supplier } from "../../models/supplier.model.js";
import { SupplierInvoice } from "../../models/supplier-invoice.model.js";
import { SupplierPayment } from "../../models/supplier-payment.model.js";
import { User } from "../../models/user.model.js";
import { scheduleSupplierPayment, settleSupplierPayment, PaymentError } from "./payment.service.js";
import { getPaymentReport, importStatementLine, listStatementLines, matchStatementLine } from "./reconciliation.service.js";
let repl: MongoMemoryReplSet;
let org: Types.ObjectId, actor: Types.ObjectId, invoice: Types.ObjectId;
const meta = { ipAddress: "127.0.0.1", userAgent: "reconciliation test" };
beforeAll(async () => {
 repl = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
 await mongoose.connect(repl.getUri("procuraos_reconciliation"));
 await Promise.all([User.init(), Organization.init(), Supplier.init(), SupplierInvoice.init(), SupplierPayment.init(), BankStatementLine.init(), AuditEvent.init()]);
}, 120000);
beforeEach(async () => {
 await Promise.all([BankStatementLine.deleteMany({}), SupplierPayment.deleteMany({}), SupplierInvoice.deleteMany({}), AuditEvent.deleteMany({}), Supplier.deleteMany({}), Organization.deleteMany({}), User.deleteMany({})]);
 const user = await User.create({ name: "Finance", email: "finance-recon@example.test", passwordHash: "test", emailVerifiedAt: new Date() });
 const organization = await Organization.create({ name: "Recon tenant", slug: "recon-tenant", createdBy: user._id });
 const supplier = await Supplier.create({ organizationId: organization._id, legalName: "Recon Supplier", displayName: "Recon Supplier", taxId: "RECON-1", contactName: "AP", email: "recon@supplier.test", country: "IN" });
 const inv = await SupplierInvoice.create({ organizationId: organization._id, invoiceNumber: "INV-RECON", supplierId: supplier._id, purchaseOrderId: new Types.ObjectId(), purchaseOrderNumber: "PO-RECON", currency: "INR", invoiceDate: new Date(), items: [{ purchaseOrderItemId: new Types.ObjectId(), description: "Goods", quantity: 1, unitPriceMinor: 10000, lineTotalMinor: 10000 }], subtotalMinor: 10000, taxMinor: 0, totalMinor: 10000, status: "approved", submittedBy: user._id });
 org = organization._id; actor = user._id; invoice = inv._id;
});
afterAll(async () => { await mongoose.disconnect(); await repl.stop(); });
describe("bank reconciliation and payment reporting", () => {
 it("imports a statement line idempotently and matches exact settled payment values", async () => {
  const payment = await scheduleSupplierPayment(org.toString(), actor.toString(), { invoiceId: invoice.toString(), amountMinor: 10000, idempotencyKey: "recon-payment-0001", paymentMethod: "bank_transfer" }, meta);
  await settleSupplierPayment(org.toString(), actor.toString(), payment.id, "UTR-RECON-001", undefined, meta);
  const input = { bankAccountLabel: "Operating account", transactionId: "BANK-TX-001", transactionDate: new Date().toISOString(), amountMinor: 10000, currency: "INR", reference: "UTR-RECON-001", description: "Supplier settlement" };
  const line = await importStatementLine(org.toString(), actor.toString(), input, meta);
  await expect(importStatementLine(org.toString(), actor.toString(), input, meta)).rejects.toMatchObject({ statusCode: 409 });
  const matched = await matchStatementLine(org.toString(), actor.toString(), line.id, payment.id, meta);
  expect(matched.status).toBe("matched");
  expect(await AuditEvent.exists({ organizationId: org, action: "bank_statement_line.matched", targetId: line.id })).not.toBeNull();
  expect(await listStatementLines(org.toString())).toHaveLength(1);
 });
 it("rejects amount, currency and reference mismatches", async () => {
  const payment = await scheduleSupplierPayment(org.toString(), actor.toString(), { invoiceId: invoice.toString(), paymentMethod: "bank_transfer" }, meta);
  await settleSupplierPayment(org.toString(), actor.toString(), payment.id, "UTR-EXPECTED", undefined, meta);
  const line = await importStatementLine(org.toString(), actor.toString(), { bankAccountLabel: "Operating", transactionId: "BANK-TX-002", transactionDate: new Date().toISOString(), amountMinor: 9999, currency: "INR", reference: "UTR-EXPECTED" }, meta);
  await expect(matchStatementLine(org.toString(), actor.toString(), line.id, payment.id, meta)).rejects.toBeInstanceOf(PaymentError);
 });
 it("keeps financial totals separated by currency and reports overdue ageing", async () => {
  const payment = await scheduleSupplierPayment(org.toString(), actor.toString(), { invoiceId: invoice.toString(), amountMinor: 10000, idempotencyKey: "recon-payment-0002", paymentMethod: "cash" }, meta);
  await SupplierPayment.updateOne({ _id: payment.id }, { $set: { dueDate: new Date(Date.now() - 40 * 86400000) } });
  const report = await getPaymentReport(org.toString());
  expect(report.currencies).toHaveLength(1);
  expect(report.currencies[0]).toMatchObject({ currency: "INR", scheduledMinor: 10000, overdueMinor: 10000, days31to60Minor: 10000 });
 });
 it("does not expose another tenant statement lines", async () => {
  await importStatementLine(org.toString(), actor.toString(), { bankAccountLabel: "Operating", transactionId: "BANK-TX-003", transactionDate: new Date().toISOString(), amountMinor: 10000, currency: "INR", reference: "UNMATCHED-1" }, meta);
  const other = await Organization.create({ name: "Other tenant", slug: "other-recon", createdBy: actor });
  expect(await listStatementLines(other.id)).toHaveLength(0);
 });
});
