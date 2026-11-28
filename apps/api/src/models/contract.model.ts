import { Schema, model } from "mongoose";

const obligationSchema = new Schema({
  title: { type: String, required: true, trim: true, maxlength: 180 },
  description: { type: String, trim: true, maxlength: 1000, default: "" },
  dueAt: { type: Date, required: true },
  ownerUserId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  status: { type: String, enum: ["open", "completed", "waived"], default: "open" },
  completedAt: { type: Date, default: null },
  completedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  resolutionNote: { type: String, trim: true, maxlength: 1000, default: "" }
}, { _id: true });

const contractSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  contractNumber: { type: String, required: true, trim: true, uppercase: true, maxlength: 48 },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", default: null },
  title: { type: String, required: true, trim: true, maxlength: 180 },
  contractType: { type: String, enum: ["master_services", "statement_of_work", "software_license", "supply", "consulting", "non_disclosure", "other"], required: true },
  scope: { type: String, required: true, trim: true, maxlength: 5000 },
  startDate: { type: Date, required: true },
  endDate: { type: Date, required: true },
  valueMinor: { type: Number, required: true, min: 0, max: Number.MAX_SAFE_INTEGER },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  autoRenew: { type: Boolean, default: false },
  renewalNoticeDays: { type: Number, min: 0, max: 730, default: 30 },
  ownerUserId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  obligations: { type: [obligationSchema], default: [] },
  status: { type: String, enum: ["draft", "pending_approval", "approved", "active", "rejected", "terminated"], default: "draft", index: true },
  rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
  terminationReason: { type: String, trim: true, maxlength: 1000, default: "" },
  submittedAt: { type: Date, default: null },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
  approvedAt: { type: Date, default: null },
  activatedAt: { type: Date, default: null },
  terminatedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  updatedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }
}, { timestamps: true, optimisticConcurrency: true });

contractSchema.index({ organizationId: 1, contractNumber: 1 }, { unique: true });
contractSchema.index({ organizationId: 1, supplierId: 1, status: 1, endDate: 1 });
contractSchema.index({ organizationId: 1, status: 1, endDate: 1 });
contractSchema.index({ organizationId: 1, ownerUserId: 1, status: 1 });
contractSchema.index({ organizationId: 1, "obligations.status": 1, "obligations.dueAt": 1 });

export const Contract = model("Contract", contractSchema);
