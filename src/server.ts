import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { sitesRouter } from "./routes/sites";
import { devicesRouter } from "./routes/devices";

dotenv.config();

const app = express();

app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "awaken-backend" });
});

app.use("/api/sites", sitesRouter);
app.use("/api/devices", devicesRouter);

const port = Number(process.env.PORT || 4000);
app.listen(port, () => {
  console.log(`AWAKEN backend running on port ${port}`);
});