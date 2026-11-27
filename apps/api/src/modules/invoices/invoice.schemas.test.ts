import { describe, expect, it } from "vitest";
import { rejectInvoiceSchema, submitInvoiceSchema } from "./invoice.schemas.js";
const id = "507f1f77bcf86cd799439011";
const valid = { invoiceNumber: "INV-2026-001", purchaseOrderId: id, invoiceDate: "2026-11-27T00:00:00.000Z", taxMinor: 1800, items: [{ purchaseOrderItemId: id, quantity: 2, unitPriceMinor: 4500 }] };
describe("supplier invoice schemas", () => {
 it("accepts a well-formed invoice using integer minor units", () => { expect(submitInvoiceSchema.safeParse(valid).success).toBe(true); });
 it("rejects fractional amounts, zero quantities and unknown fields", () => {
  expect(submitInvoiceSchema.safeParse({ ...valid, taxMinor: 1.5 }).success).toBe(false);
  expect(submitInvoiceSchema.safeParse({ ...valid, items: [{ ...valid.items[0], quantity: 0 }] }).success).toBe(false);
  expect(submitInvoiceSchema.safeParse({ ...valid, organizationId: id }).success).toBe(false);
 });
 it("requires a meaningful rejection reason", () => {
  expect(rejectInvoiceSchema.safeParse({ reason: "Incorrect billed quantity" }).success).toBe(true);
  expect(rejectInvoiceSchema.safeParse({ reason: "bad" }).success).toBe(false);
 });
});
