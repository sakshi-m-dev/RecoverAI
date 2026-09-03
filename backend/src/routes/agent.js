const express = require('express');
const router  = express.Router();
const { v4: uuidv4 } = require('uuid');
const { getDb }          = require('../db/database');
const { TOOLS, verifyRecovery } = require('../tools');
const { evaluatePreCheck, evaluateActionGuardrail, evaluatePolicy } = require('../middleware/guardrails');
const {
  MODEL_CHAIN, waitMsFor, recordRequest, blockUntil,
  parseRetryAfterMs, isRateLimit, isRetryable, labelOf,
} = require('../lib/modelRouter');

// ─── Gemini SDK (optional — loaded at module init) ────────────────────────────
let GoogleGenerativeAI, SchemaType;
try { ({ GoogleGenerativeAI, SchemaType } = require('@google/generative-ai')); } catch (_) {}

const SYSTEM_PROMPT = `You are RecoverAI, a warm and effective AI revenue recovery agent for an Indian fintech platform.

Your mission: Recover failed payments, checkout drop-offs, and subscription renewal failures.

Process (always in this order):
1. Call diagnose_failure FIRST to understand why the transaction failed / abandoned.
2. Take ONE appropriate action: send_recovery_nudge, offer_discount, or escalate.
3. Call mark_resolved LAST to close the case.

Tone:
- Warm, plain-spoken, slightly witty — never corporate, never robotic
- Use the customer's first name
- Explain *why*, not just *what*
- Be honest about failures — same calm tone as successes
- Celebrate wins naturally (a well-placed 🎉 is enough)

Action guide:
- otp_timeout / network_drop / renewal bank drops → send_recovery_nudge (gentle tone)
- card_decline → send_recovery_nudge or small discount depending on your read
- insufficient_funds → offer_discount (5–10%) — they want to pay, just need breathing room
- abandoned → gentle nudge or small discount
- High-value or repeated failure cases → escalate

Hard rules:
- Maximum discount: 10%. The code will cap it, but don't even try to go higher.
- One action per case.
- Never be pushy or shame the customer.`;

// ─── Mock agent ──────────────────────────────────────────────────────────────
function runMockAgent(transaction, onStep) {
  const firstName = transaction.customer_name.split(' ')[0];
  const amt = `₹${transaction.amount.toLocaleString('en-IN')}`;

  const scenarios = {
    otp_timeout: {
      diagnosis: 'otp_timeout',
      diagReasoning: `${firstName}'s payment dropped on an OTP timeout — that's just the bank's SMS being slow, not hesitation. This one's almost certainly salvageable.`,
      action: 'send_recovery_nudge', tone: 'gentle',
      actionMsg: `Hi ${firstName}, your OTP expired before the payment could go through — not your fault at all. Here's a fresh link whenever you're ready. No pressure.`,
      actionReasoning: "OTP timeouts are almost never the customer's fault. A gentle, no-pressure nudge works best here.",
      outcomeProb: 0.92,
      summaryWin: `Sent a gentle nudge for the OTP timeout — ${firstName} came right back. ₹${transaction.amount.toLocaleString('en-IN')} recovered.`,
      summaryFail: `Sent a retry link but no response yet. Leaving it — no point pushing further.`,
    },
    card_decline: {
      diagnosis: 'card_decline',
      diagReasoning: `${firstName}'s card was declined — likely a temporary block or wrong credentials. Worth a retry with a fresh attempt.`,
      action: 'send_recovery_nudge', tone: 'friendly',
      actionMsg: `Hey ${firstName}, your payment for ${amt} didn't go through — looks like a card hiccup. Here's a fresh link to try again, or use a different payment method.`,
      actionReasoning: "Card declines are usually transient. A friendly retry link is all it takes.",
      outcomeProb: 0.65,
      summaryWin: `Sent retry link to ${firstName} after card decline — payment came through on the second attempt.`,
      summaryFail: `Sent retry link but card declined again. Flagging for manual follow-up.`,
    },
    insufficient_funds: {
      diagnosis: 'insufficient_funds',
      diagReasoning: `Looks like ${firstName} was short on funds at the time — they clearly want to buy, just need a little breathing room.`,
      action: 'offer_discount', percent: 8,
      actionReasoning: "An 8% discount might bridge the gap. Well within the 10% cap and likely to convert.",
      actionMsg: `Hi ${firstName}, we noticed the payment didn't go through. We'd love to help — here's a special 8% discount just for you.`,
      outcomeProb: 0.55,
      summaryWin: `Offered 8% discount to ${firstName} — converted successfully.`,
      summaryFail: `Offered 8% discount but no conversion. Flagging for human follow-up instead of pushing further.`,
    },
    network_drop: {
      diagnosis: 'network_drop',
      diagReasoning: `Payment gateway connection dropped mid-flow for ${firstName}. They meant to pay — this was just bad timing on the network.`,
      action: 'send_recovery_nudge', tone: 'gentle',
      actionMsg: `Hey ${firstName}, your payment got cut off by a network glitch — nothing on your end. Here's a fresh link to complete it.`,
      actionReasoning: "Network drops are 100% not the customer's fault. A simple retry link is all we need.",
      outcomeProb: 0.93,
      summaryWin: `Network drop recovery — sent ${firstName} a fresh link and they completed the payment.`,
      summaryFail: `Sent retry link but network issues may persist. Escalating to check payment gateway.`,
    },
    abandoned: {
      diagnosis: 'abandoned',
      diagReasoning: `${firstName} dropped off at checkout. Could be price hesitation, distraction, or just got pulled away. ${transaction.amount > 5000 ? "High amount — a small discount might tip the scales." : "A friendly nudge should do it."}`,
      action: transaction.amount > 3000 ? 'offer_discount' : 'send_recovery_nudge',
      percent: 7, tone: 'friendly',
      actionMsg: `Hey ${firstName}, you left something in your cart — we saved it for you. ${transaction.amount > 3000 ? "Here's a little something to make it easier." : "Come back whenever you're ready!"}`,
      actionReasoning: transaction.amount > 3000
        ? "High-value abandoned cart. A 7% discount is worth the conversion."
        : "Low-friction nudge for a smaller cart. No need to discount.",
      outcomeProb: 0.48,
      summaryWin: `Warm nudge worked — ${firstName} came back and completed the purchase.`,
      summaryFail: `Tried a reminder and a small discount for ${firstName} — no luck. Flagging for manual follow-up instead of pushing further.`,
    },
  };

  const sc = scenarios[transaction.failure_reason] || scenarios.abandoned;

  let didRecover = Math.random() < sc.outcomeProb;
  let forceOutcome = null;

  if (transaction.simulation_outcome === 'sim_success') {
    didRecover = true;
    forceOutcome = 'recovered';
  } else if (transaction.simulation_outcome === 'sim_failed_retry') {
    didRecover = false;
    forceOutcome = 'failed';
  }

  const outcome = forceOutcome || (didRecover ? 'recovered' : (sc.action === 'escalate' || Math.random() < 0.15 ? 'escalated' : 'failed'));

  // Step 1: diagnose
  const diagResult = TOOLS.diagnose_failure(
    { diagnosis: sc.diagnosis, confidence: 'high', reasoning: sc.diagReasoning },
    transaction
  );
  onStep && onStep({ type: 'step', step: 'diagnosed', data: { ...diagResult, reasoning: sc.diagReasoning } });

  // Step 2: ACTION GUARDRAIL CHECK (Stage 2)
  const actionGuardrail = evaluateActionGuardrail(transaction, sc.action, sc.percent);
  let actionResult;
  let actualAction = sc.action;
  let actualActionReasoning = sc.actionReasoning;

  if (!actionGuardrail.allowed) {
    const db = getDb();
    db.prepare(`UPDATE transactions SET blocked_by_guardrail=1, status='escalated', updated_at=? WHERE id=?`)
      .run(new Date().toISOString(), transaction.id);
    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'guardrail_triggered',
      `[GUARDRAIL] Action guardrail blocked ${sc.action}: ${actionGuardrail.reason} Escalating to human review.`,
      new Date().toISOString()
    );

    onStep && onStep({ type: 'step', step: 'policy_checked', data: { allowed: false, reason: actionGuardrail.reason, code: actionGuardrail.code } });
    actualAction = 'escalate';
    actualActionReasoning = actionGuardrail.reason;
    actionResult = TOOLS.escalate({ reason: actionGuardrail.reason, priority: 'high' }, transaction);
    onStep && onStep({ type: 'step', step: 'action_taken', action: 'escalate', data: actionResult });
  } else {
    onStep && onStep({ type: 'step', step: 'policy_checked', data: { allowed: true, reason: actionGuardrail.reason, code: actionGuardrail.code } });
    if (sc.action === 'offer_discount') {
      actionResult = TOOLS.offer_discount({ percent: sc.percent || 8, reasoning: sc.actionReasoning }, transaction);
      onStep && onStep({ type: 'step', step: 'action_taken', action: 'offer_discount', data: actionResult });
    } else if (sc.action === 'escalate') {
      actionResult = TOOLS.escalate({ reason: sc.diagReasoning, priority: 'medium' }, transaction);
      onStep && onStep({ type: 'step', step: 'action_taken', action: 'escalate', data: actionResult });
    } else {
      actionResult = TOOLS.send_recovery_nudge({ tone: sc.tone || 'gentle', message: sc.actionMsg }, transaction);
      onStep && onStep({ type: 'step', step: 'action_taken', action: 'send_recovery_nudge', data: actionResult });
    }
  }

  // Step 3: BACKEND-DRIVEN VERIFICATION
  let finalOutcome = 'failed';
  let summary = '';
  if (actualAction === 'escalate') {
    finalOutcome = 'escalated';
    summary = `Case escalated to human review: ${actualActionReasoning}`;
    TOOLS.mark_resolved({ outcome: 'escalated', summary }, transaction);
  } else {
    const verified = verifyRecovery(transaction, actualAction);
    finalOutcome = verified ? 'recovered' : 'failed';
    summary = verified ? sc.summaryWin : sc.summaryFail;
  }
  onStep && onStep({ type: 'step', step: 'resolved', data: { outcome: finalOutcome, summary } });

  // Save decision
  const db = getDb();
  db.prepare(
    `INSERT INTO agent_decisions (id, transaction_id, diagnosis, diagnosis_confidence, chosen_action, reasoning_text, guardrails_applied, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(), transaction.id,
    sc.diagnosis, 'high',
    actualAction, `${sc.diagReasoning} ${actualActionReasoning}`,
    actionResult.guardrail_applied ? 'discount_capped_at_10pct' : null,
    new Date().toISOString()
  );

  return {
    outcome: finalOutcome,
    diagnosis: sc.diagnosis,
    diagnosisReasoning: sc.diagReasoning,
    action: actualAction,
    actionReasoning: actualActionReasoning,
    summary,
    paymentLink: actionResult.payment_link || null,
    discountApplied: actualAction === 'offer_discount' ? (sc.percent || 8) : null,
  };
}

// ─── Module-level singletons (built once; avoids per-call SDK re-init) ─────────
let _genAI       = null;
let _geminiTools = null;

function _getGenAI() {
  if (!_genAI && GoogleGenerativeAI && process.env.GEMINI_API_KEY?.trim().length > 5)
    _genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
  return _genAI;
}

function _getGeminiTools() {
  if (_geminiTools || !SchemaType) return _geminiTools;
  _geminiTools = [{
    functionDeclarations: [
      {
        name: 'diagnose_failure',
        description: 'Analyze a failed payment and diagnose the root cause. Call this FIRST.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            diagnosis: { type: SchemaType.STRING, enum: ['card_decline', 'otp_timeout', 'insufficient_funds', 'network_drop', 'abandoned'], description: 'Root cause of the failure' },
            confidence: { type: SchemaType.STRING, enum: ['high', 'medium', 'low'] },
            reasoning:  { type: SchemaType.STRING, description: 'Warm, plain-language explanation (1-2 sentences, use customer first name)' },
          },
          required: ['diagnosis', 'confidence', 'reasoning'],
        },
      },
      {
        name: 'send_recovery_nudge',
        description: 'Send a gentle recovery nudge email with a retry link.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            tone:    { type: SchemaType.STRING, enum: ['gentle', 'friendly', 'urgent'] },
            message: { type: SchemaType.STRING, description: 'Warm, conversational message (2 sentences max)' },
          },
          required: ['tone', 'message'],
        },
      },
      {
        name: 'offer_discount',
        description: 'Offer a discount. HARD MAXIMUM: 10%. Never offer more.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            percent:   { type: SchemaType.NUMBER, description: 'Discount percentage (max 10)' },
            reasoning: { type: SchemaType.STRING, description: 'Why a discount makes sense here' },
          },
          required: ['percent', 'reasoning'],
        },
      },
      {
        name: 'escalate',
        description: 'Escalate to human review when automated recovery is not appropriate.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            reason:   { type: SchemaType.STRING, description: 'Plain, honest explanation for the human reviewer' },
            priority: { type: SchemaType.STRING, enum: ['high', 'medium', 'low'] },
          },
          required: ['reason', 'priority'],
        },
      },
      {
        name: 'mark_resolved',
        description: 'Mark the case as resolved. Always call this LAST.',
        parameters: {
          type: SchemaType.OBJECT,
          properties: {
            outcome: { type: SchemaType.STRING, enum: ['recovered', 'failed', 'escalated'] },
            summary: { type: SchemaType.STRING, description: 'Honest 1-sentence summary of what happened' },
          },
          required: ['outcome', 'summary'],
        },
      },
    ],
  }];
  return _geminiTools;
}

// ─── Gemini agent ─────────────────────────────────────────────────────────────
// modelId is passed in by the cascade logic in processTransaction.
async function runGeminiAgent(transaction, onStep, modelId) {
  const genAI       = _getGenAI();
  const geminiTools = _getGeminiTools();
  const db          = getDb();
  const modelLabel  = labelOf(modelId);


  const model = genAI.getGenerativeModel({
    model: modelId,
    systemInstruction: SYSTEM_PROMPT,
    tools: geminiTools,
    toolConfig: { functionCallingConfig: { mode: 'AUTO' } },
  });

  const chat = model.startChat({ history: [] });

  const userMessage =
    `Please recover this failed payment:\n\n` +
    `Customer: ${transaction.customer_name}\n` +
    `Email: ${transaction.customer_email}\n` +
    `Amount: \u20B9${transaction.amount.toLocaleString('en-IN')}\n` +
    `Failure reason: ${transaction.failure_reason}\n` +
    `Transaction ID: ${transaction.id}\n` +
    `Date: ${new Date(transaction.created_at).toLocaleDateString('en-IN')}`;

  let rawOutcome = 'failed', diagnosisReasoning = '', action = '', actionReasoning = '',
      summary = '', paymentLink = null, discountApplied = null;
  let currentMessage = userMessage;

  // Each round = one LLM call (diagnose → action → resolve = 3 rounds minimum).
  for (let round = 0; round < 6; round++) {
    const response      = await chat.sendMessage(currentMessage);
    const responseParts = response.response.candidates[0].content.parts;

    const functionCalls = responseParts.filter(p => p.functionCall);
    if (!functionCalls.length) break;

    const toolResultParts = [];
    let   resolved        = false;

    for (const part of functionCalls) {
      const { name, args } = part.functionCall;
      let result;

      if (name === 'diagnose_failure') {
        result = TOOLS.diagnose_failure(args, transaction);
        diagnosisReasoning = args.reasoning || '';
        onStep && onStep({ type: 'step', step: 'diagnosed', data: { ...args, model: modelId, modelLabel } });

      } else if (['send_recovery_nudge', 'offer_discount', 'escalate'].includes(name)) {
        // ── Stage 2: ACTION GUARDRAILS (Before Tool Execution) ─────────────
        const freshTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction.id) || transaction;
        const actionGuardrail = evaluateActionGuardrail(freshTx, name, args.percent);

        if (!actionGuardrail.allowed) {
          // Blocked by deterministic policy code — Gemini cannot bypass
          db.prepare(`UPDATE transactions SET blocked_by_guardrail=1, status='escalated', updated_at=? WHERE id=?`)
            .run(new Date().toISOString(), transaction.id);
          db.prepare(
            `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
             VALUES (?, ?, ?, ?, ?)`
          ).run(uuidv4(), transaction.id, 'guardrail_triggered',
            `[GUARDRAIL] Action guardrail blocked ${name}: ${actionGuardrail.reason} Escalating to human review.`,
            new Date().toISOString()
          );

          result = TOOLS.escalate({ reason: actionGuardrail.reason, priority: 'high' }, transaction);
          action = 'escalate';
          actionReasoning = actionGuardrail.reason;

          onStep && onStep({ type: 'step', step: 'policy_checked', data: { allowed: false, reason: actionGuardrail.reason, code: actionGuardrail.code } });
          onStep && onStep({ type: 'step', step: 'action_taken', action: 'escalate', data: result });
        } else {
          // Action allowed
          if (actionGuardrail.capped) {
            onStep && onStep({ type: 'step', step: 'policy_checked', data: { allowed: true, reason: actionGuardrail.reason, code: actionGuardrail.code } });
          } else {
            onStep && onStep({ type: 'step', step: 'policy_checked', data: { allowed: true, reason: 'All action guardrails passed.', code: 'ACTION_PASSED' } });
          }

          result = TOOLS[name](args, transaction);
          action = name;
          actionReasoning = args.reasoning || args.message || '';
          paymentLink = result.payment_link || null;
          discountApplied = result.percent_applied || null;

          onStep && onStep({ type: 'step', step: 'action_taken', action: name, data: result });
        }

      } else if (name === 'mark_resolved') {
        result = TOOLS.mark_resolved(args, transaction);
        rawOutcome = args.outcome;
        summary = args.summary;
        resolved = true;
      } else {
        result = { error: `Unknown tool: ${name}` };
      }

      toolResultParts.push({ functionResponse: { name, response: result } });
    }

    currentMessage = toolResultParts;
    if (resolved) break;
  }

  // ── Stage 3: BACKEND-DRIVEN RECOVERY VERIFICATION ───────────────────────────
  // Gemini's declaration is verified by backend code against payment link & simulation/gateway
  let finalOutcome = rawOutcome;
  const freshTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(transaction.id) || transaction;

  if (['send_recovery_nudge', 'offer_discount'].includes(action)) {
    const verified = verifyRecovery(freshTx, action);
    finalOutcome = verified ? 'recovered' : 'failed';
    summary = verified
      ? (summary && summary.length > 5 ? summary : `Payment successfully recovered for ${freshTx.customer_name}.`)
      : `Payment recovery was attempted but not completed by customer.`;
  } else if (action === 'escalate' || freshTx.status === 'escalated' || freshTx.blocked_by_guardrail === 1) {
    finalOutcome = 'escalated';
    db.prepare(`UPDATE transactions SET status='escalated', updated_at=? WHERE id=?`)
      .run(new Date().toISOString(), transaction.id);
  }

  onStep && onStep({ type: 'step', step: 'resolved', data: { outcome: finalOutcome, summary } });

  // Save agent decision record
  db.prepare(
    `INSERT INTO agent_decisions (id, transaction_id, diagnosis, diagnosis_confidence, chosen_action, reasoning_text, guardrails_applied, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    uuidv4(), transaction.id, transaction.failure_reason, 'high',
    action || 'send_recovery_nudge',
    `${diagnosisReasoning} ${actionReasoning}`.trim(),
    freshTx.blocked_by_guardrail ? 'action_guardrail_applied' : null,
    new Date().toISOString()
  );

  return { outcome: finalOutcome, diagnosisReasoning, action, actionReasoning, summary, paymentLink, discountApplied };
}

// ─── Wrapper: PRE-CHECK Guardrails & Model Cascade ───────────────────────────
async function processTransaction(transaction, onStep) {
  // ── Stage 1: PRE-CHECK Guardrails (Before Gemini) ──────────────────────────
  const preCheck = evaluatePreCheck(transaction);
  
  if (!preCheck.allowed) {
    const db = getDb();
    const auditTime = new Date().toISOString();
    const diagnosis = transaction.failure_reason;

    db.prepare(`UPDATE transactions SET status='escalated', blocked_by_guardrail=1, updated_at=? WHERE id=?`)
      .run(auditTime, transaction.id);

    db.prepare(
      `INSERT INTO agent_decisions (id, transaction_id, diagnosis, diagnosis_confidence, chosen_action, reasoning_text, guardrails_applied, created_at)
       VALUES (?, ?, ?, 'high', 'escalate', ?, ?, ?)`
    ).run(uuidv4(), transaction.id, diagnosis, `Pre-check guardrail blocked autonomous recovery: ${preCheck.reason}`, preCheck.code, auditTime);

    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'agent_diagnosis', `[DIAGNOSE] Failure reason: ${diagnosis} (Risk Score: ${transaction.risk_score}). Pre-check evaluated.`, auditTime);

    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'guardrail_triggered', `[GUARDRAIL] Pre-check failed: ${preCheck.reason} Autonomous action blocked.`, auditTime);

    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'case_escalated', `[DECIDE] High-risk/high-value policy threshold exceeded. Flagged for human review.`, auditTime);

    db.prepare(
      `INSERT INTO recovery_actions (id, transaction_id, action_type, action_payload, sent_at, outcome)
       VALUES (?, ?, 'escalate', ?, ?, 'escalated')`
    ).run(uuidv4(), transaction.id, JSON.stringify({ reason: preCheck.reason, code: preCheck.code }), auditTime);

    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'case_escalated', `[VERIFY] Resolution verified. Outcome: escalated`, auditTime);

    if (onStep) {
      onStep({ type: 'step', step: 'diagnosed', data: { diagnosis, risk_score: transaction.risk_score, reasoning: `Pre-check policy guardrails evaluated.` } });
      onStep({ type: 'step', step: 'policy_checked', data: { allowed: false, reason: preCheck.reason, code: preCheck.code } });
      onStep({ type: 'step', step: 'action_taken', action: 'escalate', data: { success: true, escalated: true, reason: preCheck.reason } });
      onStep({ type: 'step', step: 'resolved', data: { outcome: 'escalated', summary: `Recovery blocked by pre-check: ${preCheck.reason}` } });
    }

    return {
      outcome: 'escalated',
      diagnosis,
      diagnosisReasoning: `Pre-check policy blocked autonomous action.`,
      action: 'escalate',
      actionReasoning: preCheck.reason,
      summary: `Recovery blocked: ${preCheck.reason}`,
      paymentLink: null,
      discountApplied: null,
    };
  }

  // Pre-check passed: record audit entry
  const db = getDb();
  try {
    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, 'guardrail_passed',
      `[GUARDRAIL] Pre-check passed: Amount (\u20B9${transaction.amount.toLocaleString('en-IN')}) and Risk Score (${transaction.risk_score}/100) are within autonomous limits.`,
      new Date().toISOString()
    );
  } catch (_) {}

  const useGemini = GoogleGenerativeAI && process.env.GEMINI_API_KEY?.trim().length > 5;
  if (!useGemini) {
    onStep && onStep({ type: 'step', step: 'model_used', data: { model: 'mock', modelLabel: 'Mock Agent (rule-based)' } });
    return runMockAgent(transaction, onStep);
  }

  // ── Rate-limit-aware model cascade ───────────────────────────────────────────
  // Thresholds
  const INITIAL_SKIP_MS   = 6_000; // skip a model if initial wait exceeds this
  const RETRY_AFTER_MAX_MS = 4_000; // honour retry-after on SAME model only if <= this
  const MAX_5XX_RETRIES   = 2;     // per-model retries for transient 5xx / timeout
  const MAX_TOTAL_TRIES   = 8;     // safety cap across all models

  const _ts         = () => new Date().toISOString();
  let   totalTries  = 0;
  let   prevModel   = null; // last model we actually dispatched to
  let   lastErr     = null;

  const _audit = (eventType, detail) => {
    try { db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    ).run(uuidv4(), transaction.id, eventType, detail, _ts()); } catch (_) {}
  };

  for (const modelSpec of MODEL_CHAIN) {
    if (totalTries >= MAX_TOTAL_TRIES) break;

    const { id: modelId, label: modelLabel } = modelSpec;

    // ── Initial wait check: skip model if it needs too long ─────────────────
    const initialWait = waitMsFor(modelId);
    if (initialWait > INITIAL_SKIP_MS) continue; // try next in chain
    if (initialWait > 0) await new Promise(r => setTimeout(r, initialWait));

    // ── Per-model retry loop (handles transient 5xx and short rate-limits) ───
    for (let retry = 0; retry <= MAX_5XX_RETRIES; retry++) {
      if (totalTries >= MAX_TOTAL_TRIES) break;

      // On retries, re-check the wait (blockUntil may have been set by a 429)
      if (retry > 0) {
        const reWait = waitMsFor(modelId);
        if (reWait > RETRY_AFTER_MAX_MS) break; // backoff too long → cascade to next model
        if (reWait > 0) await new Promise(r => setTimeout(r, reWait));
      }

      recordRequest(modelId);
      totalTries++;

      // Audit a model switch (only when we actually change models)
      if (prevModel && prevModel !== modelId) {
        _audit('model_fallback',
          `[MODEL_ROUTER] Switched ${labelOf(prevModel)} → ${modelLabel}. ` +
          `Reason: ${lastErr && lastErr.message && lastErr.message.slice(0, 150) || 'rate limit / transient error'}. ` +
          `Retry count: ${totalTries - 1}. Final model: ${modelLabel}.`);
        console.log(`[ModelRouter] ${labelOf(prevModel)} → ${modelLabel} (try #${totalTries})`);
      }
      prevModel = modelId;

      try {
        onStep && onStep({ type: 'step', step: 'model_used', data: { model: modelId, modelLabel } });
        const result = await runGeminiAgent(transaction, onStep, modelId);
        // Log when a non-primary model handled the transaction
        if (modelId !== MODEL_CHAIN[0].id) {
          _audit('model_fallback',
            `[MODEL_ROUTER] Completed on fallback model: ${modelLabel}. ` +
            `Primary (${MODEL_CHAIN[0].label}) was unavailable. Total LLM attempts: ${totalTries}.`);
        }
        return result;

      } catch (err) {
        lastErr = err;

        if (isRateLimit(err)) {
          const raMs = parseRetryAfterMs(err);
          blockUntil(modelId, Date.now() + raMs);
          console.warn(`[ModelRouter] ${modelLabel} 429 — retry-after ${Math.ceil(raMs / 1000)} s`);
          // If retry-after is short, the re-check at top of retry loop will wait+retry.
          // If it's long, the re-check breaks us to the next model.
          if (raMs > RETRY_AFTER_MAX_MS) break;

        } else if (isRetryable(err)) {
          const backoff = Math.min(1_000 * Math.pow(2, retry), 8_000); // 1s → 2s → 4s → cap 8s
          console.warn(`[ModelRouter] ${modelLabel} transient error (retry ${retry + 1}/${MAX_5XX_RETRIES}): ${err.message && err.message.slice(0, 80)}`);
          if (retry < MAX_5XX_RETRIES) await new Promise(r => setTimeout(r, backoff));
          // else: retries exhausted for this model → outer loop tries next

        } else {
          // Hard non-retryable error (400 bad request etc.) → cascade immediately
          console.warn(`[ModelRouter] ${modelLabel} hard error: ${err.message && err.message.slice(0, 120)}`);
          break;
        }
      }
    } // end per-model retry loop
  } // end MODEL_CHAIN cascade

  // ── All Gemini models exhausted → mock fallback ───────────────────────────
  const reason = lastErr && lastErr.message && lastErr.message.slice(0, 200) || 'all models unavailable';
  _audit('model_fallback',
    `[MODEL_ROUTER] All Gemini models exhausted after ${totalTries} attempt(s). ` +
    `Original model: ${MODEL_CHAIN[0].label}. Last model tried: ${labelOf(prevModel)}. ` +
    `Falling back to rule-based mock agent. Reason: ${reason}.`);
  console.warn(`[ModelRouter] All models exhausted (${totalTries} tries) — mock fallback for ${transaction.id}`);
  return runMockAgent(transaction, onStep);
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// POST /api/agent/run/:id — single transaction
router.post('/run/:id', async (req, res) => {
  try {
    const db = getDb();
    const tx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(req.params.id);
    if (!tx) return res.status(404).json({ error: 'Transaction not found' });
    if (tx.status !== 'at_risk') return res.status(400).json({ error: `Already processed: ${tx.status}` });

    const result = await processTransaction(tx, null);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('Agent run error:', err);
    res.status(500).json({ error: err.message });
  }
});

// GET /api/agent/batch/stream — SSE live batch processing
// Reads RECOVERY_BATCH_SIZE, GEMINI_MAX_CONCURRENCY, GEMINI_TARGET_RPM from env.
router.get('/batch/stream', async (req, res) => {
  // ── Config from env ────────────────────────────────────────────────────
  const BATCH_SIZE   = Math.max(1, parseInt(process.env.RECOVERY_BATCH_SIZE,  10) || 10);
  const CONCURRENCY  = Math.max(1, parseInt(process.env.GEMINI_MAX_CONCURRENCY, 10) || 2);
  const TARGET_RPM   = Math.max(1, parseInt(process.env.GEMINI_TARGET_RPM,    10) || 10);
  // Minimum ms between individual LLM requests (across all slots) to stay under TARGET_RPM
  const MIN_GAP_MS   = Math.ceil((60_000 / TARGET_RPM));

  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (data) => {
    res.write(`data: ${JSON.stringify(data)}\n\n`);
    if (typeof res.flush === 'function') res.flush();
  };

  try {
    const db = getDb();

    // ── Select only eligible at-risk cases, capped to BATCH_SIZE ─────────────
    const queueSize   = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE status = 'at_risk'").get().cnt;
    const totalInDb   = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get().cnt;
    const transactions = db.prepare(
      "SELECT * FROM transactions WHERE status = 'at_risk' ORDER BY risk_score DESC, created_at ASC LIMIT ?"
    ).all(BATCH_SIZE);

    if (!transactions.length) {
      send({ type: 'no_transactions', message: 'No at-risk transactions. Add new cases or reset the demo.', queue_size: 0, total_in_db: totalInDb });
      return res.end();
    }

    send({
      type:         'batch_start',
      total:        transactions.length,
      batch_size:   BATCH_SIZE,
      queue_size:   queueSize,          // total at-risk cases in DB (may be > batch)
      total_in_db:  totalInDb,
      remaining:    Math.max(0, queueSize - transactions.length),
      concurrency:  CONCURRENCY,
      target_rpm:   TARGET_RPM,
    });

    let recovered = 0, failed = 0, escalated = 0, amountRecovered = 0;

    // ── Concurrency semaphore + rate-pacing ─────────────────────────────
    // We process CONCURRENCY transactions in parallel while ensuring the
    // inter-request gap across all slots stays above MIN_GAP_MS.
    // Results are emitted in arrival order (not start order) via SSE — each
    // event already carries the transaction_id so the frontend can match them.
    let   slots      = CONCURRENCY;     // available slots
    let   lastFireMs = 0;               // epoch-ms of last LLM dispatch
    const waitSlot   = () => new Promise(resolve => {
      const check = () => { if (slots > 0) { slots--; resolve(); } else { setTimeout(check, 50); } };
      check();
    });
    const releaseSlot = () => { slots++; };
    const paceDelay   = async () => {
      const now  = Date.now();
      const wait = Math.max(0, lastFireMs + MIN_GAP_MS - now);
      if (wait > 0) await new Promise(r => setTimeout(r, wait));
      lastFireMs = Date.now();
    };

    let done = 0;

    await Promise.all(transactions.map(async (tx, i) => {
      // Stagger the initial start: spread the first wave over CONCURRENCY slots
      if (i >= CONCURRENCY) await waitSlot();  // wait for a free slot
      else await new Promise(r => setTimeout(r, i * Math.ceil(MIN_GAP_MS / CONCURRENCY)));

      // Enforce inter-request rate across all slots
      await paceDelay();

      send({ type: 'transaction_start', index: i + 1, total: transactions.length, transaction: tx });

      try {
        const result = await processTransaction(tx, (stepData) => {
          send({ type: 'transaction_step', transaction_id: tx.id, ...stepData });
        });

        if (result.outcome === 'recovered')  { recovered++;  amountRecovered += tx.amount; }
        else if (result.outcome === 'escalated') escalated++;
        else failed++;

        done++;
        const updatedTx = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx.id);
        send({
          type:        'transaction_done',
          transaction:  updatedTx,
          result: {
            outcome:           result.outcome,
            diagnosisReasoning: result.diagnosisReasoning,
            action:            result.action,
            actionReasoning:   result.actionReasoning,
            summary:           result.summary,
            paymentLink:       result.paymentLink,
            discountApplied:   result.discountApplied,
          },
          progress: { done, total: transactions.length },
        });
      } catch (txErr) {
        console.error(`Error on ${tx.id}:`, txErr.message);
        failed++;
        done++;
        send({ type: 'transaction_error', transaction_id: tx.id, error: txErr.message });
      } finally {
        releaseSlot();
      }
    }));

    // Remaining at-risk after this batch
    const remainingAfter = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE status = 'at_risk'").get().cnt;

    send({
      type:  'batch_complete',
      stats: {
        total:            transactions.length,
        recovered,
        failed,
        escalated,
        amount_recovered: amountRecovered,
        recovery_rate:    transactions.length > 0 ? ((recovered / transactions.length) * 100).toFixed(1) : '0.0',
        remaining_queue:  remainingAfter,
        total_in_db:      totalInDb,
      },
    });
  } catch (err) {
    console.error('Batch SSE error:', err);
    send({ type: 'error', message: err.message });
  }

  res.end();
});

// POST /api/agent/simulate-inject — inject simulated transactions for judging
router.post('/simulate-inject', (req, res) => {
  try {
    const { type } = req.body;
    const db = getDb();
    const id = uuidv4();
    const now = new Date().toISOString();

    let customer_name = '';
    let customer_email = '';
    let amount = 1499;
    let failure_reason = 'otp_timeout';
    let scenario_type = 'failed_payment';
    let risk_score = 30;
    let attempts_count = 0;
    let simulation_outcome = 'sim_success';

    if (type === 'success') {
      customer_name = 'Ananya Sen (Simulated Success)';
      customer_email = 'ananya.sen@gmail.com';
      amount = 4999;
      failure_reason = 'otp_timeout';
      scenario_type = 'failed_payment';
      risk_score = 25;
      simulation_outcome = 'sim_success';
    } else if (type === 'failed_retry') {
      customer_name = 'Rahul Bose (Simulated Failed Retry)';
      customer_email = 'rahul.bose@gmail.com';
      amount = 999;
      failure_reason = 'card_decline';
      scenario_type = 'subscription_failure';
      risk_score = 75;
      simulation_outcome = 'sim_failed_retry';
    } else if (type === 'retry_limit') {
      customer_name = 'Vikram Roy (Simulated Retry Limit)';
      customer_email = 'vikram.roy@gmail.com';
      amount = 1999;
      failure_reason = 'abandoned';
      scenario_type = 'checkout_abandonment';
      risk_score = 65;
      attempts_count = 2; // already 2 attempts, triggers guardrail
      simulation_outcome = 'sim_retry_limit';
    } else if (type === 'escalation') {
      customer_name = 'Priya Nair (Simulated Escalation)';
      customer_email = 'priya.nair@gmail.com';
      amount = 32000; // triggers high value threshold (>25,000)
      failure_reason = 'insufficient_funds';
      scenario_type = 'failed_payment';
      risk_score = 90;
      simulation_outcome = 'sim_escalation';
    } else {
      return res.status(400).json({ error: 'Unknown simulation type' });
    }

    db.prepare(
      `INSERT INTO transactions (id, customer_name, customer_email, amount, failure_reason, status, scenario_type, risk_score, attempts_count, blocked_by_guardrail, simulation_outcome, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'at_risk', ?, ?, ?, 0, ?, ?, ?)`
    ).run(id, customer_name, customer_email, amount, failure_reason, scenario_type, risk_score, attempts_count, simulation_outcome, now, now);

    db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, 'payment_failed', ?, ?)`
    ).run(uuidv4(), id, `[DETECT] Failed transaction detected: ${failure_reason.replace(/_/g, ' ')} of ₹${amount.toLocaleString('en-IN')}`, now);

    res.json({ success: true, id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/next-batch — generate fresh synthetic at-risk cases
// Count defaults to NEW_CASE_GENERATION_BATCH env var (default 10).
// Never mass-generates all 150 cases at once; keeps DB growth controlled.
router.post('/next-batch', (req, res) => {
  try {
    const db = getDb();
    const envDefault = Math.max(1, parseInt(process.env.NEW_CASE_GENERATION_BATCH, 10) || 10);
    const count = Math.min(50, Math.max(1, parseInt(req.body.count, 10) || envDefault));
    const now = new Date().toISOString();

    const NAMES = [
      'Aarav Sharma', 'Pooja Verma', 'Vikram Desai', 'Ananya Nair',
      'Rohan Patel', 'Tanvi Joshi', 'Dev Menon', 'Sneha Pillai',
      'Karthik Gupta', 'Nisha Bose', 'Sameer Iyer', 'Divya Kapoor',
      'Rahul Reddy', 'Shreya Rao', 'Aditya Chatterjee', 'Meera Trivedi'
    ];
    const REASONS = ['card_decline', 'otp_timeout', 'insufficient_funds', 'network_drop', 'abandoned'];
    const AMOUNTS = [490, 750, 990, 1250, 1850, 2400, 3150, 4800, 6500, 8900, 12500, 18500, 32000];

    const insertTx = db.prepare(
      `INSERT INTO transactions (id, customer_name, customer_email, amount, failure_reason, status, scenario_type, risk_score, attempts_count, blocked_by_guardrail, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, 'at_risk', ?, ?, 0, 0, ?, ?)`
    );
    const insertAudit = db.prepare(
      `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
       VALUES (?, ?, ?, ?, ?)`
    );

    const inserted = [];
    const insertBatch = db.transaction(() => {
      for (let i = 0; i < count; i++) {
        const id = uuidv4();
        const name = NAMES[i % NAMES.length] + ' ' + Math.floor(10 + Math.random() * 89);
        const email = name.toLowerCase().replace(/[^a-z0-9]/g, '.') + '@example.com';
        const amount = AMOUNTS[Math.floor(Math.random() * AMOUNTS.length)];
        const reason = REASONS[Math.floor(Math.random() * REASONS.length)];

        let scenario = 'failed_payment';
        if (reason === 'abandoned') scenario = 'checkout_abandonment';
        else if (i % 3 === 0) scenario = 'subscription_failure';

        let riskScore = 35 + Math.floor(Math.random() * 45);
        if (amount > 25000) riskScore = 88;

        insertTx.run(id, name, email, amount, reason, scenario, riskScore, now, now);

        const eventLabel = scenario === 'checkout_abandonment' ? 'Checkout abandoned' :
                           scenario === 'subscription_failure'  ? 'Subscription renewal failed' :
                           'Payment failed';
        insertAudit.run(uuidv4(), id, 'payment_failed',
          `[DETECT] ${eventLabel} for \u20B9${amount.toLocaleString('en-IN')}: ${reason.replace(/_/g, ' ')}`,
          now
        );
        inserted.push({ id, customer_name: name, amount, failure_reason: reason, scenario_type: scenario });
      }
    });
    insertBatch();

    const atRiskTotal = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE status = 'at_risk'").get().cnt;
    const totalInDb   = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get().cnt;
    res.json({ success: true, count: inserted.length, atRiskTotal, totalInDb, items: inserted });
  } catch (err) {
    console.error('Error generating next batch:', err);
    res.status(500).json({ error: err.message });
  }
});

// POST /api/agent/reset — reset all to at_risk for demo replay
router.post('/reset', (req, res) => {
  const db = getDb();
  const now = new Date().toISOString();
  db.prepare("UPDATE transactions SET status='at_risk', payment_link=NULL, discount_applied=0, attempts_count=0, blocked_by_guardrail=0, updated_at=? WHERE 1=1").run(now);
  db.prepare('DELETE FROM agent_decisions').run();
  db.prepare('DELETE FROM recovery_actions').run();
  db.prepare("DELETE FROM audit_log WHERE event_type != 'payment_failed'").run();
  res.json({ success: true, message: 'All transactions reset to at_risk' });
});

router.processTransaction = processTransaction;
module.exports = router;

