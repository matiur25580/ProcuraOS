import { Schema, model } from "mongoose";
const orderItemSchema = new Schema({
  rfqItemId: { type: Schema.Types.ObjectId, required: true }, description: { type: String, required: true, trim: true, maxlength: 240 },
  quantity: { type: Number, required: true, min: 1, max: 100000 }, unit: { type: String, required: true, trim: true, maxlength: 30 },
  unitPriceMinor: { type: Number, required: true, min: 0, max: 1000000000 }, receivedQuantity: { type: Number, required: true, min: 0, default: 0 },
}, { _id: true });
const receiptItemSchema = new Schema({ orderItemId: { type: Schema.Types.ObjectId, required: true }, quantity: { type: Number, required: true, min: 1, max: 100000 }, notes: { type: String, trim: true, maxlength: 500, default: "" } }, { _id: false });
const receiptSchema = new Schema({ receiptNumber: { type: String, required: true, maxlength: 50 }, items: { type: [receiptItemSchema], required: true }, receivedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, receivedAt: { type: Date, default: Date.now }, notes: { type: String, trim: true, maxlength: 2000, default: "" } }, { _id: true });
const revisionSchema = new Schema({ revision: { type: Number, required: true, min: 1 }, reason: { type: String, required: true, trim: true, maxlength: 1000 }, changedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, changedAt: { type: Date, default: Date.now }, snapshot: { type: Schema.Types.Mixed, required: true } }, { _id: false });
const purchaseOrderSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true }, poNumber: { type: String, required: true, maxlength: 50 },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true }, rfqId: { type: Schema.Types.ObjectId, ref: "Rfq", required: true },
  quotationId: { type: Schema.Types.ObjectId, ref: "Quotation", required: true }, requisitionId: { type: Schema.Types.ObjectId, ref: "Requisition", default: null },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  items: { type: [orderItemSchema], required: true, validate: [(items: unknown[]) => items.length > 0 && items.length <= 30, "A purchase order must contain 1–30 items"] },
  totalMinor: { type: Number, required: true, min: 0 }, status: { type: String, enum: ["pending_approval", "approved", "issued", "partially_received", "received", "cancelled"], default: "pending_approval", index: true },
  revision: { type: Number, required: true, default: 1 }, revisions: { type: [revisionSchema], default: [] }, receipts: { type: [receiptSchema], default: [] },
  approvedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, approvedAt: { type: Date, default: null },
  issuedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, issuedAt: { type: Date, default: null },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true, optimisticConcurrency: true });
purchaseOrderSchema.index({ organizationId: 1, poNumber: 1 }, { unique: true });
purchaseOrderSchema.index({ organizationId: 1, quotationId: 1 }, { unique: true });
purchaseOrderSchema.index({ organizationId: 1, status: 1, createdAt: -1 });
purchaseOrderSchema.index({ organizationId: 1, supplierId: 1, createdAt: -1 });
export const PurchaseOrder = model("PurchaseOrder", purchaseOrderSchema);
