import "express-async-errors";
import "dotenv/config";
import express from "express";
import path from "node:path";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { verifyDatabaseConnection } from "./config/db";
import { authRouter } from "./routes/auth-routes";
import { resourceRouter } from "./routes/resource-routes";
import { notificationRouter } from "./routes/notification-routes";
import { adminUserRouter, userRouter } from "./routes/user-routes";
import { ursafeRouter } from "./routes/ursafe-routes";
import { hrRouter } from "./routes/hr-routes";
import { adminRouter } from "./routes/admin-routes";
import { startOnboardingExpiryTaskScheduler } from "./controllers/hr-documents-controller";

const app = express();

app.set("trust proxy", env.trustProxyHops);

const allowedOrigins = new Set(env.allowedOrigins);

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || allowedOrigins.has(origin)) {
        return callback(null, true);
      }
      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    methods: ["GET", "HEAD", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    credentials: true
  })
);
app.use(express.json({ limit: "25mb" }));
app.use(cookieParser());
app.use("/uploads", express.static(path.resolve(__dirname, "../../uploads")));

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use("/auth", authRouter);
app.use("/resources", resourceRouter);
app.use("/notifications", notificationRouter);
app.use("/api", userRouter);
app.use("/api/admin", adminUserRouter);
app.use("/admin", adminRouter);
app.use("/hr", hrRouter);
app.use("/api/hr", hrRouter);
app.use("/ursafe", ursafeRouter);
app.use((err: Error, _req: express.Request, res: express.Response, next: express.NextFunction) => {
  console.error("API ERROR:", err);

  if (res.headersSent) {
    return next(err);
  }

  return res.status(500).json({
    error: "Internal server error",
    message: err?.message || "Unexpected error"
  });
});

process.on("unhandledRejection", (reason) => {
  console.error("UNHANDLED PROMISE REJECTION:", reason);
});

process.on("uncaughtException", (err) => {
  console.error("UNCAUGHT EXCEPTION:", err);
});

async function start() {
  try {
    await verifyDatabaseConnection();
    console.log("PostgreSQL connection verified.");
    startOnboardingExpiryTaskScheduler();

    const server = app.listen(env.port, env.host, () => {
      console.log(`VLWorkHub API running on http://${env.host}:${env.port}`);
    });

    server.on("error", (error: NodeJS.ErrnoException) => {
      if (error.code === "EADDRINUSE") {
        console.error(`Port ${env.port} is already in use.`);
      } else {
        console.error("VLWorkHub API failed to start.", error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error("Failed to start API:", error);
    process.exit(1);
  }
}

void start();
