import { Schema, model } from "mongoose";
const rfqItemSchema = new Schema({
  description: { type: String, required: true, trim: true, maxlength: 240 },
  quantity: { type: Number, required: true, min: 1, max: 100000 },
  unit: { type: String, required: true, trim: true, maxlength: 30 },
  specification: { type: String, trim: true, maxlength: 1000, default: "" },
}, { _id: true });
const invitationSchema = new Schema({
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  tokenHash: { type: String, required: true, select: false },
  invitedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, required: true },
  status: { type: String, enum: ["invited", "quoted", "declined"], default: "invited" },
}, { _id: false });
const rfqSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  rfqNumber: { type: String, required: true, maxlength: 40 },
  title: { type: String, required: true, trim: true, maxlength: 160 },
  description: { type: String, required: true, trim: true, maxlength: 3000 },
  requisitionId: { type: Schema.Types.ObjectId, ref: "Requisition", default: null },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  submissionDeadline: { type: Date, required: true },
  status: { type: String, enum: ["draft", "open", "closed", "awarded", "cancelled"], default: "draft", index: true },
  items: { type: [rfqItemSchema], required: true, validate: [(items: unknown[]) => items.length > 0 && items.length <= 30, "An RFQ must contain 1–30 items"] },
  supplierIds: { type: [Schema.Types.ObjectId], ref: "Supplier", default: [] },
  invitations: { type: [invitationSchema], default: [] },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
  issuedAt: { type: Date, default: null },
  closedAt: { type: Date, default: null },
}, { timestamps: true });
rfqSchema.index({ organizationId: 1, createdAt: -1 });
rfqSchema.index({ organizationId: 1, status: 1, submissionDeadline: 1 });
rfqSchema.index({ organizationId: 1, rfqNumber: 1 }, { unique: true });
rfqSchema.index({ "invitations.tokenHash": 1 }, { sparse: true });
export const Rfq = model("Rfq", rfqSchema);
