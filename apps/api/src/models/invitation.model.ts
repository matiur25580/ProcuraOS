import { Schema, model } from "mongoose";
import type { OrganizationRole } from "./membership.model.js";

const invitationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  email: { type: String, required: true, lowercase: true, trim: true, maxlength: 254 },
  role: { type: String, enum: ["admin", "procurement_manager", "procurement_officer", "finance_manager", "auditor"], required: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  invitedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  expiresAt: { type: Date, required: true, index: true },
  status: { type: String, enum: ["pending", "accepted", "revoked"], default: "pending", index: true },
  acceptedAt: { type: Date, default: null },
  revokedAt: { type: Date, default: null },
}, { timestamps: true });

invitationSchema.index({ organizationId: 1, email: 1, status: 1 });
invitationSchema.index({ organizationId: 1, createdAt: -1 });

export const Invitation = model("Invitation", invitationSchema);
