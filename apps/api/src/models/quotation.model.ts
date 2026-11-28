import { Schema, model } from "mongoose";
const quotationItemSchema = new Schema({
  rfqItemId: { type: Schema.Types.ObjectId, required: true },
  unitPriceMinor: { type: Number, required: true, min: 0, max: 1000000000 },
  leadTimeDays: { type: Number, required: true, min: 0, max: 3650 },
  notes: { type: String, trim: true, maxlength: 500, default: "" },
}, { _id: false });
const quotationSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  rfqId: { type: Schema.Types.ObjectId, ref: "Rfq", required: true },
  supplierId: { type: Schema.Types.ObjectId, ref: "Supplier", required: true },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  items: { type: [quotationItemSchema], required: true },
  totalMinor: { type: Number, required: true, min: 0 },
  validUntil: { type: Date, required: true },
  deliveryDays: { type: Number, required: true, min: 0, max: 3650 },
  notes: { type: String, trim: true, maxlength: 2000, default: "" },
  status: { type: String, enum: ["submitted", "shortlisted", "awarded", "rejected"], default: "submitted", index: true },
  submittedAt: { type: Date, default: Date.now },
}, { timestamps: true });
quotationSchema.index({ organizationId: 1, rfqId: 1, supplierId: 1 }, { unique: true });
quotationSchema.index({ organizationId: 1, rfqId: 1, status: 1, totalMinor: 1 });
export const Quotation = model("Quotation", quotationSchema);
