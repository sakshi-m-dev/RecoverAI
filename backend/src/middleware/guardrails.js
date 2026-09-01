'use strict';
const { getDb } = require('../db/database');

/**
 * Check if we're within the 30-minute cooldown window for a transaction.
 */
function isInCooldown(transaction) {
  const db = getDb();
  const last = db.prepare(
    `SELECT sent_at FROM recovery_actions WHERE transaction_id = ? ORDER BY sent_at DESC LIMIT 1`
  ).get(transaction.id);
  if (!last) return false;
  const lastTime = new Date(last.sent_at).getTime();
  const diffMins = (Date.now() - lastTime) / 60_000;
  return diffMins < 30;
}

// ─── Stage 1: PRE-CHECK guardrails ────────────────────────────────────────────
/**
 * Run BEFORE calling Gemini.
 * Blocks cases that are obviously ineligible for autonomous recovery — no LLM
 * call is made for these.
 * Returns { allowed, reason, code }
 */
function evaluatePreCheck(transaction) {
  // 1a. High-Value Threshold (> ₹25,000) — always human-reviewed
  if (transaction.amount > 25000) {
    return {
      allowed: false,
      reason:  `Transaction amount (₹${transaction.amount.toLocaleString('en-IN')}) exceeds the autonomous recovery limit of ₹25,000.`,
      code:    'HIGH_VALUE_THRESHOLD',
    };
  }
  // 1b. High-Risk Score (≥ 85) — risk too elevated for autonomous action
  if (transaction.risk_score >= 85) {
    return {
      allowed: false,
      reason:  `Risk score (${transaction.risk_score}/100) exceeds the autonomous threshold of 85. Escalating to human review.`,
      code:    'HIGH_RISK_SCORE',
    };
  }
  return { allowed: true, reason: 'Pre-check passed. Proceeding to AI diagnosis.', code: 'PRE_CHECK_PASSED' };
}

// ─── Stage 2: ACTION guardrails ───────────────────────────────────────────────
/**
 * Run AFTER Gemini proposes an action, BEFORE execution.
 * Fully deterministic backend code — Gemini cannot bypass this layer.
 *
 * @param {object} transaction    - full transaction row
 * @param {string} proposedAction - 'send_recovery_nudge'|'offer_discount'|'escalate'|null
 * @param {number} proposedPercent - discount % Gemini requested (only for offer_discount)
 * Returns { allowed, reason, code, capped? }
 */
function evaluateActionGuardrail(transaction, proposedAction, proposedPercent) {
  // Defence-in-depth: re-check high-value and high-risk
  if (transaction.amount > 25000) {
    return {
      allowed: false,
      reason:  `High-value transaction (₹${transaction.amount.toLocaleString('en-IN')}) blocked at action stage.`,
      code:    'HIGH_VALUE_THRESHOLD',
    };
  }
  if (transaction.risk_score >= 85) {
    return {
      allowed: false,
      reason:  `High risk score (${transaction.risk_score}) blocked at action stage.`,
      code:    'HIGH_RISK_SCORE',
    };
  }
  // Contact / retry limit (max 2 autonomous messages)
  if (transaction.attempts_count >= 2) {
    return {
      allowed: false,
      reason:  `Maximum recovery attempts (2) already reached. Further contact blocked.`,
      code:    'MAX_ATTEMPTS_EXCEEDED',
    };
  }
  // Cooldown window (30 min between actions)
  if (isInCooldown(transaction)) {
    return {
      allowed: false,
      reason:  `Cooldown window active: an action was taken less than 30 minutes ago.`,
      code:    'COOLDOWN_ACTIVE',
    };
  }
  // Discount cap: allow but flag — the tool enforces the actual Math.min(x,10)
  if (proposedAction === 'offer_discount' && Number(proposedPercent) > 10) {
    return {
      allowed: true,
      reason:  `Discount capped at policy maximum of 10% (AI requested ${proposedPercent}%).`,
      code:    'DISCOUNT_CAPPED',
      capped:  true,
    };
  }
  return { allowed: true, reason: 'Action guardrail passed.', code: 'ACTION_PASSED' };
}

// ─── Legacy alias ─────────────────────────────────────────────────────────────
/**
 * Kept for backward compatibility (mock agent, any older call sites).
 * Runs pre-check then action guardrail with no specific action context.
 */
function evaluatePolicy(transaction) {
  const pre = evaluatePreCheck(transaction);
  if (!pre.allowed) return pre;
  return evaluateActionGuardrail(transaction, null, null);
}

function guardrailsMiddleware(req, res, next) {
  req.guardrails = { evaluatePolicy, evaluatePreCheck, evaluateActionGuardrail };
  next();
}

module.exports = {
  guardrailsMiddleware,
  evaluatePolicy,
  evaluatePreCheck,
  evaluateActionGuardrail,
  isInCooldown,
};
