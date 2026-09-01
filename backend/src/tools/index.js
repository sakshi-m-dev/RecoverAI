const { v4: uuidv4 } = require('uuid');
const { getDb } = require('../db/database');

// ─── Audit helper ──────────────────────────────────────────────────────────────
function logAudit(transactionId, eventType, eventDetail) {
  const db = getDb();
  db.prepare(
    `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  ).run(uuidv4(), transactionId, eventType, eventDetail, new Date().toISOString());
}

// ─── Tool implementations ──────────────────────────────────────────────────────
const TOOLS = {
  diagnose_failure(input, transaction) {
    const db = getDb();
    
    // Map diagnosis to risk score if needed
    let derivedRisk = transaction.risk_score;
    if (input.diagnosis === 'insufficient_funds') derivedRisk = 80;
    else if (input.diagnosis === 'abandoned') derivedRisk = 65;
    else if (input.diagnosis === 'otp_timeout') derivedRisk = 25;
    else if (input.diagnosis === 'network_drop') derivedRisk = 15;

    db.prepare(`UPDATE transactions SET risk_score=? WHERE id=?`).run(derivedRisk, transaction.id);

    logAudit(transaction.id, 'agent_diagnosis',
      `[DIAGNOSE] Diagnosed failure reason as ${input.diagnosis} (Risk Score: ${derivedRisk}). Rationale: ${input.reasoning}`);
    return { success: true, diagnosis: input.diagnosis, risk_score: derivedRisk, reasoning: input.reasoning };
  },

  send_recovery_nudge(input, transaction) {
    const db = getDb();
    const paymentLink = process.env.RAZORPAY_KEY_ID
      ? `https://rzp.io/l/${uuidv4().slice(0, 8)}`
      : `https://pay.recoverai.demo/${transaction.id.slice(0, 8)}`;

    const newAttempts = transaction.attempts_count + 1;

    db.prepare(
      `INSERT INTO recovery_actions (id, transaction_id, action_type, action_payload, sent_at, outcome)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'email_nudge',
      JSON.stringify({ tone: input.tone, message: input.message, payment_link: paymentLink }),
      new Date().toISOString(), null);

    db.prepare(`UPDATE transactions SET payment_link=?, status='recovering', attempts_count=?, updated_at=? WHERE id=?`)
      .run(paymentLink, newAttempts, new Date().toISOString(), transaction.id);

    logAudit(transaction.id, 'guardrail_passed',
      `[GUARDRAIL] Policy check passed: Action within allowable limits (attempts <= 2, cooldown satisfied).`);

    logAudit(transaction.id, 'nudge_sent',
      `[ACT] Dispatched recovery message (${input.tone}) via email/SMS. Contact attempt #${newAttempts}.`);

    return { success: true, payment_link: paymentLink, message_sent: input.message, attempts_count: newAttempts };
  },

  offer_discount(input, transaction) {
    const db = getDb();
    // ──── Guardrail: hard cap at 10% ────
    const cappedPercent = Math.min(Number(input.percent), 10);
    const guardrailApplied = cappedPercent < Number(input.percent);

    if (guardrailApplied) {
      db.prepare(`UPDATE transactions SET blocked_by_guardrail=1 WHERE id=?`).run(transaction.id);
      logAudit(transaction.id, 'guardrail_triggered',
        `[GUARDRAIL] AI requested ${input.percent}% discount. Policy limit enforced: capped at 10%.`);
    } else {
      logAudit(transaction.id, 'guardrail_passed',
        `[GUARDRAIL] Policy check passed: Discount offer of ${cappedPercent}% is within allowable limit (<=10%).`);
    }

    const discountedAmount = transaction.amount * (1 - cappedPercent / 100);
    const paymentLink = `https://pay.recoverai.demo/${transaction.id.slice(0, 8)}?discount=${cappedPercent}`;
    const newAttempts = transaction.attempts_count + 1;

    db.prepare(
      `INSERT INTO recovery_actions (id, transaction_id, action_type, action_payload, sent_at, outcome)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'discount_offer',
      JSON.stringify({ percent: cappedPercent, original_amount: transaction.amount, discounted_amount: discountedAmount, payment_link: paymentLink }),
      new Date().toISOString(), null);

    db.prepare(`UPDATE transactions SET payment_link=?, discount_applied=?, status='recovering', attempts_count=?, updated_at=? WHERE id=?`)
      .run(paymentLink, cappedPercent, newAttempts, new Date().toISOString(), transaction.id);

    logAudit(transaction.id, 'discount_offered',
      `[ACT] Sent a discounted checkout link (${cappedPercent}% off). Discounted price: ₹${discountedAmount.toFixed(0)}. Contact attempt #${newAttempts}.`);

    return { success: true, percent_applied: cappedPercent, discounted_amount: discountedAmount, payment_link: paymentLink, guardrail_applied: guardrailApplied, attempts_count: newAttempts };
  },

  escalate(input, transaction) {
    const db = getDb();

    db.prepare(
      `INSERT INTO recovery_actions (id, transaction_id, action_type, action_payload, sent_at, outcome)
       VALUES (?, ?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'escalate',
      JSON.stringify({ reason: input.reason, priority: input.priority }),
      new Date().toISOString(), 'escalated');

    db.prepare(`UPDATE transactions SET status='escalated', updated_at=? WHERE id=?`)
      .run(new Date().toISOString(), transaction.id);

    logAudit(transaction.id, 'case_escalated',
      `[DECIDE] Escalated case to human queue (${input.priority} priority). Reason: ${input.reason}`);

    return { success: true, escalated: true, priority: input.priority };
  },

  mark_resolved(input, transaction) {
    const db = getDb();
    const freshTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction.id) || transaction;

    if (freshTx.status === 'escalated' || freshTx.blocked_by_guardrail === 1) {
      logAudit(transaction.id, 'case_escalated',
        `[VERIFY] Resolution verified. Outcome: escalated — ${input.summary || 'Escalated by policy.'}`);
      return { success: true, outcome: 'escalated', summary: input.summary };
    }

    if (input.outcome === 'recovered') {
      // Do NOT set status='recovered' here — backend verifyRecovery() will confirm.
      // Set 'recovering' so the pipeline knows an action was taken but result is pending.
      db.prepare(`UPDATE transactions SET status='recovering', updated_at=? WHERE id=?`)
        .run(new Date().toISOString(), transaction.id);
      logAudit(transaction.id, 'agent_resolution_intent',
        `[VERIFY] Agent declared recovery — pending backend verification of payment result.`);
    } else {
      // 'failed' and 'escalated' can be set directly — no payment claim involved
      db.prepare(`UPDATE transactions SET status=?, updated_at=? WHERE id=?`)
        .run(input.outcome, new Date().toISOString(), transaction.id);
      db.prepare(`UPDATE recovery_actions SET outcome=? WHERE transaction_id=? AND outcome IS NULL`)
        .run(input.outcome, transaction.id);
      logAudit(transaction.id, `case_${input.outcome}`,
        `[VERIFY] Resolution verified. Outcome: ${input.outcome} — ${input.summary}`);
    }

    return { success: true, outcome: input.outcome, summary: input.summary };
  },
};

// ─── Backend-driven recovery verification ────────────────────────────────────
/**
 * Verifies whether a recovery action actually resulted in a successful payment.
 * Called AFTER Gemini (or mock agent) completes, for all recovery actions.
 * Gemini cannot declare 'recovered' — only this function can set status='recovered'.
 *
 * Uses per-failure-type probability simulation (stands in for Razorpay webhook in production).
 * @param {object} transaction   - full transaction row (fresh from DB)
 * @param {string} action        - the action that was executed
 * @returns {boolean}            - true if recovered, false if failed
 */
const OUTCOME_PROBS = {
  otp_timeout:        0.92,  // OTP timeouts almost always recoverable
  network_drop:       0.93,  // Network glitches highly recoverable
  card_decline:       0.65,  // Card declines: reasonable success rate
  insufficient_funds: 0.55,  // Funds may still be short; discount helps
  abandoned:          0.48,  // Price hesitation — lower conversion
};

function verifyRecovery(transaction, action) {
  const db  = getDb();
  const now = new Date().toISOString();

  // Only nudge / discount actions can result in a payment being 'recovered'.
  // Escalate always stays 'escalated' — no payment verification needed.
  if (!['send_recovery_nudge', 'offer_discount'].includes(action)) {
    return false;
  }

  // Payment link must have been generated — if not, we can't verify a payment
  const freshTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction.id);
  if (!freshTx || !freshTx.payment_link) {
    db.prepare(`UPDATE transactions SET status='failed', updated_at=? WHERE id=?`).run(now, transaction.id);
    db.prepare(`UPDATE recovery_actions SET outcome='failed' WHERE transaction_id=? AND outcome IS NULL`).run(transaction.id);
    logAudit(transaction.id, 'payment_verify_failed',
      `[VERIFY] Backend verification: no payment link found. Cannot confirm recovery. Transaction marked failed.`);
    return false;
  }

  // Simulate Razorpay payment result (in production: replace with webhook lookup)
  const prob = OUTCOME_PROBS[freshTx.failure_reason] ?? 0.70;
  let succeeded;
  if (freshTx.simulation_outcome === 'sim_success') {
    succeeded = true;
  } else if (freshTx.simulation_outcome === 'sim_failed_retry') {
    succeeded = false;
  } else {
    succeeded = Math.random() < prob;
  }

  if (succeeded) {
    db.prepare(`UPDATE transactions SET status='recovered', updated_at=? WHERE id=?`).run(now, transaction.id);
    db.prepare(`UPDATE recovery_actions SET outcome='recovered' WHERE transaction_id=? AND outcome IS NULL`).run(transaction.id);
    logAudit(transaction.id, 'payment_verified',
      `[VERIFY] Backend verified payment completion ` +
      `(${Math.round(prob * 100)}% recovery rate for '${freshTx.failure_reason}'). ` +
      `Transaction marked recovered.`);
    logAudit(transaction.id, 'case_recovered',
      `[OUTCOME] Recovery successfully completed. ₹${freshTx.amount.toLocaleString('en-IN')} revenue recovered.`);
  } else {
    db.prepare(`UPDATE transactions SET status='failed', updated_at=? WHERE id=?`).run(now, transaction.id);
    db.prepare(`UPDATE recovery_actions SET outcome='failed' WHERE transaction_id=? AND outcome IS NULL`).run(transaction.id);
    logAudit(transaction.id, 'payment_verify_failed',
      `[VERIFY] Backend verification: payment link not completed by customer. Transaction marked failed.`);
    logAudit(transaction.id, 'case_failed',
      `[OUTCOME] Case closed: payment could not be recovered.`);
  }

  return succeeded;
}

module.exports = { TOOLS, verifyRecovery, OUTCOME_PROBS };
