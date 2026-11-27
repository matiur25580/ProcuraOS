import { Schema, model } from "mongoose";

const auditEventSchema = new Schema({
  organizationId: { type: Schema.Types.ObjectId, ref: "Organization", default: null, index: true },
  actorUserId: { type: Schema.Types.ObjectId, ref: "User", default: null, index: true },
  action: { type: String, required: true, maxlength: 100 },
  targetType: { type: String, required: true, maxlength: 80 },
  outcome: { type: String, enum: ["success", "failure"], default: "success", index: true },
  targetId: { type: String, default: null, maxlength: 100 },
  metadata: { type: Schema.Types.Mixed, default: {} },
  ipAddress: { type: String, maxlength: 64 },
  userAgent: { type: String, maxlength: 500 },
}, { timestamps: true });

auditEventSchema.index({ organizationId: 1, createdAt: -1, _id: -1 });
auditEventSchema.index({ organizationId: 1, actorUserId: 1, createdAt: -1 });

export const AuditEvent = model("AuditEvent", auditEventSchema);
