import { z } from "zod";

const itemSchema = z.object({
  description: z.string().trim().min(2).max(240),
  quantity: z.number().int().min(1).max(100000),
  unit: z.string().trim().min(1).max(30),
  unitPriceMinor: z.number().int().min(0).max(1000000000),
}).strict();

export const createRequisitionSchema = z.object({
  title: z.string().trim().min(3).max(160),
  department: z.string().trim().min(2).max(100),
  costCenter: z.string().trim().min(2).max(80),
  justification: z.string().trim().min(10).max(2000),
  neededBy: z.string().datetime(),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  items: z.array(itemSchema).min(1).max(30),
  approverIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(5),
}).strict();

export const updateRequisitionSchema = createRequisitionSchema.partial().strict().refine((value) => Object.keys(value).length > 0, {
  message: "Provide at least one field to update",
});

export const decisionSchema = z.object({
  comment: z.string().trim().max(1000).optional().default(""),
}).strict();

export const rejectionSchema = z.object({
  reason: z.string().trim().min(5).max(1000),
}).strict();

export const budgetSchema = z.object({
  fiscalYear: z.number().int().min(2000).max(2200),
  currency: z.string().regex(/^[A-Za-z]{3}$/),
  limitMinor: z.number().int().min(0).max(1000000000000),
}).strict();

export type CreateRequisitionInput = z.infer<typeof createRequisitionSchema>;
export type UpdateRequisitionInput = z.infer<typeof updateRequisitionSchema>;
