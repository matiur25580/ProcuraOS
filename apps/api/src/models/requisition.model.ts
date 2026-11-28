import { Schema, model } from "mongoose";

const requisitionItemSchema = new Schema({
  description: { type: String, required: true, trim: true, maxlength: 240 },
  quantity: { type: Number, required: true, min: 1, max: 100000 },
  unit: { type: String, required: true, trim: true, maxlength: 30 },
  unitPriceMinor: { type: Number, required: true, min: 0, max: 1000000000 },
}, { _id: true });

const approvalStepSchema = new Schema({
  approverId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  level: { type: Number, required: true, min: 1 },
  status: { type: String, enum: ["pending", "approved", "rejected"], default: "pending" },
  comment: { type: String, default: "" , maxlength: 1000 },
  actedAt: { type: Date, default: null },
}, { _id: false });

const requisitionSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  requesterId: { type: Schema.Types.ObjectId, ref: "User", required: true },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  department: { type: String, required: true, trim: true, maxlength: 100 },
  costCenter: { type: String, required: true, trim: true, maxlength: 80 },
  justification: { type: String, required: true, trim: true, maxlength: 2000 },
  neededBy: { type: Date, required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  items: { type: [requisitionItemSchema], required: true, validate: [(items: unknown[]) => items.length > 0 && items.length <= 30, "A requisition must contain 1–30 items"] },
  totalMinor: { type: Number, required: true, min: 0 },
  status: { type: String, enum: ["draft", "pending_approval", "approved", "rejected", "cancelled"], default: "draft", index: true },
  approverIds: { type: [Schema.Types.ObjectId], ref: "User", default: [] },
  approvals: { type: [approvalStepSchema], default: [] },
  currentApproverId: { type: Schema.Types.ObjectId, ref: "User", default: null },
  submittedAt: { type: Date, default: null },
  decidedAt: { type: Date, default: null },
  rejectionReason: { type: String, default: null, maxlength: 1000 },
  budgetStatus: { type: String, enum: ["not_checked", "within_budget", "over_budget", "unconfigured"], default: "not_checked" },
  budgetId: { type: Schema.Types.ObjectId, ref: "Budget", default: null },
}, { timestamps: true });

requisitionSchema.index({ organizationId: 1, createdAt: -1 });
requisitionSchema.index({ organizationId: 1, status: 1, currentApproverId: 1 });
requisitionSchema.index({ organizationId: 1, requesterId: 1, createdAt: -1 });

export const Requisition = model("Requisition", requisitionSchema);
