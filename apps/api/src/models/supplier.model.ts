import { Schema, model } from "mongoose";
const documentSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 160 },
  type: { type: String, enum: ["tax_certificate", "business_registration", "insurance", "bank_letter", "security", "other"], required: true },
  referenceUrl: { type: String, required: true, maxlength: 2048 },
  expiresAt: { type: Date, default: null },
  status: { type: String, enum: ["pending", "verified", "expired", "rejected"], default: "pending" },
}, { _id: true });
const supplierSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  legalName: { type: String, required: true, trim: true, maxlength: 180 },
  displayName: { type: String, required: true, trim: true, maxlength: 120 },
  taxId: { type: String, required: true, trim: true, uppercase: true, maxlength: 80 },
  registrationNumber: { type: String, trim: true, maxlength: 100, default: "" },
  contactName: { type: String, required: true, trim: true, maxlength: 120 },
  email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
  phone: { type: String, trim: true, maxlength: 40, default: "" },
  country: { type: String, required: true, trim: true, maxlength: 80 },
  website: { type: String, trim: true, maxlength: 2048, default: "" },
  categories: { type: [String], default: [] },
  documents: { type: [documentSchema], default: [] },
  status: { type: String, enum: ["pending_review", "approved", "rejected", "suspended"], default: "pending_review", index: true },
  riskLevel: { type: String, enum: ["low", "medium", "high", "unassessed"], default: "unassessed" },
  notes: { type: String, maxlength: 2000, default: "" },
  rejectionReason: { type: String, maxlength: 1000, default: "" },
  reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  reviewedAt: { type: Date, default: null },
}, { timestamps: true });
supplierSchema.index({ organizationId: 1, createdAt: -1 });
supplierSchema.index({ organizationId: 1, taxId: 1 }, { unique: true });
supplierSchema.index({ organizationId: 1, status: 1, displayName: 1 });
supplierSchema.index({ organizationId: 1, email: 1 });
export const Supplier = model("Supplier", supplierSchema);
