import { Schema, model } from "mongoose";

const schema = new Schema({
 organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
 invoiceId: { type: Schema.Types.ObjectId, ref: "SupplierInvoice", required: true },
 invoiceNumber: { type: String, required: true, maxlength: 80 },
 supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
 purchaseOrderId: { type: Schema.Types.ObjectId, ref: "PurchaseOrder", required: true },
 currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
 amountMinor: { type: Number, required: true, min: 1, max: Number.MAX_SAFE_INTEGER },
 idempotencyKey: { type: String, required: true, trim: true, minlength: 8, maxlength: 120 },
 dueDate: { type: Date, default: null },
 status: { type: String, enum: ["scheduled", "paid", "failed", "cancelled"], default: "scheduled", index: true },
 paymentMethod: { type: String, enum: ["bank_transfer", "cash", "card", "other"], required: true },
 externalReference: { type: String, trim: true, maxlength: 120, default: "" },
 scheduledAt: { type: Date, default: Date.now },
 paidAt: { type: Date, default: null },
 recordedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
 settledBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
 failureReason: { type: String, trim: true, maxlength: 500, default: "" },
}, { timestamps: true, optimisticConcurrency: true });

// Multiple allocations per invoice are valid; retries are deduplicated per tenant.
schema.index({ organizationId: 1, invoiceId: 1 });
schema.index({ organizationId: 1, idempotencyKey: 1 }, {
 unique: true,
 partialFilterExpression: { idempotencyKey: { $type: "string" } },
});
schema.index({ organizationId: 1, status: 1, dueDate: 1 });
schema.index({ organizationId: 1, supplierId: 1, createdAt: -1 });
export const SupplierPayment = model("SupplierPayment", schema);
