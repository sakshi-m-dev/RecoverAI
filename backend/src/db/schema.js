const { getDb } = require('./database');

function createSchema() {
  const db = getDb();

  db.exec(`
    CREATE TABLE IF NOT EXISTS transactions (
      id TEXT PRIMARY KEY,
      customer_name TEXT NOT NULL,
      customer_email TEXT NOT NULL,
      amount REAL NOT NULL,
      failure_reason TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'at_risk',
      payment_link TEXT,
      discount_applied REAL DEFAULT 0,
      scenario_type TEXT NOT NULL DEFAULT 'failed_payment',
      risk_score INTEGER NOT NULL DEFAULT 50,
      attempts_count INTEGER NOT NULL DEFAULT 0,
      blocked_by_guardrail INTEGER NOT NULL DEFAULT 0,
      simulation_outcome TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS agent_decisions (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      diagnosis TEXT NOT NULL,
      diagnosis_confidence TEXT NOT NULL DEFAULT 'high',
      chosen_action TEXT NOT NULL,
      reasoning_text TEXT NOT NULL,
      guardrails_applied TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS recovery_actions (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      action_type TEXT NOT NULL,
      action_payload TEXT,
      sent_at TEXT NOT NULL,
      outcome TEXT,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );

    CREATE TABLE IF NOT EXISTS audit_log (
      id TEXT PRIMARY KEY,
      transaction_id TEXT NOT NULL,
      event_type TEXT NOT NULL,
      event_detail TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      FOREIGN KEY (transaction_id) REFERENCES transactions(id)
    );
  `);

  // Ensure new columns exist in existing database tables
  const tableInfo = db.prepare("PRAGMA table_info(transactions)").all();
  const existingCols = new Set(tableInfo.map(col => col.name));

  if (!existingCols.has('scenario_type')) {
    db.exec("ALTER TABLE transactions ADD COLUMN scenario_type TEXT NOT NULL DEFAULT 'failed_payment'");
  }
  if (!existingCols.has('risk_score')) {
    db.exec("ALTER TABLE transactions ADD COLUMN risk_score INTEGER NOT NULL DEFAULT 50");
  }
  if (!existingCols.has('attempts_count')) {
    db.exec("ALTER TABLE transactions ADD COLUMN attempts_count INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingCols.has('blocked_by_guardrail')) {
    db.exec("ALTER TABLE transactions ADD COLUMN blocked_by_guardrail INTEGER NOT NULL DEFAULT 0");
  }
  if (!existingCols.has('simulation_outcome')) {
    db.exec("ALTER TABLE transactions ADD COLUMN simulation_outcome TEXT");
  }

  console.log('✅ Schema ready');
}

module.exports = { createSchema };

