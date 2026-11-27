import { z } from "zod";
const objectId = z.string().regex(/^[a-f\d]{24}$/i);
export const schedulePaymentSchema = z.object({
 invoiceId: objectId,
 paymentMethod: z.enum(["bank_transfer", "cash", "card", "other"]),
 dueDate: z.string().datetime({ offset: true }).optional(),
}).strict();
export const settlePaymentSchema = z.object({
 externalReference: z.string().trim().min(3).max(120),
 paidAt: z.string().datetime({ offset: true }).optional(),
}).strict();
export const failPaymentSchema = z.object({
 reason: z.string().trim().min(5).max(500),
}).strict();
export type SchedulePaymentInput = z.infer<typeof schedulePaymentSchema>;
