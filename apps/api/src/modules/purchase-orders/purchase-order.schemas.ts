import { z } from "zod";
export const createPurchaseOrderSchema = z.object({ rfqId: z.string().regex(/^[a-f\\d]{24}$/i), quotationId: z.string().regex(/^[a-f\\d]{24}$/i) }).strict();
export const receiveGoodsSchema = z.object({ notes: z.string().trim().max(2000).optional().default(""), items: z.array(z.object({
  orderItemId: z.string().regex(/^[a-f\\d]{24}$/i), quantity: z.number().int().min(1).max(100000), notes: z.string().trim().max(500).optional().default(""),
}).strict()).min(1).max(30) }).strict();
export const amendPurchaseOrderSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export type CreatePurchaseOrderInput = z.infer<typeof createPurchaseOrderSchema>;
export type ReceiveGoodsInput = z.infer<typeof receiveGoodsSchema>;
