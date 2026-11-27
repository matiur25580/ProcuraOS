import { z } from "zod";
const objectId = z.string().regex(/^[a-f\\d]{24}$/i);
export const submitInvoiceSchema = z.object({
 invoiceNumber: z.string().trim().min(1).max(80), purchaseOrderId: objectId,
 invoiceDate: z.string().datetime({ offset: true }), dueDate: z.string().datetime({ offset: true }).optional(),
 taxMinor: z.number().int().min(0).max(100000000000), notes: z.string().trim().max(2000).optional().default(""),
 items: z.array(z.object({ purchaseOrderItemId: objectId, quantity: z.number().int().min(1).max(100000), unitPriceMinor: z.number().int().min(0).max(1000000000) }).strict()).min(1).max(30),
}).strict();
export const rejectInvoiceSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export type SubmitInvoiceInput = z.infer<typeof submitInvoiceSchema>;
