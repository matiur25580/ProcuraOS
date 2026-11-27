import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditEvent } from "../../models/audit-event.model.js";
import { Organization } from "../../models/organization.model.js";
import { Supplier } from "../../models/supplier.model.js";
import { SupplierInvoice } from "../../models/supplier-invoice.model.js";
import { SupplierPayment } from "../../models/supplier-payment.model.js";
import { User } from "../../models/user.model.js";
import { PaymentError, cancelSupplierPayment, listSupplierPayments, scheduleSupplierPayment, settleSupplierPayment } from "./payment.service.js";
let replicaSet: MongoMemoryReplSet;
let orgId: Types.ObjectId, userId: Types.ObjectId, invoiceId: Types.ObjectId;
const meta = { ipAddress: "127.0.0.1", userAgent: "payment integration test" };
beforeAll(async () => {
 replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
 await mongoose.connect(replicaSet.getUri("procuraos_payment_integration"));
 await Promise.all([User.init(), Organization.init(), Supplier.init(), SupplierInvoice.init(), SupplierPayment.init(), AuditEvent.init()]);
}, 120000);
beforeEach(async () => {
 await Promise.all([SupplierPayment.deleteMany({}), SupplierInvoice.deleteMany({}), AuditEvent.deleteMany({}), Supplier.deleteMany({}), Organization.deleteMany({}), User.deleteMany({})]);
 const user = await User.create({ name: "Finance User", email: "finance@example.test", passwordHash: "test-hash", emailVerifiedAt: new Date() });
 const org = await Organization.create({ name: "Payment Tenant", slug: "payment-tenant", createdBy: user._id });
 const supplier = await Supplier.create({ organizationId: org._id, legalName: "Supplier Ltd", displayName: "Supplier", taxId: "PAY-TAX", contactName: "AP", email: "ap@supplier.test", country: "IN" });
 const invoice = await SupplierInvoice.create({ organizationId: org._id, invoiceNumber: "INV-PAY-001", supplierId: supplier._id, purchaseOrderId: new Types.ObjectId(), purchaseOrderNumber: "PO-PAY-001", currency: "INR", invoiceDate: new Date(), items: [{ purchaseOrderItemId: new Types.ObjectId(), description: "Parts", quantity: 2, unitPriceMinor: 5000, lineTotalMinor: 10000 }], subtotalMinor: 10000, taxMinor: 1800, totalMinor: 11800, status: "approved", submittedBy: user._id });
 orgId = org._id; userId = user._id; invoiceId = invoice._id;
});
afterAll(async () => { await mongoose.disconnect(); await replicaSet.stop(); });
describe("supplier payment lifecycle", () => {
 it("schedules a payment only for an approved invoice and records an audit event", async () => {
  const payment = await scheduleSupplierPayment(orgId.toString(), userId.toString(), { invoiceId: invoiceId.toString(), paymentMethod: "bank_transfer" }, meta);
  expect(payment.status).toBe("scheduled"); expect(payment.amountMinor).toBe(11800); expect(payment.currency).toBe("INR");
  expect(await AuditEvent.exists({ organizationId: orgId, action: "supplier_payment.scheduled", targetId: payment.id })).not.toBeNull();
 });
 it("prevents duplicate payment records for an invoice", async () => {
  const input = { invoiceId: invoiceId.toString(), paymentMethod: "bank_transfer" as const };
  await scheduleSupplierPayment(orgId.toString(), userId.toString(), input, meta);
  await expect(scheduleSupplierPayment(orgId.toString(), userId.toString(), input, meta)).rejects.toBeInstanceOf(PaymentError);
 });
 it("requires an approved invoice before scheduling", async () => {
  await SupplierInvoice.updateOne({ _id: invoiceId }, { $set: { status: "matched" } });
  await expect(scheduleSupplierPayment(orgId.toString(), userId.toString(), { invoiceId: invoiceId.toString(), paymentMethod: "cash" }, meta)).rejects.toMatchObject({ statusCode: 409 });
 });
 it("marks a scheduled payment paid with an external settlement reference and audit", async () => {
  const payment = await scheduleSupplierPayment(orgId.toString(), userId.toString(), { invoiceId: invoiceId.toString(), paymentMethod: "bank_transfer" }, meta);
  const settled = await settleSupplierPayment(orgId.toString(), userId.toString(), payment.id, "BANK-UTR-20261127-01", undefined, meta);
  expect(settled.status).toBe("paid"); expect(settled.externalReference).toBe("BANK-UTR-20261127-01"); expect(settled.paidAt).toBeInstanceOf(Date);
  expect(await AuditEvent.exists({ organizationId: orgId, action: "supplier_payment.settled", targetId: payment.id })).not.toBeNull();
 });
 it("does not allow a payment to be settled twice or cancelled after settlement", async () => {
  const payment = await scheduleSupplierPayment(orgId.toString(), userId.toString(), { invoiceId: invoiceId.toString(), paymentMethod: "other" }, meta);
  await settleSupplierPayment(orgId.toString(), userId.toString(), payment.id, "EXT-SETTLED-001", undefined, meta);
  await expect(settleSupplierPayment(orgId.toString(), userId.toString(), payment.id, "EXT-SETTLED-002", undefined, meta)).rejects.toBeInstanceOf(PaymentError);
  await expect(cancelSupplierPayment(orgId.toString(), userId.toString(), payment.id, meta)).rejects.toBeInstanceOf(PaymentError);
 });
 it("scopes payment listing to the active organization", async () => {
  const other = await Organization.create({ name: "Other", slug: "other-payment-tenant", createdBy: userId });
  await scheduleSupplierPayment(orgId.toString(), userId.toString(), { invoiceId: invoiceId.toString(), paymentMethod: "card" }, meta);
  expect(await listSupplierPayments(other.id)).toHaveLength(0);
 });
});
