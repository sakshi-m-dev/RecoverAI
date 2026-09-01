const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');

let Razorpay;
try { Razorpay = require('razorpay'); } catch (_) {}

// POST /api/razorpay/payment-link
router.post('/payment-link', async (req, res) => {
  const { transaction_id, amount, customer_name, customer_email, discount_percent = 0 } = req.body;

  if (Razorpay && process.env.RAZORPAY_KEY_ID && process.env.RAZORPAY_KEY_SECRET) {
    try {
      const rzp = new Razorpay({
        key_id: process.env.RAZORPAY_KEY_ID,
        key_secret: process.env.RAZORPAY_KEY_SECRET,
      });
      const finalAmount = Math.round(amount * (1 - discount_percent / 100));
      const link = await rzp.paymentLink.create({
        amount: finalAmount * 100, // paise
        currency: 'INR',
        description: `RecoverAI Recovery Link${discount_percent ? ` (${discount_percent}% off)` : ''}`,
        customer: { name: customer_name, email: customer_email },
        notify: { email: true },
        reminder_enable: true,
        reference_id: transaction_id,
      });
      return res.json({ success: true, payment_link: link.short_url, real: true });
    } catch (err) {
      console.error('Razorpay error:', err.message);
    }
  }

  // Simulated link (for demo without credentials)
  const simLink = `https://rzp.io/l/demo_${transaction_id?.slice(0, 8) || uuidv4().slice(0, 8)}`;
  res.json({
    success: true,
    payment_link: simLink,
    real: false,
    note: 'Simulated link — add Razorpay test credentials to .env for real ones',
  });
});

// POST /api/razorpay/webhook — handle payment events
router.post('/webhook', (req, res) => {
  const { event, payload } = req.body || {};
  if (event === 'payment_link.paid') {
    const txId = payload?.payment_link?.entity?.reference_id;
    if (txId) {
      const { getDb } = require('../db/database');
      const db = getDb();
      const now = new Date().toISOString();
      db.prepare("UPDATE transactions SET status='recovered', updated_at=? WHERE id=?").run(now, txId);
      db.prepare("INSERT INTO audit_log (id, transaction_id, event_type, event_detail, timestamp) VALUES (?, ?, ?, ?, ?)")
        .run(uuidv4(), txId, 'payment_received', 'Payment received via Razorpay payment link', now);
    }
  }
  res.json({ status: 'ok' });
});

module.exports = router;
