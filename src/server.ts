import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import http from "http";
import { Server } from "socket.io";

import { authRouter } from "./routes/auth";
import { sitesRouter } from "./routes/sites";
import { devicesRouter } from "./routes/devices";
import { bookingsRouter } from "./routes/bookings";
import { pinsRouter } from "./routes/pins";
import { sessionsRouter } from "./routes/sessions";
import { clientRouter } from "./routes/client";
import { announcementsRouter } from "./routes/announcements";
import { teamRouter } from "./routes/team";
import { siteAdminRouter } from "./routes/siteAdmin";

dotenv.config();

/* ✅ CREATE APP FIRST */
const app = express();

/* MIDDLEWARE */
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: "1mb" }));

/* ROUTES */
app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "awaken-backend" });
});

app.use("/api/auth", authRouter);
app.use("/api/sites", sitesRouter);
app.use("/api/devices", devicesRouter);
app.use("/api/bookings", bookingsRouter);
app.use("/api/pins", pinsRouter);
app.use("/api/sessions", sessionsRouter);
app.use("/api/client", clientRouter);
app.use("/api/announcements", announcementsRouter);
app.use("/api/team", teamRouter);
app.use("/api/site-admin", siteAdminRouter);

/* ✅ CREATE SERVER AFTER APP */
const server = http.createServer(app);

/* ✅ SOCKET.IO SETUP */
export const io = new Server(server, {
  cors: {
    origin: "*",
  },
});

io.on("connection", (socket) => {
  console.log("🔌 Client connected:", socket.id);

  socket.on("join-site", (siteId: string) => {
    socket.join(`site:${siteId}`);
  });

  socket.on("disconnect", () => {
    console.log("❌ Client disconnected:", socket.id);
  });
});

/* START SERVER */
const port = Number(process.env.PORT || 4000);

server.listen(port, () => {
  console.log(`🚀 AWAKEN backend running on port ${port}`);
});