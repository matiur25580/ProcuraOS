import { describe, expect, it } from "vitest";
import { hasPermission } from "./permissions.js";

describe("organization role permissions", () => {
  it("grants owners every permission", () => {
    expect(hasPermission("owner", "finance:approve")).toBe(true);
    expect(hasPermission("owner", "members:manage")).toBe(true);
  });

  it("limits procurement officers to procurement and supplier work", () => {
    expect(hasPermission("procurement_officer", "procurement:write")).toBe(true);
    expect(hasPermission("procurement_officer", "finance:approve")).toBe(false);
    expect(hasPermission("procurement_officer", "members:manage")).toBe(false);
  });

  it("keeps auditors read-only", () => {
    expect(hasPermission("auditor", "audit:read")).toBe(true);
    expect(hasPermission("auditor", "procurement:write")).toBe(false);
  });
  it("restricts member administration to owners and administrators", () => {
    expect(hasPermission("admin", "members:manage")).toBe(true);
    expect(hasPermission("procurement_manager", "members:read")).toBe(true);
    expect(hasPermission("procurement_manager", "members:manage")).toBe(false);
    expect(hasPermission("finance_manager", "members:manage")).toBe(false);
  });

  it("allows audit readers without granting them member administration", () => {
    expect(hasPermission("auditor", "audit:read")).toBe(true);
    expect(hasPermission("auditor", "members:manage")).toBe(false);
  });

});