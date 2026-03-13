import "dotenv/config";
import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { verifyDatabaseConnection } from "./config/db";
import { authRouter } from "./routes/auth-routes";
import { resourceRouter } from "./routes/resource-routes";
import { notificationRouter } from "./routes/notification-routes";
import { adminUserRouter, userRouter } from "./routes/user-routes";
import { ursafeRouter } from "./routes/ursafe-routes";

const app = express();

app.use(
  cors({
    origin(origin, callback) {
      if (!origin || env.allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error(`Origin ${origin} is not allowed by CORS`));
    },
    credentials: true
  })
);
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use("/auth", authRouter);
app.use("/resources", resourceRouter);
app.use("/notifications", notificationRouter);
app.use("/api", userRouter);
app.use("/api/admin", adminUserRouter);
app.use("/ursafe", ursafeRouter);

async function start() {
  try {
    await verifyDatabaseConnection();
    console.log("PostgreSQL connection verified.");
  } catch (error) {
    console.error("Failed to connect to PostgreSQL.", error);
    process.exit(1);
  }

  app.listen(env.port, () => {
    console.log(`VLWorkHub API running on port ${env.port}`);
  });
}

void start();
