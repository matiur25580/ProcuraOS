import { describe, expect, it } from "vitest";
import {
  createContractSchema, listContractsSchema, obligationUpdateSchema, reviewContractSchema
} from "./contract.schemas.js";

const valid = {
  supplierId: "507f1f77bcf86cd799439011",
  title: "Enterprise cloud hosting agreement",
  contractType: "master_services",
  scope: "Hosting, support and managed infrastructure services.",
  startDate: "2027-01-01T00:00:00.000Z",
  endDate: "2027-12-31T23:59:59.000Z",
  valueMinor: 12500000,
  currency: "USD",
  ownerUserId: "507f1f77bcf86cd799439012"
};

describe("contract schemas", () => {
  it("accepts a valid contract and normalizes currency", () => {
    expect(createContractSchema.parse({ ...valid, currency: "usd" }).currency).toBe("USD");
  });
  it("rejects end dates before start dates", () => {
    expect(createContractSchema.safeParse({ ...valid, endDate: "2026-12-01T00:00:00.000Z" }).success).toBe(false);
  });
  it("rejects obligations that extend beyond the contract term", () => {
    expect(createContractSchema.safeParse({ ...valid, obligations: [{ title: "Annual security review", dueAt: "2028-01-01T00:00:00.000Z" }] }).success).toBe(false);
  });
  it("requires a reason when rejecting a contract", () => {
    expect(reviewContractSchema.safeParse({ decision: "reject" }).success).toBe(false);
    expect(reviewContractSchema.safeParse({ decision: "reject", reason: "Commercial terms are incomplete" }).success).toBe(true);
  });
  it("requires a reason to waive a contractual obligation", () => {
    expect(obligationUpdateSchema.safeParse({ status: "waived" }).success).toBe(false);
    expect(obligationUpdateSchema.safeParse({ status: "waived", resolutionNote: "No longer applicable" }).success).toBe(true);
  });
  it("bounds list pagination and filter values", () => {
    expect(listContractsSchema.parse({ page: "2", limit: "50" }).page).toBe(2);
    expect(listContractsSchema.safeParse({ limit: "500" }).success).toBe(false);
  });
});
