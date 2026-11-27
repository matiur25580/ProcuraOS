import { z } from "zod";

export const registerSchema = z.object({
  name: z.string().trim().min(2).max(100),
  email: z.string().trim().email().max(254),
  password: z.string().min(12).max(128).regex(/[a-z]/, "Include a lowercase letter").regex(/[A-Z]/, "Include an uppercase letter").regex(/[0-9]/, "Include a number"),
  organizationName: z.string().trim().min(2).max(140),
}).strict();

export const loginSchema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(1).max(128),
  otp: z.string().regex(/^(?:\d{6}|[A-Z0-9-]{8,32})$/i).optional(),
}).strict();

export const createOrganizationSchema = z.object({ name: z.string().trim().min(2).max(140) }).strict();
export const switchOrganizationSchema = z.object({ organizationId: z.string().regex(/^[a-f\d]{24}$/i) }).strict();
export const updateProfileSchema = z.object({ name: z.string().trim().min(2).max(100) }).strict();

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;

export const verifyEmailSchema = z.object({ token: z.string().min(32).max(256) }).strict();
export const forgotPasswordSchema = z.object({ email: z.string().trim().email().max(254) }).strict();
export const resetPasswordSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128).regex(/[a-z]/).regex(/[A-Z]/).regex(/[0-9]/),
}).strict();

export const mfaEnableSchema = z.object({ code: z.string().regex(/^\d{6}$/) }).strict();
export const mfaDisableSchema = z.object({ password: z.string().min(1).max(128), code: z.string().min(6).max(32) }).strict();
