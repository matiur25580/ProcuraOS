import { Schema, model } from "mongoose";

export const ROLE_PERMISSIONS = {
  owner: ["*"],
  admin: ["organization:read", "organization:update", "members:read", "members:manage", "procurement:read", "procurement:write", "suppliers:read", "suppliers:write", "finance:read", "finance:approve", "finance:pay", "audit:read"],
  procurement_manager: ["organization:read", "members:read", "procurement:read", "procurement:write", "suppliers:read", "suppliers:write", "finance:read", "audit:read"],
  procurement_officer: ["organization:read", "procurement:read", "procurement:write", "suppliers:read", "suppliers:write"],
  finance_manager: ["organization:read", "procurement:read", "finance:read", "finance:approve", "finance:pay", "audit:read"],
  auditor: ["organization:read", "procurement:read", "suppliers:read", "finance:read", "audit:read"],
} as const;

export type OrganizationRole = keyof typeof ROLE_PERMISSIONS;
export type Permission = (typeof ROLE_PERMISSIONS)[OrganizationRole][number];

const membershipSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  role: { type: String, enum: ["owner", "admin", "procurement_manager", "procurement_officer", "finance_manager", "auditor"], required: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
}, { timestamps: true });

membershipSchema.index({ userId: 1, organizationId: 1 }, { unique: true });
membershipSchema.index({ organizationId: 1, status: 1, role: 1 });

export const Membership = model("Membership", membershipSchema);
