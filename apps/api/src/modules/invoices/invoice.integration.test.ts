import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import mongoose, { Types } from "mongoose";
import { MongoMemoryReplSet } from "mongodb-memory-server";
import { AuditEvent } from "../../models/audit-event.model.js";
import { Organization } from "../../models/organization.model.js";
import { PurchaseOrder } from "../../models/purchase-order.model.js";
import { Supplier } from "../../models/supplier.model.js";
import { SupplierInvoice } from "../../models/supplier-invoice.model.js";
import { User } from "../../models/user.model.js";
import {
  approveSupplierInvoice,
  InvoiceError,
  listSupplierInvoices,
  rejectSupplierInvoice,
  submitSupplierInvoice,
} from "./invoice.service.js";

let replicaSet: MongoMemoryReplSet;
const metadata = { ipAddress: "127.0.0.1", userAgent: "ProcuraOS invoice integration test" };

async function createFixture(suffix: string) {
  const actorId = new Types.ObjectId();
  const user = await User.create({
    _id: actorId,
    name: "Finance Operator",
    email: `finance-${suffix}@example.test`,
    passwordHash: "test-only-password-hash",
    emailVerifiedAt: new Date(),
  });
  const organization = await Organization.create({
    name: `Tenant ${suffix}`,
    slug: `tenant-${suffix}`,
    createdBy: user._id,
  });
  const supplier = await Supplier.create({
    organizationId: organization._id,
    legalName: `Supplier ${suffix} Ltd`,
    displayName: `Supplier ${suffix}`,
    taxId: `TAX-${suffix}`,
    contactName: "Accounts Payable",
    email: `ap-${suffix}@supplier.example.test`,
    country: "IN",
  });
  const order = await PurchaseOrder.create({
    organizationId: organization._id,
    poNumber: `PO-${suffix}`,
    supplierId: supplier._id,
    rfqId: new Types.ObjectId(),
    quotationId: new Types.ObjectId(),
    currency: "INR",
    items: [{
      description: "Industrial components",
      rfqItemId: new Types.ObjectId(),
      quantity: 10,
      unit: "piece",
      unitPriceMinor: 4500,
      receivedQuantity: 10,
    }],
    totalMinor: 45000,
    status: "issued",
    createdBy: user._id,
  });
  return { user, organization, supplier, order, itemId: order.items[0]!._id };
}

function invoiceInput(orderId: Types.ObjectId, itemId: Types.ObjectId, invoiceNumber: string, overrides: Record<string, unknown> = {}) {
  return {
    invoiceNumber,
    purchaseOrderId: orderId.toString(),
    invoiceDate: "2026-11-27T00:00:00.000Z",
    taxMinor: 1800,
    notes: "",
    items: [{ purchaseOrderItemId: itemId.toString(), quantity: 2, unitPriceMinor: 4500 }],
    ...overrides,
  };
}

beforeAll(async () => {
  replicaSet = await MongoMemoryReplSet.create({ replSet: { count: 1, storageEngine: "wiredTiger" } });
  await mongoose.connect(replicaSet.getUri("procuraos_invoice_integration"));
  await Promise.all([
    User.init(), Organization.init(), Supplier.init(), PurchaseOrder.init(),
    SupplierInvoice.init(), AuditEvent.init(),
  ]);
}, 120_000);

beforeEach(async () => {
  await Promise.all([
    AuditEvent.deleteMany({}), SupplierInvoice.deleteMany({}), PurchaseOrder.deleteMany({}),
    Supplier.deleteMany({}), Organization.deleteMany({}), User.deleteMany({}),
  ]);
});

afterAll(async () => {
  await mongoose.disconnect();
  await replicaSet.stop();
});

describe("supplier invoice integration", () => {
  it("creates a matched invoice, computes totals and writes an audit event", async () => {
    const fixture = await createFixture("matched");
    const invoice = await submitSupplierInvoice(
      fixture.organization.id,
      fixture.user.id,
      invoiceInput(fixture.order._id, fixture.itemId, "INV-MATCHED"),
      metadata,
    );

    expect(invoice.status).toBe("matched");
    expect(invoice.subtotalMinor).toBe(9000);
    expect(invoice.totalMinor).toBe(10800);
    expect(invoice.items[0]?.lineTotalMinor).toBe(9000);
    expect(await AuditEvent.exists({
      organizationId: fixture.organization._id,
      actorUserId: fixture.user._id,
      action: "supplier_invoice.submitted",
      targetId: invoice.id,
    })).not.toBeNull();
  });

  it("flags quantity and price mismatches and prevents approval", async () => {
    const fixture = await createFixture("review");
    const invoice = await submitSupplierInvoice(
      fixture.organization.id,
      fixture.user.id,
      invoiceInput(fixture.order._id, fixture.itemId, "INV-REVIEW", {
        items: [{ purchaseOrderItemId: fixture.itemId.toString(), quantity: 2, unitPriceMinor: 5000 }],
      }),
      metadata,
    );

    expect(invoice.status).toBe("needs_review");
    expect(invoice.matchFindings.map((finding) => finding.code)).toContain("UNIT_PRICE_MISMATCH");
    await expect(approveSupplierInvoice(fixture.organization.id, fixture.user.id, invoice.id, metadata))
      .rejects.toBeInstanceOf(InvoiceError);
  });

  it("rejects duplicate invoice numbers within a tenant", async () => {
    const fixture = await createFixture("duplicate");
    const input = invoiceInput(fixture.order._id, fixture.itemId, "INV-DUPLICATE");
    await submitSupplierInvoice(fixture.organization.id, fixture.user.id, input, metadata);

    await expect(submitSupplierInvoice(fixture.organization.id, fixture.user.id, input, metadata))
      .rejects.toMatchObject({ statusCode: 409 });
  });

  it("isolates invoice listings by organization", async () => {
    const first = await createFixture("first");
    const second = await createFixture("second");
    await submitSupplierInvoice(
      first.organization.id, first.user.id,
      invoiceInput(first.order._id, first.itemId, "INV-FIRST"), metadata,
    );
    await submitSupplierInvoice(
      second.organization.id, second.user.id,
      invoiceInput(second.order._id, second.itemId, "INV-SECOND"), metadata,
    );

    const invoices = await listSupplierInvoices(first.organization.id);
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.invoiceNumber).toBe("INV-FIRST");
  });

  it("approves matched invoices and rejects invoices with an audited reason", async () => {
    const fixture = await createFixture("decisions");
    const first = await submitSupplierInvoice(
      fixture.organization.id, fixture.user.id,
      invoiceInput(fixture.order._id, fixture.itemId, "INV-APPROVE"), metadata,
    );
    const approved = await approveSupplierInvoice(fixture.organization.id, fixture.user.id, first.id, metadata);
    expect(approved.status).toBe("approved");

    const second = await submitSupplierInvoice(
      fixture.organization.id, fixture.user.id,
      invoiceInput(fixture.order._id, fixture.itemId, "INV-REJECT"), metadata,
    );
    const rejected = await rejectSupplierInvoice(
      fixture.organization.id, fixture.user.id, second.id, "Supporting receipt requires correction", metadata,
    );
    expect(rejected.status).toBe("rejected");
    expect(rejected.rejectionReason).toBe("Supporting receipt requires correction");
    expect(await AuditEvent.countDocuments({
      organizationId: fixture.organization._id,
      action: { $in: ["supplier_invoice.approved", "supplier_invoice.rejected"] },
    })).toBe(2);
  });

  it("serializes concurrent submissions so cumulative billing cannot exceed the order", async () => {
    const fixture = await createFixture("concurrent");
    const submit = (invoiceNumber: string) => submitSupplierInvoice(fixture.organization.id, fixture.user.id, invoiceInput(fixture.order._id, fixture.itemId, invoiceNumber, {
      items: [{ purchaseOrderItemId: fixture.itemId.toString(), quantity: 6, unitPriceMinor: 4500 }],
    }), metadata);
    const invoices = await Promise.all([submit("INV-CONCURRENT-A"), submit("INV-CONCURRENT-B")]);
    expect(invoices.filter((invoice) => invoice.status === "matched")).toHaveLength(1);
    expect(invoices.filter((invoice) => invoice.status === "needs_review")).toHaveLength(1);
    const review = invoices.find((invoice) => invoice.status === "needs_review");
    expect(review?.matchFindings.map((finding) => finding.code)).toContain("DUPLICATE_BILLING_QUANTITY");
    expect(await SupplierInvoice.countDocuments({ organizationId: fixture.organization._id })).toBe(2);
  });

  it("does not allow one tenant to approve another tenant's invoice", async () => {
    const owner = await createFixture("owner");
    const other = await createFixture("other");
    const invoice = await submitSupplierInvoice(
      owner.organization.id, owner.user.id,
      invoiceInput(owner.order._id, owner.itemId, "INV-TENANT-BOUND"), metadata,
    );

    await expect(approveSupplierInvoice(other.organization.id, other.user.id, invoice.id, metadata))
      .rejects.toMatchObject({ statusCode: 409 });
    expect((await SupplierInvoice.findById(invoice.id))?.status).toBe("matched");
  });
});
