require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./database');
const { createSchema } = require('./schema');

// Raw failure reason mapping to internal categories & scenarios
function mapFailure(raw) {
  switch (raw) {
    case 'card_declined_bank':
      return { reason: 'card_decline', scenario: 'failed_payment' };
    case 'expired_card':
      return { reason: 'card_decline', scenario: 'subscription_failure' };
    case 'network_drop':
      return { reason: 'network_drop', scenario: 'failed_payment' };
    case 'otp_timeout':
      return { reason: 'otp_timeout', scenario: 'failed_payment' };
    case 'insufficient_funds':
      return { reason: 'insufficient_funds', scenario: 'failed_payment' };
    case 'user_abandoned_price':
      return { reason: 'abandoned', scenario: 'checkout_abandonment' };
    case 'user_abandoned_browsing':
      return { reason: 'abandoned', scenario: 'checkout_abandonment' };
    case 'duplicate_attempt':
      return { reason: 'card_decline', scenario: 'failed_payment' };
    default:
      return { reason: 'card_decline', scenario: 'failed_payment' };
  }
}

const DECISION_MAP = {
  card_decline: {
    action: 'send_recovery_nudge',
    reasoning: "Card was declined — likely a temporary block or wrong credentials. Sent a retry link with alternate payment options.",
  },
  otp_timeout: {
    action: 'send_recovery_nudge',
    reasoning: "OTP timed out — bank SMS was slow, not the customer's fault. Gentle retry nudge sent.",
  },
  insufficient_funds: {
    action: 'offer_discount',
    reasoning: "Insufficient funds at the time. Customer clearly wants to buy — offered a small 8% discount to bridge the gap.",
  },
  network_drop: {
    action: 'send_recovery_nudge',
    reasoning: "Payment gateway dropped mid-flow. Purely a network issue. Sent a fresh payment link.",
  },
  abandoned: {
    action: 'offer_discount',
    reasoning: "Customer dropped off at checkout. Could be price hesitation. Sent a warm nudge with a 7% discount.",
  },
};

function seed() {
  createSchema();
  const db = getDb();

  // Load dataset.json
  const datasetPath = path.join(__dirname, '../../data/dataset.json');
  let rawData = [];
  if (fs.existsSync(datasetPath)) {
    try {
      rawData = JSON.parse(fs.readFileSync(datasetPath, 'utf8'));
    } catch (e) {
      console.error('Error reading dataset.json:', e);
    }
  }

  // Clear existing transactions and related tables to ensure a clean reseed
  db.prepare('DELETE FROM audit_log').run();
  db.prepare('DELETE FROM recovery_actions').run();
  db.prepare('DELETE FROM agent_decisions').run();
  db.prepare('DELETE FROM transactions').run();

  const insertTx = db.prepare(
    `INSERT INTO transactions (id, customer_name, customer_email, amount, failure_reason, status, discount_applied, scenario_type, risk_score, attempts_count, blocked_by_guardrail, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertDecision = db.prepare(
    `INSERT INTO agent_decisions (id, transaction_id, diagnosis, diagnosis_confidence, chosen_action, reasoning_text, guardrails_applied, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertAction = db.prepare(
    `INSERT INTO recovery_actions (id, transaction_id, action_type, action_payload, sent_at, outcome)
     VALUES (?, ?, ?, ?, ?, ?)`
  );
  const insertAudit = db.prepare(
    `INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp)
     VALUES (?, ?, ?, ?, ?)`
  );

  // We have 150 items in dataset.json:
  // - First 30 items: active 'at_risk' (ready for Batch #1)
  // - Next 40 items: historical 'recovered'
  // - Next 15 items: historical 'failed'
  // - Next 5 items: historical 'escalated'
  // - Remaining items will be available for next batches!

  const total = rawData.length || 60;
  const atRiskCount = Math.min(25, total);
  const recoveredCount = 35;
  const failedCount = 10;
  const escalatedCount = 5;

  const seedAll = db.transaction(() => {
    rawData.forEach((item, index) => {
      const id = item.id || uuidv4();
      const name = item.customer_name;
      const email = item.customer_email;
      const amount = item.amount;
      const createdAt = item.created_at || new Date().toISOString();
      const { reason, scenario } = mapFailure(item.failure_reason_raw);

      // Determine initial status for realistic demo data:
      let status = 'at_risk';
      if (index < atRiskCount) {
        status = 'at_risk';
      } else if (index < atRiskCount + recoveredCount) {
        status = 'recovered';
      } else if (index < atRiskCount + recoveredCount + failedCount) {
        status = 'failed';
      } else if (index < atRiskCount + recoveredCount + failedCount + escalatedCount || amount > 25000) {
        status = 'escalated';
      } else {
        // Reserve remaining items for on-demand next batch queue or keep as at_risk
        status = 'at_risk';
      }

      // Risk score: 20-95
      let riskScore = 40 + (amount % 45);
      if (reason === 'abandoned') riskScore += 10;
      if (reason === 'insufficient_funds') riskScore += 15;
      riskScore = Math.min(Math.max(riskScore, 15), 98);

      let attempts = status === 'at_risk' ? 0 : 1;
      let blocked = (status === 'escalated' && amount > 25000) ? 1 : 0;
      let discountApplied = (reason === 'insufficient_funds' && status === 'recovered') ? 8 : 0;

      insertTx.run(
        id, name, email, amount,
        reason, status,
        discountApplied, scenario, riskScore, attempts, blocked,
        createdAt, createdAt
      );

      // Audit: failure event detected
      const eventLabel = scenario === 'checkout_abandonment' ? 'Checkout abandoned' :
                         scenario === 'subscription_failure' ? 'Subscription renewal failed' :
                         'Payment failed';

      insertAudit.run(uuidv4(), id, 'payment_failed',
        `[DETECT] ${eventLabel} for ₹${amount.toLocaleString('en-IN')}: ${reason.replace(/_/g, ' ')}`,
        createdAt
      );

      // If already resolved, insert decisions, actions & verify audit entries
      if (status !== 'at_risk') {
        const dec = DECISION_MAP[reason] || DECISION_MAP.card_decline;
        const decisionTime = new Date(new Date(createdAt).getTime() + 12 * 60000).toISOString();
        const outcomeTime = new Date(new Date(createdAt).getTime() + 35 * 60000).toISOString();

        let chosenAction = dec.action;
        let reasoning = dec.reasoning;
        let guardrailsText = null;

        if (amount > 25000) {
          chosenAction = 'escalate';
          reasoning = `High-value ${scenario.replace(/_/g, ' ')} detected. Transaction amount (₹${amount}) exceeds autonomous recovery threshold (₹25,000). Escalated immediately.`;
          guardrailsText = 'high_value_limit_exceeded';
        }

        insertDecision.run(
          uuidv4(), id, reason, 'high',
          chosenAction, reasoning, guardrailsText, decisionTime
        );

        if (guardrailsText) {
          insertAudit.run(uuidv4(), id, 'guardrail_triggered',
            `[GUARDRAIL] Action blocked: amount > ₹25,000 autonomous threshold.`,
            decisionTime
          );
        } else {
          insertAudit.run(uuidv4(), id, 'guardrail_passed',
            `[GUARDRAIL] Policy checks passed: Retry limits & discount bounds verified.`,
            decisionTime
          );
        }

        const actionType = chosenAction === 'escalate' ? 'escalate' :
                           chosenAction === 'offer_discount' ? 'discount_offer' : 'email_nudge';

        insertAction.run(
          uuidv4(), id, actionType,
          JSON.stringify({ amount, customer: name }),
          decisionTime, status
        );

        insertAudit.run(uuidv4(), id, 'nudge_sent',
          `[ACT] Executed action: ${actionType.replace(/_/g, ' ')}`, decisionTime);

        insertAudit.run(uuidv4(), id, `case_${status}`,
          `[VERIFY] Resolution verified. Outcome: ${status}`, outcomeTime);
      }
    });
  });

  seedAll();

  const final = db.prepare('SELECT COUNT(*) as cnt FROM transactions').get();
  const atRisk = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE status='at_risk'").get();
  const recovered = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE status='recovered'").get();
  console.log(`✅ Seeded ${final.cnt} transactions from dataset:`);
  console.log(`   • ${atRisk.cnt} at-risk (ready for batch run)`);
  console.log(`   • ${recovered.cnt} recovered (dashboard history)`);
  console.log(`   • ${final.cnt - atRisk.cnt - recovered.cnt} failed/escalated`);
}

seed();
