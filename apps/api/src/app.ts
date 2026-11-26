import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttp from "pino-http";
import { env } from "./config/env.js";
import { getDatabaseStatus } from "./database/connection.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";

export const app = express();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(pinoHttp());

app.get(`${env.API_PREFIX}/health`, (_req, res) => {
  res.status(200).json({
    success: true,
    data: { status: "ok", service: "procuraos-api", timestamp: new Date().toISOString() },
  });
});

app.get(`${env.API_PREFIX}/ready`, (_req, res) => {
  const database = getDatabaseStatus();
  const ready = database === "connected";
  res.status(ready ? 200 : 503).json({
    success: ready,
    data: { status: ready ? "ready" : "not-ready", database },
  });
});

app.use(notFoundHandler);
app.use(errorHandler);
