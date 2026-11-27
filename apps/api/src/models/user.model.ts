import { Schema, model, type InferSchemaType } from "mongoose";

const userSchema = new Schema({
  name: { type: String, required: true, trim: true, minlength: 2, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  passwordHash: { type: String, required: true, select: false },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  emailVerifiedAt: { type: Date, default: null },
  mfaEnabled: { type: Boolean, default: false, index: true },
  mfaLastUsedCounter: { type: Number, default: -1, select: false },
  mfaSecretEncrypted: { type: String, default: null, select: false },
  mfaPendingSecretEncrypted: { type: String, default: null, select: false },
  mfaRecoveryCodeHashes: { type: [String], default: [], select: false },
  lastLoginAt: { type: Date },
}, { timestamps: true });

export type UserDocument = InferSchemaType<typeof userSchema>;
export const User = model("User", userSchema);
