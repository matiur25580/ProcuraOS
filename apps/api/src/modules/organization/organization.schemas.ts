import { z } from "zod";

export const updateOrganizationSchema = z.object({
  name: z.string().trim().min(2).max(140),
}).strict();

export const createInvitationSchema = z.object({
  email: z.string().trim().email().max(254),
  role: z.enum(["admin", "procurement_manager", "procurement_officer", "finance_manager", "auditor"]),
}).strict();

export const acceptInvitationSchema = z.object({
  token: z.string().min(32).max(128),
}).strict();

export const updateMemberSchema = z.object({
  role: z.enum(["admin", "procurement_manager", "procurement_officer", "finance_manager", "auditor"]).optional(),
  status: z.enum(["active", "suspended"]).optional(),
}).strict().refine((value) => value.role !== undefined || value.status !== undefined, {
  message: "Provide a role or status change",
});

export type CreateInvitationInput = z.infer<typeof createInvitationSchema>;
export type UpdateMemberInput = z.infer<typeof updateMemberSchema>;
