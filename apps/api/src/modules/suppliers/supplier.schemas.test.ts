import { describe, expect, it } from "vitest";
import { createRfqSchema, createSupplierSchema, reviewSupplierSchema, submitQuotationSchema } from "./supplier.schemas.js";
const supplier = { legalName: "Northstar Technology Private Limited", displayName: "Northstar Technology", taxId: "GSTIN-29ABCDE1234F1Z5", contactName: "Asha Rao", email: "asha@example.com", country: "India", categories: ["IT hardware"], documents: [] };
describe("supplier onboarding schemas", () => {
  it("accepts a supplier and rejects a client-supplied tenant", () => {
    expect(createSupplierSchema.safeParse(supplier).success).toBe(true);
    expect(createSupplierSchema.safeParse({ ...supplier, organizationId: "attacker" }).success).toBe(false);
  });
  it("requires a reason for supplier rejection", () => {
    expect(reviewSupplierSchema.safeParse({ status: "rejected" }).success).toBe(false);
    expect(reviewSupplierSchema.safeParse({ status: "rejected", rejectionReason: "Missing tax certificate" }).success).toBe(true);
    expect(reviewSupplierSchema.safeParse({ status: "approved" }).success).toBe(true);
  });
  it("requires supplier and item selections for RFQs", () => {
    const valid = { title: "Laptop supply RFQ", description: "Quote for standard business laptops.", currency: "INR", submissionDeadline: "2027-01-01T00:00:00.000Z", supplierIds: ["507f1f77bcf86cd799439011"], items: [{ description: "Laptop", quantity: 10, unit: "each" }] };
    expect(createRfqSchema.safeParse(valid).success).toBe(true);
    expect(createRfqSchema.safeParse({ ...valid, supplierIds: [] }).success).toBe(false);
  });
  it("rejects unsafe quote amounts and tenant identifiers", () => {
    const valid = { token: "a".repeat(40), validUntil: "2027-02-01T00:00:00.000Z", deliveryDays: 10, items: [{ rfqItemId: "507f1f77bcf86cd799439011", unitPriceMinor: 10000, leadTimeDays: 5 }] };
    expect(submitQuotationSchema.safeParse(valid).success).toBe(true);
    expect(submitQuotationSchema.safeParse({ ...valid, organizationId: "attacker" }).success).toBe(false);
    expect(submitQuotationSchema.safeParse({ ...valid, items: [{ ...valid.items[0], unitPriceMinor: -1 }] }).success).toBe(false);
  });
});
