import "dotenv/config";
import { z } from "zod";

const durationSchema = z.string().regex(/^[1-9]\\d*[smhd]$/, "Use a positive duration such as 15m or 7d");

const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_HOST: z.string().default("0.0.0.0"),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  API_PREFIX: z.string().regex(/^\\/[a-zA-Z0-9/_-]*$/).default("/api/v1"),
  WEB_ORIGIN: z.string().url().default("http://localhost:5173"),
  MONGODB_URI: z.string().min(1, "MONGODB_URI is required"),
  JWT_ACCESS_SECRET: z.string().min(32, "JWT_ACCESS_SECRET must contain at least 32 characters"),
  ACCESS_TOKEN_TTL: durationSchema.default("15m"),
  REFRESH_TOKEN_TTL: durationSchema.default("7d"),
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  console.error("Invalid environment configuration:", parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
