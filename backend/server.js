/**
 * SAQHAS Backend — Node.js / Express
 * ─────────────────────────────────────────────────────────────────────────────
 * Serves AQI data from OpenWeatherMap + IQAir APIs.
 * Computes CPCB AQI, stores hourly readings in MongoDB, and calls the
 * Python Flask ML microservice for forecasts.
 *
 * Deploy: Render.com (free tier)
 * Set environment variables via Render dashboard or .env file (never commit .env).
 */

import express     from "express";
import cors        from "cors";
import mongoose    from "mongoose";
import dotenv      from "dotenv";
import helmet      from "helmet";
import morgan      from "morgan";

import aqiRoutes    from "./routes/aqi.js";
import userRoutes   from "./routes/users.js";
import alertRoutes  from "./routes/alerts.js";

dotenv.config();

const app  = express();
const PORT = process.env.PORT ?? 5000;

// ── Middleware ──────────────────────────────────────────────────────────────
app.use(helmet());
app.use(morgan("dev"));
app.use(express.json({ limit: "1mb" }));

// CORS: restrict to deployed Vercel frontend (REQ — Section 5.3)
const allowedOrigins = [
  process.env.FRONTEND_URL ?? "http://localhost:5173",
  "https://saqhas.vercel.app",  // update with your actual Vercel URL
];

app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));

// ── MongoDB Atlas Connection ────────────────────────────────────────────────
mongoose.connect(process.env.MONGODB_URI, {
  dbName: "saqhas",
})
.then(() => console.log("✓ MongoDB Atlas connected"))
.catch(err => {
  console.error("✗ MongoDB connection failed:", err.message);
  // Do not crash — continue serving cached responses if available
});

// ── Routes ──────────────────────────────────────────────────────────────────
app.use("/api/aqi",    aqiRoutes);
app.use("/api/users",  userRoutes);
app.use("/api/alerts", alertRoutes);

// Health check (used by Render to verify deployment)
app.get("/health", (_req, res) => res.json({ status: "ok", uptime: process.uptime() }));

// ── Global Error Handler ────────────────────────────────────────────────────
app.use((err, _req, res, _next) => {
  console.error("Unhandled error:", err.message);
  res.status(500).json({ error: "Internal server error" });
});

app.listen(PORT, () => {
  console.log(`✓ SAQHAS backend running on port ${PORT}`);
});

export default app;
