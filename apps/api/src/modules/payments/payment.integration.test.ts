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
let keySequence = 0;
const scheduleInput = (overrides: Partial<{ amountMinor: number; paymentMethod: "bank_transfer" | "cash" | "card" | "other"; idempotencyKey: string }> = {}) => ({
 invoiceId: invoiceId.toString(), amountMinor: 11800, paymentMethod: "bank_transfer" as const,
 idempotencyKey: `payment-test-key-${++keySequence}`, ...overrides,
});
beforeAll(async () => {
 replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
 await mongoose.connect(replicaSet.getUri("procuraos_payment_integration"));
 await Promise.all([User.init(), Organization.init(), Supplier.init(), SupplierInvoice.init(), SupplierPayment.init(), AuditEvent.init()]);
}, 120000);
beforeEach(async () => {
 keySequence = 0;
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
  const payment = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput(), meta);
  expect(payment.status).toBe("scheduled"); expect(payment.amountMinor).toBe(11800); expect(payment.currency).toBe("INR");
  expect(await AuditEvent.exists({ organizationId: orgId, action: "supplier_payment.scheduled", targetId: payment.id })).not.toBeNull();
 });
 it("supports multiple partial payments and prevents allocations above the invoice total", async () => {
  const first = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 5000 }), meta);
  const second = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 6000 }), meta);
  expect(first.id).not.toBe(second.id);
  await expect(scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 801 }), meta))
   .rejects.toMatchObject({ statusCode: 409 });
  const payments = await SupplierPayment.find({ organizationId: orgId, invoiceId });
  expect(payments).toHaveLength(2);
  expect(payments.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(11000);
 });
 it("returns the original record for an identical idempotent retry and rejects key reuse with different data", async () => {
  const input = scheduleInput({ amountMinor: 2500, idempotencyKey: "retry-key-00001" });
  const first = await scheduleSupplierPayment(orgId.toString(), userId.toString(), input, meta);
  const retry = await scheduleSupplierPayment(orgId.toString(), userId.toString(), input, meta);
  expect(retry.id).toBe(first.id);
  await expect(scheduleSupplierPayment(orgId.toString(), userId.toString(), { ...input, amountMinor: 3000 }, meta))
   .rejects.toMatchObject({ statusCode: 409 });
 });
 it("releases reserved balance when a scheduled allocation is cancelled or failed", async () => {
  const cancelled = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 9000 }), meta);
  await cancelSupplierPayment(orgId.toString(), userId.toString(), cancelled.id, meta);
  const next = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 11800 }), meta);
  expect(next.status).toBe("scheduled");
 });
 it("requires an approved invoice before scheduling", async () => {
  await SupplierInvoice.updateOne({ _id: invoiceId }, { $set: { status: "matched" } });
  await expect(scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ paymentMethod: "cash" }), meta)).rejects.toMatchObject({ statusCode: 409 });
 });
 it("marks a scheduled partial payment paid with an external settlement reference and audit", async () => {
  const payment = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 4000 }), meta);
  const settled = await settleSupplierPayment(orgId.toString(), userId.toString(), payment.id, "BANK-UTR-20261127-01", undefined, meta);
  expect(settled.status).toBe("paid"); expect(settled.amountMinor).toBe(4000); expect(settled.externalReference).toBe("BANK-UTR-20261127-01");
  expect(settled.paidAt).toBeInstanceOf(Date);
  expect(await AuditEvent.exists({ organizationId: orgId, action: "supplier_payment.settled", targetId: payment.id })).not.toBeNull();
  await expect(scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 8001 }), meta)).rejects.toMatchObject({ statusCode: 409 });
 });
 it("does not allow a payment to be settled twice or cancelled after settlement", async () => {
  const payment = await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput(), meta);
  await settleSupplierPayment(orgId.toString(), userId.toString(), payment.id, "EXT-SETTLED-001", undefined, meta);
  await expect(settleSupplierPayment(orgId.toString(), userId.toString(), payment.id, "EXT-SETTLED-002", undefined, meta)).rejects.toBeInstanceOf(PaymentError);
  await expect(cancelSupplierPayment(orgId.toString(), userId.toString(), payment.id, meta)).rejects.toBeInstanceOf(PaymentError);
 });
 it("serializes concurrent allocations and prevents aggregate overpayment", async () => {
  const results = await Promise.allSettled([
   scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 7000 }), meta),
   scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ amountMinor: 7000 }), meta),
  ]);
  expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
  expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
  const payments = await SupplierPayment.find({ organizationId: orgId, invoiceId, status: "scheduled" });
  expect(payments.reduce((sum, item) => sum + item.amountMinor, 0)).toBe(7000);
 });
 it("scopes payment listing to the active organization", async () => {
  const other = await Organization.create({ name: "Other", slug: "other-payment-tenant", createdBy: userId });
  await scheduleSupplierPayment(orgId.toString(), userId.toString(), scheduleInput({ paymentMethod: "card" }), meta);
  expect(await listSupplierPayments(other.id)).toHaveLength(0);
 });
});
