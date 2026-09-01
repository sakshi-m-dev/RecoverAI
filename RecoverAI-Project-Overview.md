# RecoverAI — Project Overview
### Track 03: AI Revenue Recovery | Razorpay Buildathon | Deadline: Sep 5

---

## 1. The Core Idea

Businesses lose revenue quietly — a payment fails, a checkout gets abandoned, a subscription lapses — and nobody notices until the customer is gone. **RecoverAI** is an agent that watches for these leaks in real time, figures out *why* each one happened, and takes a bounded, explainable action to win the money back — then proves it worked with a receipt-level audit trail.

**One flow, done well**: Checkout drop-off recovery. (Failed-subscription recovery can be a stretch goal if time allows — same architecture, different trigger.)

---

## 2. The Experience — What Makes It Fun to Look At and Use

This is the part that should make judges sit up. Three design principles run through the whole product:

1. **The agent has a personality, not a console.** Every decision it makes is narrated in plain, warm language — like a sharp colleague explaining their thinking, not a log file. "Riya's payment failed on an OTP timeout — that's usually just bad luck, not hesitation. Sending a gentle retry link now." Never robotic, never cold, never shame-y toward the customer either.
2. **Money recovery should feel alive.** As the agent works through cases, amounts should animate — a counter ticking up as revenue is recovered, cards flipping from "at risk" (amber) to "recovered" (green) with a satisfying transition, not a static table.
3. **Dark, editorial, cinematic** — consistent with your existing design language (kneeAid, CRYPTEX). Think financial noir: deep charcoal backgrounds, one confident accent color (a warm gold or signal-green against the dark works well for a "money recovered" theme), Bebas Neue or similar condensed display type for big numbers, generous whitespace so it doesn't feel like a spreadsheet wearing a costume.

---

## 3. Core User Flows

### Flow A — The Dashboard (main screen)
The first thing judges see. A live-feeling command center:
- **Hero metric row**: Total at-risk revenue → Recovered so far → Recovery rate %, all animated counters
- **Funnel visualization**: Detected → Diagnosed → Action Taken → Recovered / Failed
- **Live activity feed**: A scrolling log of the agent's most recent decisions, written conversationally ("Just recovered ₹1,200 from Aditya — he came back after the reminder email 🎉")

### Flow B — Case Detail View
Click into any individual recovery case and see the agent's full reasoning, step by step, like a story:
1. What happened (the failure event)
2. What the agent diagnosed as the cause
3. What it decided to do, and *why* (in plain language)
4. What guardrails applied (e.g. "capped at 10% discount, one retry only")
5. The outcome — recovered, pending, or failed gracefully

### Flow C — The Batch Run (the actual demo moment)
A button: **"Run Recovery Batch"** — this processes your 50-100 synthetic at-risk transactions live on screen, agent working through them one by one with visible reasoning, ending in a results summary. This is your 5-minute video's centerpiece.

### Flow D — The Honest Failure
One case deliberately fails (e.g. discount offered, customer still doesn't return, or a policy blocks the agent from over-discounting). The agent narrates this too, calmly: "Tried a reminder and a small discount for this one — no luck. Flagging for manual follow-up instead of pushing further." This directly satisfies the track's ask for graceful failure handling.

---

## 4. Tech Stack

| Layer | Choice | Why |
|---|---|---|
| Frontend | React + Vite + Tailwind CSS | Fast, flexible, matches your existing skillset |
| Dashboard components | Tremor (or hand-built with Recharts) | Purpose-built for exactly this kind of metrics dashboard |
| Animation | Framer Motion | Needed for the "alive" counters, card transitions, feed |
| Backend | Node.js + Express | One language end-to-end with frontend and agent tooling |
| Database | PostgreSQL via Supabase | Relational integrity matters for audit trails; instant REST API |
| Agent | Claude API (tool-calling) | Native fit for reason → decide → act loops |
| Payments | Razorpay Test Mode | Required by the track |
| Deployment | Vercel (frontend) + Railway (backend + Postgres) | Simple, proven, minimal new setup |

---

## 5. Database Schema (core tables)

**`transactions`**
id, customer_name, customer_email, amount, failure_reason, status (at_risk / recovering / recovered / failed), created_at

**`agent_decisions`**
id, transaction_id (FK), diagnosis, chosen_action, reasoning_text, guardrails_applied, created_at

**`recovery_actions`**
id, transaction_id (FK), action_type (email_nudge / discount_offer / retry_link / escalate), action_payload, sent_at, outcome

**`audit_log`**
id, transaction_id (FK), event_type, event_detail, timestamp
— this table powers the Case Detail View's step-by-step story

---

## 6. The Agent's Tools (what Claude can actually call)

- `diagnose_failure(transaction)` → returns likely cause (card_decline, otp_timeout, insufficient_funds, network_drop, abandoned)
- `send_recovery_nudge(transaction, tone)` → simulated email/notification with retry link
- `offer_discount(transaction, percent)` → **hard-capped in code**, e.g. max 10%
- `escalate(transaction, reason)` → marks for human follow-up, logged honestly
- `mark_resolved(transaction, outcome)` → closes the case

**Guardrails live in your Express layer, not the prompt** — the AI proposes an action, your code checks it against limits (max discount, one retry per case, cooldown windows) before executing. This is what makes the money actions "bounded and gated," which is literally the track's bar.

---

## 7. Tone & Copy Guidelines (for all AI-generated feedback in the UI)

- Warm, plain-spoken, a little witty — never corporate, never robotic
- Explain *why*, not just *what*: "capped the discount at 10% — didn't want to just throw money at it" beats "discount_applied: true"
- Celebrate wins without being try-hard: a well-placed 🎉 or a clean "nice, that one came back" is enough
- Be honest about failures, same tone as successes — no dramatic alarm, no burying it either

---

## 8. Build Order (given your timeline)

1. **Day 1–2**: Schema + seed script (50-100 realistic synthetic transactions with varied failure reasons)
2. **Day 2–4**: Agent tool-calling loop working end-to-end on the backend (test via API calls, no UI yet)
3. **Day 4–6**: Dashboard UI — hero metrics, funnel, activity feed
4. **Day 6–7**: Case Detail View + Batch Run demo flow
5. **Day 7–8**: Razorpay test mode wiring for the retry-link action
6. **Day 8–9**: Polish pass — animations, copy tone, the deliberate failure case
7. **Final 1–2 days**: Record the 5-minute demo video, write the architecture doc, buffer for bugs

---

## 9. What Judges Should Walk Away Remembering

*"An agent that doesn't just flag lost revenue — it goes and gets it back, explains itself the whole way, knows its limits, and admits when it can't win one."*
