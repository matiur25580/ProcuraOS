import { Schema, model } from "mongoose";

const budgetSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true },
  costCenter: { type: String, required: true, trim: true, maxlength: 80 },
  fiscalYear: { type: Number, required: true, min: 2000, max: 2200 },
  currency: { type: String, required: true, uppercase: true, minlength: 3, maxlength: 3 },
  limitMinor: { type: Number, required: true, min: 0, max: 1000000000000 },
  committedMinor: { type: Number, default: 0, min: 0 },
  active: { type: Boolean, default: true },
}, { timestamps: true });

budgetSchema.index({ organizationId: 1, costCenter: 1, fiscalYear: 1 }, { unique: true });
export const Budget = model("Budget", budgetSchema);
