'use strict';
/**
 * trace.js
 * GET /api/agent/trace/:id
 *
 * Returns a structured, semantically typed Agent Execution Timeline for a
 * given transaction, built entirely from the existing audit_log,
 * agent_decisions, and recovery_actions tables — no new DB writes.
 *
 * Timeline event shape:
 * {
 *   id:        string  (unique within this response)
 *   phase:     string  (DETECTED | PRE_CHECK | BLOCKED | MODEL | DIAGNOSING |
 *                       TOOL_CALL | DIAGNOSIS | DECISION | GUARDRAIL | ACTION |
 *                       VERIFYING | VERIFIED | OUTCOME)
 *   title:     string  (concise human label)
 *   detail:    string  (structured detail text, no raw prompts)
 *   timestamp: string  (ISO-8601)
 *   pass:      bool?   (for guardrail/check nodes: did it pass?)
 *   outcome:   string? (for outcome node: 'recovered'|'escalated'|'failed')
 * }
 */

const express = require('express');
const router  = express.Router();
const { getDb } = require('../db/database');

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fmt(amount) {
  return '₹' + Number(amount).toLocaleString('en-IN');
}

const FAILURE_LABELS = {
  card_decline:       'Card Decline',
  otp_timeout:        'OTP Timeout',
  insufficient_funds: 'Insufficient Funds',
  network_drop:       'Network Drop',
  abandoned:          'Cart Abandoned',
};

const GUARDRAIL_LABELS = {
  HIGH_VALUE_THRESHOLD:  `Exceeds autonomous limit of ₹25,000`,
  HIGH_RISK_SCORE:       `Risk score ≥ 85 — too elevated for autonomous action`,
  MAX_ATTEMPTS_EXCEEDED: `Maximum contact attempts (2) already reached`,
  COOLDOWN_ACTIVE:       `Action taken less than 30 min ago — cooldown active`,
  DISCOUNT_CAPPED:       `AI-requested discount capped at policy maximum (10%)`,
  discount_capped_at_10pct: `AI-requested discount capped at policy maximum (10%)`,
  action_guardrail_applied: `Action guardrail applied`,
};

const ACTION_LABELS = {
  send_recovery_nudge: 'send_recovery_nudge()',
  offer_discount:      'offer_discount()',
  escalate:            'escalate()',
  email_nudge:         'send_recovery_nudge()',
  discount_offer:      'offer_discount()',
};

// ─── Main builder ─────────────────────────────────────────────────────────────
function buildTrace(tx, decisions, actions, auditLog) {
  const events = [];
  let seq = 0;
  const id = () => `evt-${seq++}`;

  const decision = decisions[0] || null;
  const action   = actions[0]   || null;

  const guardrailCode   = decision?.guardrails_applied || null;
  const chosenAction    = decision?.chosen_action || null;
  const reasoningText   = decision?.reasoning_text || '';
  const isPreCheckBlock = tx.blocked_by_guardrail === 1 && (
    guardrailCode === 'HIGH_VALUE_THRESHOLD' ||
    guardrailCode === 'HIGH_RISK_SCORE'
  );

  // Parse reasoning: the combined reasoning_text is "<diagReasoning> <actionReasoning>"
  // We split it at the first sentence boundary to separate diagnosis from action rationale.
  let diagReasoning = reasoningText;
  let actionReasoning = '';
  if (reasoningText) {
    // For pre-check blocks, reasoning is just the guardrail message
    if (!isPreCheckBlock) {
      // Find audit record that contains the actual diagnosis reasoning
      const diagAudit = auditLog.find(e => e.event_type === 'agent_diagnosis');
      if (diagAudit) {
        // Extract reasoning from: "[DIAGNOSE] Diagnosed failure reason as X (Risk Score: N). Rationale: <reasoning>"
        const match = diagAudit.event_detail.match(/Rationale:\s*(.+)$/s);
        if (match) diagReasoning = match[1].trim();
      }
      // Action reasoning: look for what the agent selected
      actionReasoning = reasoningText.replace(diagReasoning, '').trim();
      if (!actionReasoning || actionReasoning.length < 5) actionReasoning = '';
    }
  }

  // ── 1. DETECTED ─────────────────────────────────────────────────────────────
  const detectAudit = auditLog.find(e => e.event_type === 'payment_failed');
  events.push({
    id: id(), phase: 'DETECTED',
    title: 'Payment failure detected',
    detail: `${FAILURE_LABELS[tx.failure_reason] || tx.failure_reason} · ${fmt(tx.amount)} · Risk score: ${tx.risk_score}/100`,
    timestamp: detectAudit?.timestamp || tx.created_at,
  });

  // ── 2. PRE-CHECK GUARDRAIL ───────────────────────────────────────────────────
  const preCheckAudit = auditLog.find(e =>
    e.event_type === 'guardrail_triggered' &&
    e.event_detail.includes('Pre-check')
  ) || auditLog.find(e =>
    e.event_type === 'guardrail_passed' &&
    e.event_detail.includes('Pre-check')
  );

  if (isPreCheckBlock) {
    // Pre-check blocked — Gemini never called
    const blockLabel = GUARDRAIL_LABELS[guardrailCode] || 'Policy threshold exceeded';
    events.push({
      id: id(), phase: 'PRE_CHECK',
      title: 'Pre-check guardrail evaluated',
      detail: `Amount: ${fmt(tx.amount)} · Risk score: ${tx.risk_score}/100`,
      timestamp: preCheckAudit?.timestamp || detectAudit?.timestamp || tx.created_at,
      pass: false,
    });
    events.push({
      id: id(), phase: 'BLOCKED',
      title: 'Autonomous recovery blocked',
      detail: blockLabel + ` — Gemini was not called. Case sent to human review.`,
      timestamp: preCheckAudit?.timestamp || tx.created_at,
      pass: false,
      geminiCalled: false,
    });
    // Final escalation outcome
    const escalateAudit = auditLog.find(e => e.event_type === 'case_escalated');
    events.push({
      id: id(), phase: 'OUTCOME',
      title: 'Escalated to human review',
      detail: `Case queued for manual review. No automated action was taken.`,
      timestamp: escalateAudit?.timestamp || tx.updated_at,
      outcome: 'escalated',
    });
    return events;
  }

  // Pre-check passed
  events.push({
    id: id(), phase: 'PRE_CHECK',
    title: 'Pre-check: within autonomous limits',
    detail: `Amount: ${fmt(tx.amount)} ≤ ₹25,000 ✓ · Risk score: ${tx.risk_score}/100 < 85 ✓ → Proceeding to AI diagnosis`,
    timestamp: preCheckAudit?.timestamp || tx.created_at,
    pass: true,
  });

  // ── 3. MODEL SELECTED ────────────────────────────────────────────────────────
  // Derive model info from audit_log model_fallback events or agent_decisions
  const modelFallbackAudit = auditLog.find(e => e.event_type === 'model_fallback');
  let modelLabel = 'Gemini AI';
  if (modelFallbackAudit) {
    // e.g. "[MODEL_ROUTER] Completed on fallback model: Gemini 3.5 Flash Lite."
    const m = modelFallbackAudit.event_detail.match(/fallback model:\s*([^.]+)/);
    if (m) modelLabel = m[1].trim();
    else {
      const m2 = modelFallbackAudit.event_detail.match(/→\s*([^.]+)\./);
      if (m2) modelLabel = m2[1].trim();
    }
  } else if (decision && !modelFallbackAudit) {
    // No fallback recorded → primary model was used
    modelLabel = 'Gemini 3.1 Flash Lite';
  }
  const isMock = decision && decision.reasoning_text && !modelFallbackAudit &&
    auditLog.every(e => e.event_type !== 'model_fallback');

  const diagAuditTs = auditLog.find(e => e.event_type === 'agent_diagnosis')?.timestamp;
  events.push({
    id: id(), phase: 'MODEL',
    title: `${isMock ? 'Mock agent' : modelLabel} selected`,
    detail: isMock
      ? 'Running rule-based mock agent (no Gemini API key configured)'
      : `${modelLabel} analyzing transaction`,
    timestamp: diagAuditTs || tx.created_at,
  });

  // ── 4. TOOL CALL — diagnose_failure ──────────────────────────────────────────
  events.push({
    id: id(), phase: 'TOOL_CALL',
    title: 'diagnose_failure() called',
    detail: `Agent called diagnose_failure tool to identify the root cause`,
    timestamp: diagAuditTs || tx.created_at,
  });

  // ── 5. DIAGNOSIS RESULT ──────────────────────────────────────────────────────
  const diagnosisLabel = FAILURE_LABELS[decision?.diagnosis] || decision?.diagnosis || FAILURE_LABELS[tx.failure_reason] || tx.failure_reason;
  events.push({
    id: id(), phase: 'DIAGNOSIS',
    title: `Root cause: ${diagnosisLabel}`,
    detail: diagReasoning || `Failure diagnosed as ${diagnosisLabel} with ${decision?.diagnosis_confidence || 'high'} confidence.`,
    timestamp: diagAuditTs || tx.created_at,
  });

  // ── 6. DECISION ──────────────────────────────────────────────────────────────
  if (decision) {
    const actionDisplayLabel = ACTION_LABELS[chosenAction] || (chosenAction?.replace(/_/g, ' ') || 'action');
    let decisionDetail = `Selected action: ${actionDisplayLabel}`;
    if (actionReasoning) decisionDetail += `\n${actionReasoning}`;
    events.push({
      id: id(), phase: 'DECISION',
      title: `Selected: ${actionDisplayLabel}`,
      detail: decisionDetail,
      timestamp: diagAuditTs || tx.created_at,
    });
  }

  // ── 7. ACTION GUARDRAIL CHECK ────────────────────────────────────────────────
  const actionGuardrailAudit = auditLog.find(e =>
    (e.event_type === 'guardrail_triggered' && !e.event_detail.includes('Pre-check')) ||
    (e.event_type === 'guardrail_passed' && !e.event_detail.includes('Pre-check'))
  );

  const isActionGuardrailBlock = tx.blocked_by_guardrail === 1 && !isPreCheckBlock;
  const actionGuardrailTs = actionGuardrailAudit?.timestamp || diagAuditTs || tx.created_at;

  const riskPass    = tx.risk_score < 85;
  const amountPass  = tx.amount <= 25000;
  const attemptsPass = tx.attempts_count < 2;
  const discountPass = guardrailCode !== 'discount_capped_at_10pct' && guardrailCode !== 'DISCOUNT_CAPPED';

  if (isActionGuardrailBlock) {
    // Action guardrail blocked — show what was proposed and why it was rejected
    const blockReason = GUARDRAIL_LABELS[guardrailCode] || 'Guardrail policy blocked this action';
    const proposedLabel = ACTION_LABELS[chosenAction] || chosenAction || 'action';
    events.push({
      id: id(), phase: 'GUARDRAIL',
      title: 'Action guardrail check',
      detail: [
        `Risk score: ${tx.risk_score}/100 ${riskPass ? '✓' : '✗'}`,
        `Amount: ${fmt(tx.amount)} ${amountPass ? '✓' : '✗'}`,
        `Attempts: ${tx.attempts_count}/2 ${attemptsPass ? '✓' : '✗'}`,
      ].join(' · '),
      timestamp: actionGuardrailTs,
      pass: false,
    });
    events.push({
      id: id(), phase: 'BLOCKED',
      title: `${proposedLabel} blocked by guardrail`,
      detail: `Proposed action: ${proposedLabel}\nGuardrail: ${blockReason}\nThe action was not executed. Case escalated to human review.`,
      timestamp: actionGuardrailTs,
      pass: false,
    });
    const escalateAudit = auditLog.find(e => e.event_type === 'case_escalated');
    events.push({
      id: id(), phase: 'OUTCOME',
      title: 'Escalated to human review',
      detail: `Case queued for manual review after guardrail rejection.`,
      timestamp: escalateAudit?.timestamp || tx.updated_at,
      outcome: 'escalated',
    });
    return events;
  }

  // Normal path — action guardrail passed (or discount capped but allowed)
  const guardrailDetailParts = [
    `Risk: ${tx.risk_score}/100 ${riskPass ? '✓' : '✗'}`,
    `Amount: ${fmt(tx.amount)} ${amountPass ? '✓' : '✗'}`,
    `Attempts: ${tx.attempts_count}/2 ${attemptsPass ? '✓' : '✗'}`,
  ];
  if (chosenAction === 'offer_discount') {
    guardrailDetailParts.push(`Discount cap: ${discountPass ? '✓' : 'CAPPED at 10%'}`);
  }

  events.push({
    id: id(), phase: 'GUARDRAIL',
    title: 'Action guardrail: passed',
    detail: guardrailDetailParts.join(' · '),
    timestamp: actionGuardrailTs,
    pass: true,
  });

  // ── 8. ACTION EXECUTION ──────────────────────────────────────────────────────
  const actionAudit = auditLog.find(e =>
    e.event_type === 'nudge_sent' ||
    e.event_type === 'discount_offered' ||
    (e.event_type === 'case_escalated' && !isPreCheckBlock && !isActionGuardrailBlock)
  );
  const actionTs = actionAudit?.timestamp || tx.updated_at;

  if (action) {
    const actionName = ACTION_LABELS[action.action_type] || action.action_type?.replace(/_/g, ' ');
    let actionDetail = `${actionName} executed`;
    if (action.action_payload) {
      const p = action.action_payload;
      if (p.tone)    actionDetail += ` · Tone: ${p.tone}`;
      if (p.percent) actionDetail += ` · Discount: ${p.percent}%`;
      if (p.discounted_amount) actionDetail += ` → ${fmt(p.discounted_amount)}`;
      if (p.payment_link) actionDetail += `\nPayment link generated`;
    }
    events.push({
      id: id(), phase: 'ACTION',
      title: actionName,
      detail: actionDetail,
      timestamp: actionTs,
    });
  } else if (chosenAction) {
    events.push({
      id: id(), phase: 'ACTION',
      title: ACTION_LABELS[chosenAction] || chosenAction,
      detail: `${ACTION_LABELS[chosenAction] || chosenAction} executed`,
      timestamp: actionTs,
    });
  }

  // ── 9. VERIFICATION ──────────────────────────────────────────────────────────
  const verifyAudit = auditLog.find(e =>
    e.event_type === 'payment_verified' ||
    e.event_type === 'payment_verify_failed' ||
    e.event_type === 'agent_resolution_intent'
  );
  if (verifyAudit) {
    events.push({
      id: id(), phase: 'VERIFYING',
      title: 'Checking payment outcome',
      detail: 'Backend verifying whether customer completed payment via the recovery link',
      timestamp: verifyAudit.timestamp,
    });
  }

  // ── 10. FINAL OUTCOME ────────────────────────────────────────────────────────
  const outcomeAudit = auditLog.find(e =>
    e.event_type === 'case_recovered' ||
    e.event_type === 'case_failed' ||
    e.event_type === 'payment_verify_failed'
  );
  const outcomeTs = outcomeAudit?.timestamp || tx.updated_at;

  if (tx.status === 'recovered') {
    events.push({
      id: id(), phase: 'OUTCOME',
      title: `${fmt(tx.amount)} recovered`,
      detail: `Payment confirmed by backend verification. Revenue successfully recovered.`,
      timestamp: outcomeTs,
      outcome: 'recovered',
    });
  } else if (tx.status === 'escalated') {
    events.push({
      id: id(), phase: 'OUTCOME',
      title: 'Escalated to human review',
      detail: `Case queued for manual review.`,
      timestamp: outcomeTs,
      outcome: 'escalated',
    });
  } else if (tx.status === 'failed' || tx.status === 'recovering') {
    events.push({
      id: id(), phase: 'OUTCOME',
      title: 'Recovery unsuccessful',
      detail: `Customer did not complete payment via the recovery link. Case flagged for follow-up.`,
      timestamp: outcomeTs,
      outcome: 'failed',
    });
  }

  return events;
}

// ─── Route ────────────────────────────────────────────────────────────────────
router.get('/:id', (req, res) => {
  try {
    const db = getDb();
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });

    const decisions = db.prepare(
      'SELECT * FROM agent_decisions WHERE transaction_id = ? ORDER BY created_at'
    ).all(tx.id);

    const rawActions = db.prepare(
      'SELECT * FROM recovery_actions WHERE transaction_id = ? ORDER BY sent_at'
    ).all(tx.id);

    const actions = rawActions.map(a => ({
      ...a,
      action_payload: a.action_payload ? JSON.parse(a.action_payload) : null,
    }));

    const auditLog = db.prepare(
      'SELECT * FROM audit_log WHERE transaction_id = ? ORDER BY timestamp'
    ).all(tx.id);

    const timeline = buildTrace(tx, decisions, actions, auditLog);

    res.json({ transaction: tx, timeline });
  } catch (err) {
    console.error('Trace error:', err);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
