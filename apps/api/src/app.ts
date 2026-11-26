import cookieParser from "cookie-parser";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import pinoHttpModule from "pino-http";
import { env } from "./config/env.js";
import { getDatabaseStatus } from "./database/connection.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { errorHandler } from "./middleware/error-handler.js";
import { notFoundHandler } from "./middleware/not-found.js";

export const app = express();
const requestLogger = (pinoHttpModule as unknown as () => express.RequestHandler)();

app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: env.WEB_ORIGIN, credentials: true }));
app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: false, limit: "1mb" }));
app.use(cookieParser());
app.use(requestLogger);

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

app.use(`${env.API_PREFIX}/auth`, authRouter);
app.use(notFoundHandler);
app.use(errorHandler);
