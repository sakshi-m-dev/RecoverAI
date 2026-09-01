require('dotenv').config();
const express = require('express');
const cors = require('cors');

const { createSchema } = require('./db/schema');
const transactionsRouter = require('./routes/transactions');
const agentRouter = require('./routes/agent');
const razorpayRouter = require('./routes/razorpay');

const app = express();
const PORT = process.env.PORT || 3001;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:5173';

// ── Middleware ────────────────────────────────────────────────────────────────
app.use(cors({
  origin: [FRONTEND_URL, 'http://localhost:5173', 'http://localhost:5174'],
  credentials: true,
}));
app.use(express.json());

// ── Init DB ───────────────────────────────────────────────────────────────────
createSchema();

// ── Routes ────────────────────────────────────────────────────────────────────
app.use('/api/transactions', transactionsRouter);
app.use('/api/agent', agentRouter);
app.use('/api/razorpay', razorpayRouter);

// ── Health ────────────────────────────────────────────────────────────────────
app.get('/api/health', (_req, res) => {
  const { getStatus } = require('./lib/modelRouter');
  res.json({
    status:    'ok',
    timestamp: new Date().toISOString(),
    gemini:    !!(process.env.GEMINI_API_KEY?.trim().length > 5),
    razorpay:  !!(process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET),
    models:    getStatus(),  // live per-model RPM/RPD tracking (key never exposed)
  });
});

// ── Start ─────────────────────────────────────────────────────────────────────
const server = app.listen(PORT, () => {
  const hasGemini   = !!(process.env.GEMINI_API_KEY?.trim().length > 5);
  const hasRazorpay = process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET;

  console.log(`
  ╬══════════════════════════════════════════╪
  ║   RecoverAI Backend  ·  Port ${PORT}     ║
  ╚══════════════════════════════════════════╝

  Gemini API : ${hasGemini   ? '✅ Connected (gemini-3.1-flash-lite)' : '⚠️  Mock mode  (add GEMINI_API_KEY)'}
  Razorpay   : ${hasRazorpay ? '✅ Connected (test mode)'             : '⚠️  Simulated  (add RAZORPAY keys)'}
  Database   : ✅ SQLite  ·  data/recoverai.db

  Run 'npm run seed' first to populate the database.
  Frontend   : ${FRONTEND_URL}
  `);
});

// Graceful port-conflict handling (prevents unhandled crash killing concurrently)
server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.error(`❌ Port ${PORT} is already in use. Stop the existing server first.`);
  } else {
    console.error('❌ Server error:', err.message);
  }
  process.exit(1);
});

// ── Process-level safety net ─────────────────────────────────────────────────
// Prevent nodemon from dying due to stray async errors in SSE handlers.
// Log and continue — individual requests already have their own try/catch.
process.on('unhandledRejection', (reason) => {
  const msg = reason instanceof Error ? reason.stack : String(reason);
  console.error('[RecoverAI] Unhandled promise rejection (non-fatal):', msg);
});

process.on('uncaughtException', (err) => {
  // If it's a known network/stream error from an SSE client disconnect, just log it.
  if (err.code === 'ERR_HTTP_HEADERS_SENT' || err.code === 'ECONNRESET' || err.code === 'EPIPE') {
    console.warn('[RecoverAI] Client disconnected mid-stream:', err.code);
    return;
  }
  // For anything else, log then exit so nodemon restarts cleanly.
  console.error('[RecoverAI] Uncaught exception — restarting:', err.stack);
  process.exit(1);
});
