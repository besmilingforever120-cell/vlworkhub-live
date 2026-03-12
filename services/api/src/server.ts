import express from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import { env } from "./config/env";
import { authRouter } from "./routes/auth-routes";
import { resourceRouter } from "./routes/resource-routes";

const app = express();

app.use(cors({ origin: true, credentials: true }));
app.use(express.json());
app.use(cookieParser());

app.get("/health", (_, res) => res.json({ status: "ok" }));
app.use("/auth", authRouter);
app.use("/resources", resourceRouter);

app.listen(env.port, () => {
  console.log(`VLWorkHub API running on port ${env.port}`);
});
