import { describe, expect, it } from "vitest";
import { createPurchaseOrderSchema, receiveGoodsSchema, amendPurchaseOrderSchema } from "./purchase-order.schemas.js";
const id = "507f1f77bcf86cd799439011";
describe("purchase order input schemas", () => {
  it("requires both an RFQ and quotation identifier", () => {
    expect(createPurchaseOrderSchema.safeParse({ rfqId: id, quotationId: id }).success).toBe(true);
    expect(createPurchaseOrderSchema.safeParse({ rfqId: id }).success).toBe(false);
  });
  it("rejects fractional and zero receipt quantities", () => {
    expect(receiveGoodsSchema.safeParse({ items: [{ orderItemId: id, quantity: 1 }] }).success).toBe(true);
    expect(receiveGoodsSchema.safeParse({ items: [{ orderItemId: id, quantity: 0 }] }).success).toBe(false);
    expect(receiveGoodsSchema.safeParse({ items: [{ orderItemId: id, quantity: 1.5 }] }).success).toBe(false);
  });
  it("requires a meaningful revision reason", () => {
    expect(amendPurchaseOrderSchema.safeParse({ reason: "Supplier lead time changed" }).success).toBe(true);
    expect(amendPurchaseOrderSchema.safeParse({ reason: "no" }).success).toBe(false);
  });
});
