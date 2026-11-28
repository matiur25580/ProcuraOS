import { Schema, model } from "mongoose";

const accountTokenSchema = new Schema({
  userId: { type: Schema.Types.ObjectId, ref: "User", required: true, index: true },
  purpose: { type: String, enum: ["email_verification", "password_reset"], required: true, index: true },
  tokenHash: { type: String, required: true, unique: true, select: false },
  expiresAt: { type: Date, required: true, index: { expires: 0 } },
  consumedAt: { type: Date, default: null },
}, { timestamps: true });

accountTokenSchema.index({ userId: 1, purpose: 1, consumedAt: 1 });
export const AccountToken = model("AccountToken", accountTokenSchema);
