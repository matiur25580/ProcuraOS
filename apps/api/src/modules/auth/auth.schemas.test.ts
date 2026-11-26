import { describe, expect, it } from "vitest";
import { loginSchema, registerSchema } from "./auth.schemas.js";

describe("authentication input schemas", () => {
  it("rejects weak registration passwords", () => {
    expect(registerSchema.safeParse({
      name: "Test User", email: "test@example.com", password: "weakpass",
      organizationName: "Example Co",
    }).success).toBe(false);
  });

  it("accepts a valid registration payload", () => {
    expect(registerSchema.safeParse({
      name: "Test User", email: "test@example.com", password: "StrongPass123",
      organizationName: "Example Co",
    }).success).toBe(true);
  });

  it("rejects unknown login properties", () => {
    expect(loginSchema.safeParse({
      email: "test@example.com", password: "StrongPass123", organizationId: "attacker-controlled",
    }).success).toBe(false);
  });
});
