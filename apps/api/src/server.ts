import mongoose from "mongoose";
import { app } from "./app.js";
import { env } from "./config/env.js";

const server = app.listen(env.API_PORT, env.API_HOST, () => {
  console.info(`ProcuraOS API listening on http://localhost:${env.API_PORT}`);
});

async function shutdown(signal: string): Promise<void> {
  console.info(`${signal} received; shutting down gracefully`);

  server.close(async (error) => {
    if (error) {
      console.error("HTTP server shutdown failed:", error);
      process.exit(1);
    }

    try {
      await mongoose.disconnect();
      process.exit(0);
    } catch (disconnectError) {
      console.error("Database disconnect failed:", disconnectError);
      process.exit(1);
    }
  });
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
