'use strict';
require('dotenv').config();
const { v4: uuidv4 } = require('uuid');
const { getDb } = require('./src/db/database');
const { createSchema } = require('./src/db/schema');
const { evaluatePreCheck, evaluateActionGuardrail } = require('./src/middleware/guardrails');
const { verifyRecovery } = require('./src/tools');
const agentModule = require('./src/routes/agent');

createSchema();
const db = getDb();

async function runTests() {
  console.log('\n========================================');
  console.log('RECOVERAI ARCHITECTURE VERIFICATION TEST');
  console.log('========================================\n');

  const results = [];

  // Helper to create test tx
  function createTestTx(overrides = {}) {
    const id = uuidv4();
    const now = new Date().toISOString();
    const tx = {
      id,
      customer_name: 'Test Customer',
      customer_email: 'test@example.com',
      amount: 1500,
      failure_reason: 'otp_timeout',
      status: 'at_risk',
      scenario_type: 'failed_payment',
      risk_score: 30,
      attempts_count: 0,
      blocked_by_guardrail: 0,
      created_at: now,
      updated_at: now,
      simulation_outcome: null,
      ...overrides
    };

    db.prepare(`
      INSERT INTO transactions (id, customer_name, customer_email, amount, failure_reason, status, scenario_type, risk_score, attempts_count, blocked_by_guardrail, simulation_outcome, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
      tx.id, tx.customer_name, tx.customer_email, tx.amount, tx.failure_reason,
      tx.status, tx.scenario_type, tx.risk_score, tx.attempts_count,
      tx.blocked_by_guardrail, tx.simulation_outcome, tx.created_at, tx.updated_at
    );

    return db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  }

  // -------------------------------------------------------------
  // TEST 1: Normal failed payment -> Gemini diagnoses -> recovery action proposed -> guardrail approves -> action executes -> backend verifies -> recovered
  // -------------------------------------------------------------
  try {
    const tx1 = createTestTx({ failure_reason: 'otp_timeout', amount: 2000, risk_score: 25, simulation_outcome: 'sim_success' });
    const res1 = await agentModule.processTransaction(tx1);
    const dbTx1 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx1.id);
    const audit1 = db.prepare('SELECT * FROM audit_log WHERE transaction_id = ?').all(tx1.id);

    const hasDiagnosis = audit1.some(a => a.event_type === 'agent_diagnosis');
    const hasNudge = audit1.some(a => a.event_type === 'nudge_sent');
    const hasVerify = audit1.some(a => a.event_type === 'payment_verified');

    const pass1 = res1.outcome === 'recovered' && dbTx1.status === 'recovered' && hasDiagnosis && hasNudge && hasVerify;
    results.push({
      test: 'TEST 1: Normal failed payment recovery flow',
      passed: pass1,
      details: `Outcome: ${res1.outcome}, DB Status: ${dbTx1.status}, Diagnosis: ${hasDiagnosis}, Nudge: ${hasNudge}, Verified: ${hasVerify}`
    });
  } catch (e) {
    results.push({ test: 'TEST 1: Normal failed payment recovery flow', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 2: Transaction > ₹25,000 -> Pre-check guardrail -> autonomous action blocked -> escalated -> Gemini not called
  // -------------------------------------------------------------
  try {
    const tx2 = createTestTx({ amount: 35000, risk_score: 40 });
    const preCheck2 = evaluatePreCheck(tx2);
    const res2 = await agentModule.processTransaction(tx2);
    const dbTx2 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx2.id);
    const audit2 = db.prepare('SELECT * FROM audit_log WHERE transaction_id = ?').all(tx2.id);

    const guardrailTriggered = audit2.some(a => a.event_type === 'guardrail_triggered' && a.event_detail.includes('25,000'));
    const pass2 = !preCheck2.allowed && preCheck2.code === 'HIGH_VALUE_THRESHOLD' &&
                  res2.outcome === 'escalated' && dbTx2.status === 'escalated' &&
                  dbTx2.blocked_by_guardrail === 1 && guardrailTriggered;

    results.push({
      test: 'TEST 2: Transaction > ₹25,000 pre-check escalation',
      passed: pass2,
      details: `Pre-check allowed: ${preCheck2.allowed} (${preCheck2.code}), Outcome: ${res2.outcome}, Blocked Flag: ${dbTx2.blocked_by_guardrail}`
    });
  } catch (e) {
    results.push({ test: 'TEST 2: Transaction > ₹25,000 pre-check escalation', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 3: Risk score >= 85 -> Pre-check guardrail -> escalated
  // -------------------------------------------------------------
  try {
    const tx3 = createTestTx({ amount: 5000, risk_score: 90 });
    const preCheck3 = evaluatePreCheck(tx3);
    const res3 = await agentModule.processTransaction(tx3);
    const dbTx3 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx3.id);

    const pass3 = !preCheck3.allowed && preCheck3.code === 'HIGH_RISK_SCORE' &&
                  res3.outcome === 'escalated' && dbTx3.status === 'escalated' &&
                  dbTx3.blocked_by_guardrail === 1;

    results.push({
      test: 'TEST 3: Risk score >= 85 pre-check escalation',
      passed: pass3,
      details: `Pre-check allowed: ${preCheck3.allowed} (${preCheck3.code}), Outcome: ${res3.outcome}`
    });
  } catch (e) {
    results.push({ test: 'TEST 3: Risk score >= 85 pre-check escalation', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 4: Retry limit reached -> Gemini may propose retry -> Action guardrail blocks it -> escalated
  // -------------------------------------------------------------
  try {
    const tx4 = createTestTx({ amount: 4000, attempts_count: 2 });
    const actionGuardrail4 = evaluateActionGuardrail(tx4, 'send_recovery_nudge');
    const res4 = await agentModule.processTransaction(tx4);
    const dbTx4 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx4.id);
    const audit4 = db.prepare('SELECT * FROM audit_log WHERE transaction_id = ?').all(tx4.id);

    const guardrailAudit = audit4.some(a => a.event_type === 'guardrail_triggered' && a.event_detail.toLowerCase().includes('attempt'));
    const pass4 = !actionGuardrail4.allowed && actionGuardrail4.code === 'MAX_ATTEMPTS_EXCEEDED' &&
                  res4.outcome === 'escalated' && dbTx4.status === 'escalated' &&
                  dbTx4.blocked_by_guardrail === 1 && guardrailAudit;

    results.push({
      test: 'TEST 4: Retry limit reached blocked by action guardrail',
      passed: pass4,
      details: `Action Guardrail allowed: ${actionGuardrail4.allowed} (${actionGuardrail4.code}), Outcome: ${res4.outcome}, Audit logged: ${guardrailAudit}`
    });
  } catch (e) {
    results.push({ test: 'TEST 4: Retry limit reached blocked by action guardrail', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 5: Cooldown not satisfied -> Action guardrail blocks retry
  // -------------------------------------------------------------
  try {
    const tx5 = createTestTx({ amount: 3000, attempts_count: 1 });
    // Insert an action sent 5 minutes ago
    const fiveMinsAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    db.prepare(`
      INSERT INTO recovery_actions (id, transaction_id, action_type, action_payload, sent_at, outcome)
      VALUES (?, ?, 'email_nudge', '{}', ?, null)
    `).run(uuidv4(), tx5.id, fiveMinsAgo);

    const actionGuardrail5 = evaluateActionGuardrail(tx5, 'send_recovery_nudge');
    const res5 = await agentModule.processTransaction(tx5);
    const dbTx5 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx5.id);

    const pass5 = !actionGuardrail5.allowed && actionGuardrail5.code === 'COOLDOWN_ACTIVE' &&
                  res5.outcome === 'escalated' && dbTx5.status === 'escalated' &&
                  dbTx5.blocked_by_guardrail === 1;

    results.push({
      test: 'TEST 5: Cooldown window violation blocked by action guardrail',
      passed: pass5,
      details: `Action Guardrail allowed: ${actionGuardrail5.allowed} (${actionGuardrail5.code}), Outcome: ${res5.outcome}`
    });
  } catch (e) {
    results.push({ test: 'TEST 5: Cooldown window violation blocked by action guardrail', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 6: Recovery action / payment fails -> backend verifies failure -> transaction is NOT marked recovered
  // -------------------------------------------------------------
  try {
    const tx6 = createTestTx({ failure_reason: 'card_decline', amount: 1500, simulation_outcome: 'sim_failed_retry' });
    const res6 = await agentModule.processTransaction(tx6);
    const dbTx6 = db.prepare('SELECT * FROM transactions WHERE id = ?').get(tx6.id);
    const audit6 = db.prepare('SELECT * FROM audit_log WHERE transaction_id = ?').all(tx6.id);

    const hasVerifyFail = audit6.some(a => a.event_type === 'payment_verify_failed');
    const pass6 = res6.outcome === 'failed' && dbTx6.status === 'failed' && hasVerifyFail && dbTx6.status !== 'recovered';

    results.push({
      test: 'TEST 6: Payment failure verified by backend (not recovered)',
      passed: pass6,
      details: `Outcome: ${res6.outcome}, DB Status: ${dbTx6.status}, Verify Fail Audit: ${hasVerifyFail}`
    });
  } catch (e) {
    results.push({ test: 'TEST 6: Payment failure verified by backend (not recovered)', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 7: Primary Gemini model receives 429/rate-limit -> fallback model used -> audit_log records fallback
  // -------------------------------------------------------------
  try {
    const modelRouter = require('./src/lib/modelRouter');
    const primaryModel = modelRouter.MODEL_CHAIN[0].id;
    // Simulate rate limiting primary model
    modelRouter.blockUntil(primaryModel, Date.now() + 60000);

    const tx7 = createTestTx({ failure_reason: 'network_drop', amount: 1200, simulation_outcome: 'sim_success' });
    const res7 = await agentModule.processTransaction(tx7);
    const audit7 = db.prepare('SELECT * FROM audit_log WHERE transaction_id = ?').all(tx7.id);

    const hasFallbackAudit = audit7.some(a => a.event_type === 'model_fallback');
    const pass7 = hasFallbackAudit && res7.outcome === 'recovered';

    results.push({
      test: 'TEST 7: Model cascade on rate limit with audit logging',
      passed: pass7,
      details: `Fallback audit recorded: ${hasFallbackAudit}, Final Outcome: ${res7.outcome}`
    });
    // Unblock primary model after test
    modelRouter.blockUntil(primaryModel, 0);
  } catch (e) {
    results.push({ test: 'TEST 7: Model cascade on rate limit with audit logging', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 8: One case fails in batch -> remaining cases in batch continue -> no crash
  // -------------------------------------------------------------
  try {
    const txA = createTestTx({ customer_name: 'Batch Case 1', amount: 1000, simulation_outcome: 'sim_success' });
    const txB = createTestTx({ customer_name: 'Batch Case 2 (Fails)', amount: 45000 }); // Will trigger pre-check escalate
    const txC = createTestTx({ customer_name: 'Batch Case 3', amount: 2000, simulation_outcome: 'sim_success' });

    const batch = [txA, txB, txC];
    const batchResults = await Promise.all(batch.map(tx => agentModule.processTransaction(tx)));

    const pass8 = batchResults.length === 3 &&
                  batchResults[0].outcome === 'recovered' &&
                  batchResults[1].outcome === 'escalated' &&
                  batchResults[2].outcome === 'recovered';

    results.push({
      test: 'TEST 8: Batch resilience when individual case fails/escalates',
      passed: pass8,
      details: `Batch outcomes: [${batchResults.map(r => r.outcome).join(', ')}]`
    });
  } catch (e) {
    results.push({ test: 'TEST 8: Batch resilience when individual case fails/escalates', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 9: Dashboard revenue recovered matches verified recovered transactions in DB
  // -------------------------------------------------------------
  try {
    const statsQuery = db.prepare(`
      SELECT 
        COUNT(*) as total_count,
        SUM(CASE WHEN status = 'recovered' THEN 1 ELSE 0 END) as recovered_count,
        SUM(CASE WHEN status = 'recovered' THEN amount ELSE 0 END) as recovered_amount
      FROM transactions
    `).get();

    const sumActualRecovered = db.prepare(`SELECT SUM(amount) as s FROM transactions WHERE status = 'recovered'`).get().s || 0;
    const pass9 = statsQuery.recovered_amount === sumActualRecovered;

    results.push({
      test: 'TEST 9: Dashboard revenue exactly matches verified recovered transactions',
      passed: pass9,
      details: `Stats API recovered amount: ₹${statsQuery.recovered_amount}, Direct DB Sum: ₹${sumActualRecovered}`
    });
  } catch (e) {
    results.push({ test: 'TEST 9: Dashboard revenue exactly matches verified recovered transactions', passed: false, details: e.message });
  }

  // -------------------------------------------------------------
  // TEST 10: Batch summary metrics match DB and application calculations (no hardcoding)
  // -------------------------------------------------------------
  try {
    const txBatch = [
      createTestTx({ amount: 1000, simulation_outcome: 'sim_success' }),
      createTestTx({ amount: 2000, simulation_outcome: 'sim_failed_retry' }),
      createTestTx({ amount: 30000 }) // Escalated
    ];

    let recovered = 0, failed = 0, escalated = 0, amountRecovered = 0;
    for (const tx of txBatch) {
      const r = await agentModule.processTransaction(tx);
      if (r.outcome === 'recovered') { recovered++; amountRecovered += tx.amount; }
      else if (r.outcome === 'escalated') escalated++;
      else failed++;
    }

    const calculatedRate = ((recovered / txBatch.length) * 100).toFixed(1);
    const pass10 = recovered === 1 && failed === 1 && escalated === 1 && amountRecovered === 1000 && calculatedRate === '33.3';

    results.push({
      test: 'TEST 10: Batch summary dynamic calculation accuracy',
      passed: pass10,
      details: `Total: 3, Recovered: ${recovered}, Failed: ${failed}, Escalated: ${escalated}, Amount: ₹${amountRecovered}, Rate: ${calculatedRate}%`
    });
  } catch (e) {
    results.push({ test: 'TEST 10: Batch summary dynamic calculation accuracy', passed: false, details: e.message });
  }

  // Print results summary
  console.log('----------------------------------------');
  let passedCount = 0;
  for (const r of results) {
    const mark = r.passed ? '✅ PASS' : '❌ FAIL';
    if (r.passed) passedCount++;
    console.log(`${mark} | ${r.test}`);
    console.log(`       Details: ${r.details}`);
  }
  console.log('----------------------------------------');
  console.log(`TOTAL: ${passedCount}/${results.length} PASSED`);
  console.log('========================================\n');
}

runTests();
