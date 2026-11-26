import mongoose from "mongoose";
import { env } from "../config/env.js";

export async function connectToDatabase(): Promise<void> {
  mongoose.set("strictQuery", true);
  await mongoose.connect(env.MONGODB_URI, {
    serverSelectionTimeoutMS: 10_000,
    maxPoolSize: 20,
    minPoolSize: 2,
    autoIndex: env.NODE_ENV !== "production",
  });
  console.info("MongoDB connection established");
}

export function getDatabaseStatus(): "connected" | "disconnected" | "connecting" {
  if (mongoose.connection.readyState === 1) return "connected";
  if (mongoose.connection.readyState === 2) return "connecting";
  return "disconnected";
}
