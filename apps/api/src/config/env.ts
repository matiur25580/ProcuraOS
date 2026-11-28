import "dotenv/config";
import { z } from "zod";

const durationSchema = z.string().regex(/^[1-9]\d*[smhd]$/, "Use a positive duration such as 15m or 7d");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().regex(/^\/[a-zA-Z0-9/_-]*$/).default("/api/v1"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
  MFA_ENCRYPTION_KEY: z.string().regex(/^[a-fA-F0-9]{64}$/, "MFA_ENCRYPTION_KEY must be 32 bytes encoded as 64 hexadecimal characters").optional(),
  ACCESS_TOKEN_TTL: durationSchema.default("15m"),
  REFRESH_TOKEN_TTL: durationSchema.default("7d"),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().email().optional(),
});

const parsed = envSchema.superRefine((value, ctx) => {
  if (value.NODE_ENV === "production" && !value.MFA_ENCRYPTION_KEY) {
    ctx.addIssue({ code: "custom", message: "MFA_ENCRYPTION_KEY is required in production", path: ["MFA_ENCRYPTION_KEY"] });
  }
  if (value.NODE_ENV === "production" && (!value.SMTP_HOST || !value.SMTP_USER || !value.SMTP_PASS || !value.EMAIL_FROM)) {
    ctx.addIssue({ code: "custom", message: "SMTP_HOST, SMTP_USER, SMTP_PASS and EMAIL_FROM are required in production", path: ["SMTP_HOST"] });
  }
}).safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
