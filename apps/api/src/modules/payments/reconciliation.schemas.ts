import { z } from "zod";
export const importStatementLineSchema = z.object({
 bankAccountLabel: z.string().trim().min(2).max(120),
 transactionId: z.string().trim().min(3).max(160),
 transactionDate: z.string().datetime({ offset: true }),
 amountMinor: z.number().int().positive().max(100000000000),
 currency: z.string().regex(/^[A-Za-z]{3}$/).transform(v => v.toUpperCase()),
 reference: z.string().trim().min(3).max(120),
 description: z.string().trim().max(500).optional(),
}).strict();
export type ImportStatementLineInput = z.infer<typeof importStatementLineSchema>;
