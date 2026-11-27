import { Schema, model } from "mongoose";
const line = new Schema({ purchaseOrderItemId: { type: Schema.Types.ObjectId, required: true }, description: { type: String, required: true, trim: true, maxlength: 240 }, quantity: { type: Number, required: true, min: 1, max: 100000 }, unitPriceMinor: { type: Number, required: true, min: 0, max: 1000000000 }, lineTotalMinor: { type: Number, required: true, min: 0 } }, { _id: false });
const finding = new Schema({ code: { type: String, required: true, maxlength: 60 }, message: { type: String, required: true, maxlength: 500 }, purchaseOrderItemId: { type: Schema.Types.ObjectId, default: null }, expectedMinor: { type: Number, default: null }, actualMinor: { type: Number, default: null } }, { _id: false });
const schema = new Schema({
 organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
 invoiceNumber: { type: String, required: true, trim: true, maxlength: 80 },
 supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
 purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
 purchaseOrderNumber: { type: String, required: true, maxlength: 50 },
 currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
 invoiceDate: { type: Date, required: true }, dueDate: { type: Date, default: null },
 items: { type: [line], required: true, validate: [(v: unknown[]) => v.length > 0 && v.length <= 30, "An invoice must contain 1–30 lines"] },
 subtotalMinor: { type: Number, required: true, min: 0 }, taxMinor: { type: Number, required: true, min: 0, default: 0 }, totalMinor: { type: Number, required: true, min: 0 },
 // Incremented transactionally to serialize concurrent payment-allocation requests.
 paymentAllocationVersion: { type: Number, required: true, default: 0, min: 0 },
 status: { type: String, enum: ["needs_review", "matched", "approved", "rejected"], default: "needs_review", index: true },
 matchFindings: { type: [finding], default: [] }, notes: { type: String, trim: true, maxlength: 2000, default: "" },
 submittedBy: { type: Schema.Types.ObjectId, ref: "User", required: true }, submittedAt: { type: Date, default: Date.now },
 reviewedBy: { type: Schema.Types.ObjectId, ref: "User", default: null }, reviewedAt: { type: Date, default: null },
 rejectionReason: { type: String, trim: true, maxlength: 1000, default: "" },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ organizationId: 1, invoiceNumber: 1 }, { unique: true });
schema.index({ organizationId: 1, status: 1, createdAt: -1 });
schema.index({ organizationId: 1, purchaseOrderId: 1, createdAt: -1 });
export const SupplierInvoice = model("SupplierInvoice", schema);
