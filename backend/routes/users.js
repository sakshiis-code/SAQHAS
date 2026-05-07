/**
 * routes/users.js — User registration, login, and profile management
 *
 * REQ (Section 5.3): Passwords stored as bcrypt hashes (cost ≥ 10)
 * REQ (Section 5.3): JWT auth tokens expire after 24 hours
 * REQ-HAE-003: Registered users can save health profile to MongoDB
 */

import express  from "express";
import bcrypt   from "bcrypt";
import jwt      from "jsonwebtoken";
import mongoose from "mongoose";

const router = express.Router();

// ── User Schema ─────────────────────────────────────────────────────────────

const userSchema = new mongoose.Schema({
  email:    { type: String, required: true, unique: true, lowercase: true, trim: true },
  password: { type: String, required: true },  // bcrypt hash
  profile: {
    name:           { type: String, default: "" },
    ageGroup:       { type: String, enum: ["General", "Elderly"], default: "General" },
    condition:      { type: String, enum: ["General", "Respiratory", "Child"], default: "General" },
    alertThreshold: { type: Number, default: 150, min: 50, max: 400 },
    emailAlerts:    { type: Boolean, default: false },
    pushAlerts:     { type: Boolean, default: false },
  },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model("User", userSchema);

// ── Middleware: Authenticate JWT ───────────────────────────────────────────

export function authenticateToken(req, res, next) {
  const authHeader = req.headers["authorization"];
  const token      = authHeader?.split(" ")[1];

  if (!token) return res.status(401).json({ error: "Access token required." });

  jwt.verify(token, process.env.JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid or expired token." });
    req.user = user;
    next();
  });
}

// ── Input validation helper ────────────────────────────────────────────────

function validateEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

// ── POST /api/users/register ───────────────────────────────────────────────

router.post("/register", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password)            return res.status(400).json({ error: "Email and password are required." });
  if (!validateEmail(email))          return res.status(400).json({ error: "Invalid email address." });
  if (password.length < 8)            return res.status(400).json({ error: "Password must be at least 8 characters." });

  try {
    const existing = await User.findOne({ email });
    if (existing) return res.status(409).json({ error: "Email already registered." });

    const hashedPassword = await bcrypt.hash(password, 12); // cost ≥ 10 per SRS

    const user = await User.create({ email, password: hashedPassword });

    const token = jwt.sign({ userId: user._id, email }, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.status(201).json({
      message: "Registration successful.",
      token,
      profile: user.profile,
    });

  } catch (err) {
    console.error("Register error:", err.message);
    res.status(500).json({ error: "Registration failed. Please try again." });
  }
});

// ── POST /api/users/login ──────────────────────────────────────────────────

router.post("/login", async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) return res.status(400).json({ error: "Email and password are required." });

  try {
    const user = await User.findOne({ email });
    if (!user) return res.status(401).json({ error: "Invalid credentials." });

    const passwordMatch = await bcrypt.compare(password, user.password);
    if (!passwordMatch) return res.status(401).json({ error: "Invalid credentials." });

    const token = jwt.sign({ userId: user._id, email }, process.env.JWT_SECRET, { expiresIn: "24h" });

    res.json({
      message: "Login successful.",
      token,
      profile: user.profile,
    });

  } catch (err) {
    console.error("Login error:", err.message);
    res.status(500).json({ error: "Login failed. Please try again." });
  }
});

// ── GET /api/users/profile — Get logged-in user's profile ────────────────

router.get("/profile", authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user.userId).select("-password");
    if (!user) return res.status(404).json({ error: "User not found." });
    res.json({ email: user.email, profile: user.profile });
  } catch (err) {
    res.status(500).json({ error: "Failed to fetch profile." });
  }
});

// ── PUT /api/users/profile — Update health profile (REQ-HAE-003) ──────────

router.put("/profile", authenticateToken, async (req, res) => {
  const { name, ageGroup, condition, alertThreshold, emailAlerts, pushAlerts } = req.body;

  const allowedAgeGroups  = ["General", "Elderly"];
  const allowedConditions = ["General", "Respiratory", "Child"];

  if (ageGroup  && !allowedAgeGroups.includes(ageGroup))  return res.status(400).json({ error: "Invalid ageGroup." });
  if (condition && !allowedConditions.includes(condition)) return res.status(400).json({ error: "Invalid condition." });
  if (alertThreshold != null && (alertThreshold < 50 || alertThreshold > 400)) {
    return res.status(400).json({ error: "alertThreshold must be between 50 and 400." });
  }

  try {
    const updated = await User.findByIdAndUpdate(
      req.user.userId,
      { $set: {
        "profile.name":           name ?? undefined,
        "profile.ageGroup":       ageGroup ?? undefined,
        "profile.condition":      condition ?? undefined,
        "profile.alertThreshold": alertThreshold ?? undefined,
        "profile.emailAlerts":    emailAlerts ?? undefined,
        "profile.pushAlerts":     pushAlerts ?? undefined,
      }},
      { new: true, select: "-password" }
    );

    res.json({ message: "Profile updated.", profile: updated.profile });

  } catch (err) {
    res.status(500).json({ error: "Failed to update profile." });
  }
});

export default router;
