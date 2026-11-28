import nodemailer from "nodemailer";
import { env } from "../config/env.js";

export async function sendAccountEmail(input: { to: string; subject: string; text: string }): Promise<void> {
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS || !env.EMAIL_FROM) {
    if (env.NODE_ENV === "production") throw new Error("Email delivery is not configured");
    console.warn(`Email delivery is not configured; skipped account email to ${input.to}`);
    return;
  }
  const transporter = nodemailer.createTransport({
    host: env.SMTP_HOST,
    port: env.SMTP_PORT,
    secure: env.SMTP_PORT === 465,
    auth: { user: env.SMTP_USER, pass: env.SMTP_PASS },
  });
  await transporter.sendMail({ from: env.EMAIL_FROM, to: input.to, subject: input.subject, text: input.text });
}
