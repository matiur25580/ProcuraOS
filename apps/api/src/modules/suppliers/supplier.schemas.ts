import { z } from "zod";
const documentSchema = z.object({
  name: z.string().trim().min(2).max(160),
  type: z.enum(["tax_certificate", "business_registration", "insurance", "bank_letter", "security", "other"]),
  referenceUrl: z.string().url().max(2048), expiresAt: z.string().datetime().optional(),
}).strict();
export const createSupplierSchema = z.object({
  legalName: z.string().trim().min(2).max(180), displayName: z.string().trim().min(2).max(120),
  taxId: z.string().trim().min(2).max(80), registrationNumber: z.string().trim().max(100).optional().default(""),
  contactName: z.string().trim().min(2).max(120), email: z.string().trim().email().max(254),
  phone: z.string().trim().max(40).optional().default(""), country: z.string().trim().min(2).max(80),
  website: z.string().url().max(2048).optional().or(z.literal("")).default(""),
  categories: z.array(z.string().trim().min(2).max(60)).max(20).default([]), documents: z.array(documentSchema).max(20).default([]),
}).strict();
export const reviewSupplierSchema = z.object({
  status: z.enum(["approved", "rejected", "suspended"]), riskLevel: z.enum(["low", "medium", "high", "unassessed"]).optional(),
  rejectionReason: z.string().trim().max(1000).optional().default(""),
}).strict().refine((v) => v.status !== "rejected" || v.rejectionReason.length >= 5, { message: "A meaningful rejection reason is required", path: ["rejectionReason"] });
export const supplierDocumentSchema = documentSchema;
export const createRfqSchema = z.object({
  title: z.string().trim().min(3).max(160), description: z.string().trim().min(10).max(3000),
  requisitionId: z.string().regex(/^[a-f\d]{24}$/i).optional(), currency: z.string().regex(/^[A-Za-z]{3}$/),
  submissionDeadline: z.string().datetime(), supplierIds: z.array(z.string().regex(/^[a-f\d]{24}$/i)).min(1).max(50),
  items: z.array(z.object({ description: z.string().trim().min(2).max(240), quantity: z.number().int().min(1).max(100000),
    unit: z.string().trim().min(1).max(30), specification: z.string().trim().max(1000).optional().default("") }).strict()).min(1).max(30),
}).strict();
export const submitQuotationSchema = z.object({
  token: z.string().min(32).max(128), validUntil: z.string().datetime(), deliveryDays: z.number().int().min(0).max(3650),
  notes: z.string().trim().max(2000).optional().default(""),
  items: z.array(z.object({ rfqItemId: z.string().regex(/^[a-f\d]{24}$/i), unitPriceMinor: z.number().int().min(0).max(1000000000),
    leadTimeDays: z.number().int().min(0).max(3650), notes: z.string().trim().max(500).optional().default("") }).strict()).min(1).max(30),
}).strict();
export const quoteAccessSchema = z.object({ token: z.string().min(32).max(128) }).strict();
export const updateQuotationStatusSchema = z.object({ status: z.enum(["shortlisted", "awarded", "rejected"]) }).strict();
export type CreateSupplierInput = z.infer<typeof createSupplierSchema>;
export type ReviewSupplierInput = z.infer<typeof reviewSupplierSchema>;
export type CreateRfqInput = z.infer<typeof createRfqSchema>;
export type SubmitQuotationInput = z.infer<typeof submitQuotationSchema>;
