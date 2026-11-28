import { z } from "zod";

const objectId = z.string().regex(/^[a-f\d]{24}$/i, "A valid identifier is required.");
const dateTime = z.string().datetime({ offset: true });
const obligationSchema = z.object({
  title: z.string().trim().min(3).max(180),
  description: z.string().trim().max(1000).optional().default(""),
  dueAt: dateTime,
  ownerUserId: objectId.optional()
}).strict();

export const createContractSchema = z.object({
  supplierId: objectId,
  purchaseOrderId: objectId.optional(),
  title: z.string().trim().min(3).max(180),
  contractType: z.enum(["master_services", "statement_of_work", "software_license", "supply", "consulting", "non_disclosure", "other"]),
  scope: z.string().trim().min(10).max(5000),
  startDate: dateTime,
  endDate: dateTime,
  valueMinor: z.number().int().min(0).max(Number.MAX_SAFE_INTEGER),
  currency: z.string().regex(/^[A-Za-z]{3}$/).transform(value => value.toUpperCase()),
  autoRenew: z.boolean().optional().default(false),
  renewalNoticeDays: z.number().int().min(0).max(730).optional().default(30),
  ownerUserId: objectId,
  obligations: z.array(obligationSchema).max(100).optional().default([])
}).strict().superRefine((value, ctx) => {
  if (Date.parse(value.endDate) <= Date.parse(value.startDate)) {
    ctx.addIssue({ code: "custom", path: ["endDate"], message: "Contract end date must be after its start date." });
  }
  if (value.obligations.some(item => Date.parse(item.dueAt) > Date.parse(value.endDate) || Date.parse(item.dueAt) < Date.parse(value.startDate))) {
    ctx.addIssue({ code: "custom", path: ["obligations"], message: "Obligation due dates must fall within the contract effective dates." });
  }
});
export const contractIdSchema = objectId;
export const listContractsSchema = z.object({
  page: z.coerce.number().int().min(1).max(100000).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(25),
  status: z.enum(["draft", "pending_approval", "approved", "active", "rejected", "terminated", "expired"]).optional(),
  supplierId: objectId.optional(),
  expiresBefore: dateTime.optional(),
  search: z.string().trim().max(100).optional(),
  sortBy: z.enum(["createdAt", "updatedAt", "startDate", "endDate", "valueMinor"]).default("endDate"),
  sortOrder: z.enum(["asc", "desc"]).default("asc")
}).strict();
export const reviewContractSchema = z.object({
  decision: z.enum(["approve", "reject"]),
  reason: z.string().trim().max(1000).optional().default("")
}).strict().superRefine((value, ctx) => {
  if (value.decision === "reject" && value.reason.length < 5) {
    ctx.addIssue({ code: "custom", path: ["reason"], message: "A rejection reason of at least five characters is required." });
  }
});
export const terminateContractSchema = z.object({ reason: z.string().trim().min(5).max(1000) }).strict();
export const obligationUpdateSchema = z.object({
  status: z.enum(["completed", "waived"]),
  resolutionNote: z.string().trim().max(1000).optional().default("")
}).strict().superRefine((value, ctx) => {
  if (value.status === "waived" && value.resolutionNote.length < 5) {
    ctx.addIssue({ code: "custom", path: ["resolutionNote"], message: "A reason is required to waive an obligation." });
  }
});
export type CreateContractInput = z.infer<typeof createContractSchema>;
export type ListContractsInput = z.infer<typeof listContractsSchema>;
