import { describe, expect, it } from "vitest";
import { budgetSchema, createRequisitionSchema, rejectionSchema } from "./requisition.schemas.js";

const valid = {
  title: "New engineering laptops",
  department: "Engineering",
  costCenter: "ENG-OPS",
  justification: "Replace aging devices used by the platform team.",
  neededBy: "2027-01-15T00:00:00.000Z",
  currency: "USD",
  items: [{ description: "Developer laptop", quantity: 2, unit: "each", unitPriceMinor: 125000 }],
  approverIds: ["507f1f77bcf86cd799439011"],
};

describe("requisition input schemas", () => {
  it("accepts a valid requisition and rejects client tenant identifiers", () => {
    expect(createRequisitionSchema.safeParse(valid).success).toBe(true);
    expect(createRequisitionSchema.safeParse({ ...valid, organizationId: "attacker" }).success).toBe(false);
  });
  it("rejects empty items, unsafe amounts and duplicate-free approval chain requirements", () => {
    expect(createRequisitionSchema.safeParse({ ...valid, items: [] }).success).toBe(false);
    expect(createRequisitionSchema.safeParse({ ...valid, items: [{ ...valid.items[0], unitPriceMinor: 1.5 }] }).success).toBe(false);
  });
  it("requires a meaningful rejection reason", () => {
    expect(rejectionSchema.safeParse({ reason: "No" }).success).toBe(false);
    expect(rejectionSchema.safeParse({ reason: "Budget is not available" }).success).toBe(true);
  });
  it("validates bounded budget configuration", () => {
    expect(budgetSchema.safeParse({ fiscalYear: 2027, currency: "USD", limitMinor: 100000 }).success).toBe(true);
    expect(budgetSchema.safeParse({ fiscalYear: 1800, currency: "US", limitMinor: -1 }).success).toBe(false);
  });
});
