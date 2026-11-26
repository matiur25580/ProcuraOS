import { Schema, model } from "mongoose";

const organizationSchema = new Schema({
  name: { type: String, required: true, trim: true, maxlength: 140 },
  slug: { type: String, required: true, lowercase: true, trim: true, unique: true, index: true },
  status: { type: String, enum: ["active", "suspended"], default: "active", index: true },
  createdBy: { type: Schema.Types.ObjectId, ref: "User", required: true },
}, { timestamps: true });

export const Organization = model("Organization", organizationSchema);
