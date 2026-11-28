import { Schema, model } from "mongoose";
const schema = new Schema({
 organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
 bankAccountLabel: { type: String, required: true, trim: true, maxlength: 120 },
 transactionId: { type: String, required: true, trim: true, maxlength: 160 },
 transactionDate: { type: Date, required: true },
 amountMinor: { type: Number, required: true, min: 1 },
 currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
 reference: { type: String, required: true, trim: true, maxlength: 120 },
 description: { type: String, trim: true, maxlength: 500, default: "" },
 status: { type: String, enum: ["unmatched", "matched"], default: "unmatched", index: true },
 matchedPaymentId: { type: Schema.Types.ObjectId, ref: "SupplierPayment", default: null },
 importedBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
 matchedBy: { type: Schema.Types.ObjectId, ref: "User", default: null },
 matchedAt: { type: Date, default: null },
}, { timestamps: true, optimisticConcurrency: true });
schema.index({ organizationId: 1, transactionId: 1 }, { unique: true });
schema.index({ organizationId: 1, status: 1, transactionDate: -1 });
schema.index({ organizationId: 1, matchedPaymentId: 1 }, { unique: true, partialFilterExpression: { matchedPaymentId: { $type: "objectId" } } });
export const BankStatementLine = model("BankStatementLine", schema);
