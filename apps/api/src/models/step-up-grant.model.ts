import { Schema, model } from "mongoose";

const stepUpGrantSchema = new Schema({
  tokenHash: { type: String, required: true, unique: true, select: false },
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", required: true, index: true },
  sessionFamilyId: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

stepUpGrantSchema.index({ userId: 1, organizationId: 1, expiresAt: 1 });

export const StepUpGrant = model("StepUpGrant", stepUpGrantSchema);
