'use strict';
/**
 * modelRouter.js
 * Rate-limit-aware Gemini model selection and automatic cascade fallback.
 *
 * Priority chain — API IDs verified via ListModels (Sep 2026):
 *
 *  Display Name            │ API ID                    │ RPM │  RPD  │   TPM
 *  ────────────────────────┼───────────────────────────┼─────┼───────┼────────
 *  Gemini 3.1 Flash Lite   │ gemini-3.1-flash-lite     │  15 │   500 │  250 K  ← primary
 *  Gemini 3.5 Flash Lite   │ gemini-3.5-flash-lite     │  15 │   500 │  250 K  ← 1st fb
 *  Gemini Flash Lite Latest│ gemini-flash-lite-latest  │  10 │    20 │  250 K  ← 2nd fb (verified)
 *  Gemini 3 Flash Preview  │ gemini-3-flash-preview    │   5 │    20 │  250 K  ← last Gemini fb
 */

// ─── Model chain ──────────────────────────────────────────────────────────────
const MODEL_CHAIN = [
  { id: 'gemini-3.1-flash-lite',  label: 'Gemini 3.1 Flash Lite', rpm: 15, rpd: 500 },
  { id: 'gemini-3.5-flash-lite',  label: 'Gemini 3.5 Flash Lite', rpm: 15, rpd: 500 },
  { id: 'gemini-flash-lite-latest', label: 'Gemini Flash Lite Latest', rpm: 10, rpd: 20  },
  { id: 'gemini-3-flash-preview', label: 'Gemini 3 Flash',        rpm: 5,  rpd: 20  },
];

// ─── Per-model mutable runtime state (in-process; resets on restart) ─────────
function _dayStart() {
  const d = new Date(); d.setHours(0, 0, 0, 0); return d.getTime();
}

const _state = new Map(MODEL_CHAIN.map(m => [m.id, {
  reqTimestamps: [],   // epoch-ms of requests in the last 60 s (sliding window)
  dailyCount:    0,
  dayEpoch:      _dayStart(),
  blockedUntil:  0,   // epoch-ms; 0 = not explicitly blocked
}]));

// ─── Internal helpers ─────────────────────────────────────────────────────────
function _spec(modelId) { return MODEL_CHAIN.find(m => m.id === modelId); }

function _refreshDay(state) {
  const today = _dayStart();
  if (today !== state.dayEpoch) { state.dayEpoch = today; state.dailyCount = 0; }
}

/** Prune timestamps older than 60 s; returns current in-window count. */
function _pruneWindow(state) {
  const now = Date.now();
  state.reqTimestamps = state.reqTimestamps.filter(t => now - t < 60_000);
  return state.reqTimestamps.length;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Returns how many ms must elapse before this model can accept another request.
 * 0 → fire immediately. Large value (>= hours) → RPD exhausted for today.
 */
function waitMsFor(modelId) {
  const spec  = _spec(modelId);
  const state = _state.get(modelId);
  const now   = Date.now();

  _refreshDay(state);

  // Explicit rate-limit / error backoff
  if (state.blockedUntil > now) return state.blockedUntil - now;

  // RPD cap (done for the day)
  if (state.dailyCount >= spec.rpd) return (_dayStart() + 86_400_000) - now;

  // RPM sliding-window cap
  const inWindow = _pruneWindow(state);
  if (inWindow >= spec.rpm) {
    // Wait until the oldest in-window request ages past 60 s
    return (state.reqTimestamps[0] + 60_000) - now;
  }

  return 0;
}

/**
 * Returns { modelId, waitMs } for the best available model in the chain,
 * or null if every model has exhausted its daily quota.
 */
function pickBest() {
  let bestId = null, bestWait = Infinity;

  for (const m of MODEL_CHAIN) {
    const spec  = _spec(m.id);
    const state = _state.get(m.id);
    _refreshDay(state);

    // Skip models whose daily quota is gone
    if (state.dailyCount >= spec.rpd) continue;

    const w = waitMsFor(m.id);
    if (w < bestWait) { bestWait = w; bestId = m.id; }
    if (w === 0) break; // first immediately-available model wins
  }

  return bestId ? { modelId: bestId, waitMs: bestWait } : null;
}

/** Record that a request was dispatched to this model. Call before awaiting. */
function recordRequest(modelId) {
  const state = _state.get(modelId);
  state.reqTimestamps.push(Date.now());
  state.dailyCount++;
}

/** Explicitly block a model until epoch-ms (e.g. after a 429 with retry-after). */
function blockUntil(modelId, epochMs) {
  _state.get(modelId).blockedUntil = Math.max(_state.get(modelId).blockedUntil, epochMs);
}

/**
 * Parse the retry-after delay from a Gemini SDK error message.
 * Returns milliseconds; conservative default = 60 000 ms if not parseable.
 */
function parseRetryAfterMs(err) {
  const match = (err.message || '').match(/retry.?after[:\s=]+(\d+)/i);
  return match ? Math.max(1_000, parseInt(match[1], 10) * 1_000) : 60_000;
}

/** True for 429 / RESOURCE_EXHAUSTED errors. */
const isRateLimit = (err) => /429|RESOURCE_EXHAUSTED/.test(err && err.message || '');

/** True for any error the caller should retry rather than hard-fail immediately. */
const isRetryable = (err) =>
  isRateLimit(err) || /50[03]|UNAVAILABLE|timeout|deadline/i.test(err && err.message || '');

/** Human-readable label for a model id (falls back to the raw id). */
const labelOf = (modelId) =>
  MODEL_CHAIN.find(m => m.id === modelId) && MODEL_CHAIN.find(m => m.id === modelId).label
  || modelId || 'mock';

/** Live snapshot of rate-limit state for all models (diagnostics). */
function getStatus() {
  return MODEL_CHAIN.map(m => {
    const s = _state.get(m.id);
    return {
      id:           m.id,
      label:        m.label,
      rpm:          m.rpm,
      rpd:          m.rpd,
      inWindowNow:  _pruneWindow(s),
      dailyCount:   s.dailyCount,
      blockedForMs: Math.max(0, s.blockedUntil - Date.now()),
    };
  });
}

module.exports = {
  MODEL_CHAIN,
  waitMsFor,
  pickBest,
  recordRequest,
  blockUntil,
  parseRetryAfterMs,
  isRateLimit,
  isRetryable,
  labelOf,
  getStatus,
};
