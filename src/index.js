require("dotenv").config();
const express = require("express");
const { rateLimiter } = require("./middleware/rateLimiter");

const app = express();
app.use(express.json());

// ── Health check (no rate limiting) ──────────────────────────────────────────
app.get("/health", (req, res) => {
  res.json({ status: "ok", algorithm: process.env.ALGORITHM || "token_bucket" });
});

// ── Apply rate limiter to all /api routes ─────────────────────────────────────
app.use("/api", rateLimiter());

app.get("/api/data", (req, res) => {
  res.json({ message: "Here is your data.", timestamp: new Date().toISOString() });
});

app.get("/api/status", (req, res) => {
  res.json({ service: "rate-guard", uptime: process.uptime() });
});

// ── Check endpoint (used by Django middleware in Week 2) ──────────────────────
// Django calls this before processing each request.
// Returns 200 (allowed) or 429 (blocked) without going through rate-limited routes.
app.post("/check", rateLimiter(), (req, res) => {
  res.json({ allowed: true });
});

// ── Error handler ─────────────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  console.error("[Server] Unhandled error:", err.message);
  res.status(500).json({ error: "Internal Server Error" });
});

const PORT = process.env.PORT || 3000;
const server = app.listen(PORT, () => {
  console.log(`[rate-guard] Running on port ${PORT}`);
  console.log(`[rate-guard] Algorithm: ${process.env.ALGORITHM || "token_bucket"}`);
});

module.exports = { app, server };
