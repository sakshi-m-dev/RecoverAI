const express = require('express');
const router = express.Router();
const { getDb } = require('../db/database');

// GET /api/transactions — list with optional status filter
router.get('/', (req, res) => {
  const db = getDb();
  const { status, limit = 100, offset = 0 } = req.query;

  let query = 'SELECT * FROM transactions';
  const params = [];

  if (status) {
    query += ' WHERE status = ?';
    params.push(status);
  }

  query += ' ORDER BY created_at DESC LIMIT ? OFFSET ?';
  params.push(parseInt(limit), parseInt(offset));

  const transactions = db.prepare(query).all(...params);
  const total = db.prepare('SELECT COUNT(*) as cnt FROM transactions' + (status ? ' WHERE status = ?' : '')).get(...(status ? [status] : []));

  res.json({ transactions, total: total.cnt });
});

// GET /api/transactions/stats — dashboard metrics
router.get('/stats', (req, res) => {
  const db = getDb();

  const atRisk   = db.prepare("SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM transactions WHERE status='at_risk'").get();
  const recovered= db.prepare("SELECT COALESCE(SUM(amount),0) as total, COUNT(*) as count FROM transactions WHERE status='recovered'").get();
  const failed   = db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status='failed'").get();
  const escalated= db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status='escalated'").get();
  const recovering= db.prepare("SELECT COUNT(*) as count FROM transactions WHERE status='recovering'").get();
  const total    = db.prepare("SELECT COUNT(*) as count FROM transactions").get();

  const blockedActions = db.prepare("SELECT COUNT(*) as cnt FROM transactions WHERE blocked_by_guardrail = 1").get().cnt;

  const processedCount = recovered.count + failed.count + escalated.count;
  const recoveryRate = processedCount > 0
    ? parseFloat((recovered.count / processedCount * 100).toFixed(1))
    : 0;

  const autonomousResolutionCount = recovered.count + failed.count;
  const autonomousResolutionRate = autonomousResolutionCount > 0
    ? parseFloat((recovered.count / autonomousResolutionCount * 100).toFixed(1))
    : 0;

  // Detailed funnel stages with both count and monetary value
  const f1 = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM transactions").get();
  const f2 = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM transactions WHERE amount <= 25000").get();
  const f3 = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM transactions WHERE attempts_count > 0 OR status IN ('recovering', 'recovered', 'failed')").get();
  const f4 = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM transactions WHERE status = 'recovered'").get();
  const f5 = db.prepare("SELECT COUNT(*) as count, COALESCE(SUM(amount),0) as amount FROM transactions WHERE status IN ('failed', 'escalated')").get();

  const funnel = [
    { stage: 'At Risk', count: f1.count, amount: Math.round(f1.amount) },
    { stage: 'Actionable', count: f2.count, amount: Math.round(f2.amount) },
    { stage: 'Attempted', count: f3.count, amount: Math.round(f3.amount) },
    { stage: 'Recovered', count: f4.count, amount: Math.round(f4.amount) },
    { stage: 'Unresolved', count: f5.count, amount: Math.round(f5.amount) },
  ];

  // Strategy Analytics
  const strategies = ['email_nudge', 'discount_offer'].map(type => {
    const actTotal = db.prepare(`SELECT COUNT(DISTINCT transaction_id) as cnt FROM recovery_actions WHERE action_type = ?`).get(type).cnt;
    const actSuccess = db.prepare(`
      SELECT COUNT(DISTINCT r.transaction_id) as cnt 
      FROM recovery_actions r 
      JOIN transactions t ON r.transaction_id = t.id 
      WHERE r.action_type = ? AND t.status = 'recovered'
    `).get(type).cnt;
    
    let label = type === 'email_nudge' ? 'Payment Retry Link' : 'Discount Offer';
    return {
      strategy: label,
      total: actTotal,
      success: actSuccess,
      rate: actTotal > 0 ? parseFloat((actSuccess / actTotal * 100).toFixed(1)) : 0
    };
  });

  // Inject a manual third strategy Escalation check
  const totalEscalations = db.prepare(`SELECT COUNT(*) as cnt FROM transactions WHERE status = 'escalated'`).get().cnt;
  strategies.push({
    strategy: 'Human Escalation',
    total: totalEscalations,
    success: 0,
    rate: 0
  });

  res.json({
    at_risk_amount: atRisk.total,
    at_risk_count: atRisk.count,
    recovered_amount: recovered.total,
    recovered_count: recovered.count,
    failed_count: failed.count,
    escalated_count: escalated.count,
    recovering_count: recovering.count,
    total_transactions: total.count,
    recovery_rate: recoveryRate,
    autonomous_resolution_rate: autonomousResolutionRate,
    blocked_actions: blockedActions,
    funnel,
    strategies,
  });
});

// GET /api/transactions/:id — single transaction with full audit trail
router.get('/:id', (req, res) => {
  const db = getDb();
  const { id } = req.params;

  const transaction = db.prepare('SELECT * FROM transactions WHERE id = ?').get(id);
  if (!transaction) return res.status(404).json({ error: 'Transaction not found' });

  const decisions = db.prepare('SELECT * FROM agent_decisions WHERE transaction_id = ? ORDER BY created_at').all(id);
  const actions   = db.prepare('SELECT * FROM recovery_actions WHERE transaction_id = ? ORDER BY sent_at').all(id);
  const auditLog  = db.prepare('SELECT * FROM audit_log WHERE transaction_id = ? ORDER BY timestamp').all(id);

  const parsedActions = actions.map(a => ({
    ...a,
    action_payload: a.action_payload ? JSON.parse(a.action_payload) : null,
  }));

  res.json({ transaction, decisions, actions: parsedActions, audit_log: auditLog });
});

module.exports = router;
