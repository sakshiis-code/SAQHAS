/**
 * routes/alerts.js — Email and push notification alerts
 *
 * REQ-NOT-001: Browser push via Web Push API (VAPID)
 * REQ-NOT-002: Email alerts via Nodemailer (Gmail SMTP)
 * REQ-NOT-003: Default threshold 150; users can set 50–400
 * REQ-NOT-004: Minimum 1-hour cooldown per city per user
 */

import express    from "express";
import nodemailer from "nodemailer";
import webpush    from "web-push";
import mongoose   from "mongoose";
import { authenticateToken } from "./users.js";
import { classifyAQI } from "../utils/aqi.js";

const router = express.Router();

// ── VAPID keys setup (REQ-NOT-001) ────────────────────────────────────────
// Generate once with: npx web-push generate-vapid-keys
if(process.env.VAPID_PUBLIC_KEY&&process.env.VAPID_PRIVATE_KEY)webpush.setVapidDetails(
  "mailto:" + process.env.GMAIL_USER,
  process.env.VAPID_PUBLIC_KEY,
  process.env.VAPID_PRIVATE_KEY
);

// ── Nodemailer transporter (REQ-NOT-002) ──────────────────────────────────
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD,  // Use App Password, not account password
  },
});

// ── MongoDB: Track last alert sent per user+city (REQ-NOT-004) ───────────

const alertCooldownSchema = new mongoose.Schema({
  userId:    { type: String, required: true },
  city:      { type: String, required: true },
  sentAt:    { type: Date,   default: Date.now },
});
alertCooldownSchema.index({ userId: 1, city: 1 }, { unique: true });
const AlertCooldown = mongoose.model("AlertCooldown", alertCooldownSchema);

// ── MongoDB: Push notification subscriptions ──────────────────────────────

const pushSubSchema = new mongoose.Schema({
  userId:       { type: String, required: true, unique: true },
  subscription: { type: Object, required: true },
});
const PushSubscription = mongoose.model("PushSubscription", pushSubSchema);

// ── POST /api/alerts/trigger — Check AQI and send alerts if threshold met ──

router.post("/trigger", authenticateToken, async (req, res) => {
  const { city, aqi, userEmail, threshold = 150, enableEmail, enablePush } = req.body;

  if (!city || aqi == null) return res.status(400).json({ error: "city and aqi are required." });

  // 1. Check cooldown (REQ-NOT-004)
  const cooldownKey = { userId: req.user.userId, city };
  const lastAlert   = await AlertCooldown.findOne(cooldownKey);

  if (lastAlert) {
    const hoursSince = (Date.now() - lastAlert.sentAt) / 3600000;
    if (hoursSince < 1) {
      return res.json({
        sent: false,
        reason: `Alert already sent ${hoursSince.toFixed(1)} hour(s) ago. Cooldown: 1 hour.`,
      });
    }
  }

  if (aqi <= threshold) {
    return res.json({ sent: false, reason: `AQI ${aqi} is below threshold ${threshold}.` });
  }

  const band    = classifyAQI(aqi);
  const results = { email: null, push: null };

  // 2. Send email alert (REQ-NOT-002)
  if (enableEmail && userEmail) {
    try {
      await transporter.sendMail({
        from:    `"SAQHAS Alerts" <${process.env.GMAIL_USER}>`,
        to:      userEmail,
        subject: `⚠ AQI Alert: ${city} — ${band.name} (${aqi})`,
        html: `
          <div style="font-family: sans-serif; max-width: 480px; padding: 24px;">
            <h2 style="color: #ef4444;">Air Quality Alert — ${city}</h2>
            <p><strong>Current AQI:</strong> ${aqi} <span style="color:#ef4444;">(${band.name})</span></p>
            <p><strong>Advisory:</strong> ${band.description}</p>
            <p style="background:#fff3cd; padding:12px; border-radius:6px;">
              ⓘ Advisories are informational only and do not constitute medical advice.
            </p>
            <p style="color:#666; font-size:12px;">
              SAQHAS — Medicaps University Minor Project | Your threshold: ${threshold}<br>
              To stop alerts, update your settings at saqhas.vercel.app
            </p>
          </div>
        `,
      });
      results.email = "sent";
    } catch (err) {
      console.error("Email send failed:", err.message);
      results.email = "failed";
    }
  }

  // 3. Send push notification (REQ-NOT-001)
  if (enablePush) {
    try {
      const sub = await PushSubscription.findOne({ userId: req.user.userId });
      if (sub) {
        await webpush.sendNotification(sub.subscription, JSON.stringify({
          title:  `⚠ AQI Alert: ${city}`,
          body:   `AQI is ${aqi} (${band.name}). ${band.description}`,
          icon:   "/favicon.ico",
          badge:  "/badge.png",
        }));
        results.push = "sent";
      } else {
        results.push = "no-subscription";
      }
    } catch (err) {
      console.error("Push send failed:", err.message);
      results.push = "failed";
    }
  }

  // 4. Update cooldown record
  await AlertCooldown.findOneAndUpdate(cooldownKey, { sentAt: new Date() }, { upsert: true });

  res.json({ sent: true, results });
});

// ── POST /api/alerts/subscribe — Save push subscription object ────────────

router.post("/subscribe", authenticateToken, async (req, res) => {
  const { subscription } = req.body;
  if (!subscription) return res.status(400).json({ error: "subscription object is required." });

  await PushSubscription.findOneAndUpdate(
    { userId: req.user.userId },
    { subscription },
    { upsert: true, new: true }
  );

  res.json({ message: "Push subscription saved." });
});

// ── GET /api/alerts/vapid-public-key — Provide VAPID public key to frontend

router.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

export default router;
