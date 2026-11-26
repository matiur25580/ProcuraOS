import { describe, expect, it } from "vitest";
import {
  acceptInvitationSchema, createInvitationSchema, updateMemberSchema, updateOrganizationSchema,
} from "./organization.schemas.js";

describe("organization administration input schemas", () => {
  it("allows only assignable non-owner roles in invitations", () => {
    expect(createInvitationSchema.safeParse({ email: "teammate@example.com", role: "procurement_officer" }).success).toBe(true);
    expect(createInvitationSchema.safeParse({ email: "owner@example.com", role: "owner" }).success).toBe(false);
  });

  it("rejects malformed invitation emails and unknown fields", () => {
    expect(createInvitationSchema.safeParse({ email: "not-an-email", role: "auditor" }).success).toBe(false);
    expect(createInvitationSchema.safeParse({ email: "teammate@example.com", role: "auditor", organizationId: "attacker" }).success).toBe(false);
  });

  it("requires at least one valid member change", () => {
    expect(updateMemberSchema.safeParse({}).success).toBe(false);
    expect(updateMemberSchema.safeParse({ role: "owner" }).success).toBe(false);
    expect(updateMemberSchema.safeParse({ status: "suspended" }).success).toBe(true);
  });

  it("validates organization names and invitation tokens", () => {
    expect(updateOrganizationSchema.safeParse({ name: "Acme Procurement" }).success).toBe(true);
    expect(updateOrganizationSchema.safeParse({ name: "x" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "short" }).success).toBe(false);
    expect(acceptInvitationSchema.safeParse({ token: "a".repeat(43) }).success).toBe(true);
  });
});
