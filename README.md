# RecoverAI ⚡

> **Autonomous AI Revenue Recovery Agent for Indian Fintech & Digital Commerce**  
> An autonomous AI agent that detects payment failures, diagnoses the root cause with Gemini function calling, enforces deterministic policy guardrails, executes context-aware recovery nudges, and independently verifies revenue settlement.

[![License: MIT](https://img.shields.io/badge/License-MIT-gold.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green.svg)](https://nodejs.org/)
[![Vite + React](https://img.shields.io/badge/Frontend-React%2018%20%2B%20Vite-blue.svg)](https://vitejs.dev/)
[![Gemini](https://img.shields.io/badge/AI-Google%20Gemini%20API-teal.svg)](https://aistudio.google.com/)
[![SQLite](https://img.shields.io/badge/Database-Better--SQLite3-purple.svg)](https://github.com/WiseLibs/better-sqlite3)

---

## 📌 Problem Statement

Payment failures in Indian fintech and digital commerce (UPI timeouts, card declines, OTP expiries, and bank gateway drops) result in **billions in lost revenue annually**. Traditional systems rely on blunt, automated retry spam that alienates customers and risks compliance breaches.

**RecoverAI** solves this with an **intelligent, guardrail-governed recovery agent**:
1. **Understands *why*** a payment failed using structured LLM reasoning (Gemini function calling).
2. **Enforces deterministic business safety policies** *before* and *during* every action.
3. **Dispatches personalized recovery nudges** or calibrated discount incentives.
4. **Independently verifies payment completion** before declaring revenue recovered.
5. **Maintains an immutable, append-only audit trail** with full timeline transparency.

---

## 🏗️ Architecture & Pipeline

```
  ┌───────────────────────────────────────────────────────────────┐
  │              SQLite Database (150+ Transactions)              │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                 Eligible At-Risk Recovery Queue               │
  │        (Sorted by Risk Score DESC, Capped to Batch Size)      │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │          Batch Stream Processor (EventSource SSE)             │
  │     • Max Concurrency: 2 Slots  • Pacing: 10 RPM (6s gap)     │
  │     • App-Level State via BatchContext (Survives Navigation)  │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              STAGE 1: PRE-CHECK GUARDRAILS                    │
  │   • Amount > ₹25,000 → Escalate (Gemini intentionally skipped)│
  │   • Risk Score ≥ 85  → Escalate directly to Human Review      │
  └───────────────────────────────┬───────────────────────────────┘
                                  │ (Passed)
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                 GEMINI MODEL ROUTER (CASCADE)                 │
  │  Primary:    Gemini 3.1 Flash Lite (15 RPM, 500 RPD)          │
  │  Fallback 1: Gemini 3.5 Flash Lite (15 RPM, 500 RPD)          │
  │  Fallback 2: Gemini Flash Lite Latest (10 RPM, 20 RPD)        │
  │  Fallback 3: Gemini 3 Flash Preview (5 RPM, 20 RPD)           │
  │  Emergency:  Deterministic Mock Agent                         │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │            GEMINI DIAGNOSIS & ACTION PROPOSAL                 │
  │  • diagnose_failure(reason, confidence, rationale)            │
  │  • Proposes: send_recovery_nudge | offer_discount | escalate  │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              STAGE 2: ACTION GUARDRAILS                       │
  │   • Max Contact Attempts ≤ 2                                  │
  │   • 30-Minute Cooldown Window                                 │
  │   • Discount Hard Cap ≤ 10%                                   │
  └───────────────────────────────┬───────────────────────────────┘
                                  │ (Approved)
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │                  RECOVERY TOOL EXECUTION                      │
  │   • Generates Payment Link (Razorpay Test Mode / Simulated)   │
  │   • Dispatches Email / SMS Notification Payload               │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              BACKEND RECOVERY VERIFICATION                    │
  │   • Gateway / Webhook verification validates payment receipt  │
  │   • Gemini CANNOT declare 'recovered' alone                   │
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              IMMUTABLE AUDIT TRAIL & TIMELINE TRACE           │
  │   DETECTED → PRE-CHECK → MODEL → TOOL CALL → DIAGNOSIS →      │
  │   DECISION → GUARDRAIL → ACT → VERIFY → OUTCOME               │
  └───────────────────────────────────────────────────────────────┘
```

---

## 🌟 Key Features

### 1. Minimal, Premium Opening Screen
- Designed specifically for **30–45 second technical buildathon demo pitches**.
- Highlights the **6-step operational pipeline**: `DETECT → DIAGNOSE → DECIDE → GUARDRAIL → ACT → VERIFY`.
- Clean feature cards: **AI-Powered** (Gemini reasoning), **Guardrailed** (deterministic policies), **Verified** (backend settlement).
- One-click navigation into the live dashboard (`Explore Dashboard →`).

### 2. Transparent Agent Execution Timeline
Rather than only displaying final outcomes, each transaction in **Case Detail** features a chronological, auditable execution trace:
- **`DETECTED`**: Captured failure reason, amount, and initial risk score.
- **`PRE-CHECK`**: Deterministic threshold verification (amounts $\le$ ₹25,000, risk $<$ 85).
- **`BLOCKED`**: Clear audit notice if autonomous recovery was blocked, explicitly stating whether Gemini was intentionally not called.
- **`MODEL`**: Real-time identification of the model used (`Gemini 3.1 Flash Lite`, cascade fallback, or mock agent).
- **`TOOL CALL`**: Tool invocations (e.g. `diagnose_failure()`).
- **`DIAGNOSIS`**: Root cause analysis and structured rationale without exposing raw prompts or chain-of-thought.
- **`DECISION`**: Action proposed by Gemini with concise justification.
- **`GUARDRAIL`**: Pass/fail evaluation of contact frequency, cooldowns, and discount caps.
- **`ACTION`**: Execution details (e.g. `send_recovery_nudge()`, payment link creation).
- **`VERIFYING`**: Backend confirmation check against payment link settlement.
- **`OUTCOME`**: Confirmed status (`recovered`, `escalated`, `failed`).

### 3. Persistent Batch Execution & Live Step Streaming
- **`BatchContext`**: Active batch runs and `EventSource` (SSE) streams persist across frontend route changes. Users can inspect individual case details mid-run and return to Batch Run without interrupting execution.
- **Live Navbar Badge**: Displays real-time batch progress (`Batch running · X%`) with one-click return to `/batch`.
- **`LiveStepBadge`**: Animates active tool execution and model cascade status in real-time under the pipeline progress bar.

### 4. Two-Stage Deterministic Guardrails
- **Stage 1 (Pre-Check)**: Blocks high-value transactions (> ₹25,000) and extreme-risk cases ($\ge$ 85) before LLM invocation, saving token quota and eliminating financial risk.
- **Stage 2 (Action Guardrail)**: Evaluates AI action proposals against contact frequency limits (max 2 messages), cooldown timers (30 min), and commercial discount thresholds (hard 10% maximum).

### 5. Multi-Model Rate-Limit-Aware Fallback Cascade
- Built for production rate-limit resilience with automatic failover across 4 Gemini tiers:
  1. `Gemini 3.1 Flash Lite` (15 RPM / 500 RPD) — Primary
  2. `Gemini 3.5 Flash Lite` (15 RPM / 500 RPD) — Fallback 1
  3. `Gemini Flash Lite Latest` (10 RPM / 20 RPD) — Fallback 2
  4. `Gemini 3 Flash Preview` (5 RPM / 20 RPD) — Fallback 3
  5. Rule-based Mock Agent — Emergency fail-safe
- Sliding-window RPM tracking, sliding-window request recording, and retry-after header parsing. Every model switch is logged to `audit_log`.

### 6. Backend-Governed Recovery Verification
- Prevents LLM hallucination in financial state updates.
- The AI initiates recovery actions, but **only backend confirmation** against payment links and gateway webhooks commits `status = 'recovered'` and increments dashboard ROI counters.

---

## 💻 Tech Stack

| Layer | Technology |
|---|---|
| **Frontend** | React 18, Vite, TailwindCSS, Framer Motion, Axios, React Router 6 |
| **Backend** | Node.js, Express, Better-SQLite3, Server-Sent Events (SSE) |
| **AI / LLM** | Google Gemini API (`@google/generative-ai`), Function Calling with `SchemaType` |
| **Payments** | Razorpay Node SDK (Test Mode / Simulated Fallback) |
| **State Management** | React Context (`BatchContext`) with persistent SSE streaming |

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **npm**: v9.0.0 or higher
- **Google Gemini API Key**: [Get a free API key here](https://aistudio.google.com/)

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sakshi-m-dev/RecoverAI.git
   cd RecoverAI
   ```

2. **Install all dependencies:**
   ```bash
   npm install
   npm install --prefix backend
   npm install --prefix frontend
   ```

3. **Configure environment variables:**
   Create a `.env` file in the `backend/` directory:
   ```bash
   cp backend/.env.example backend/.env
   ```
   Configure your keys in `backend/.env`:
   ```env
   PORT=3001
   FRONTEND_URL=http://localhost:5173

   # Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key_here

   # Razorpay Keys (Optional — simulated if omitted)
   RAZORPAY_KEY_ID=rzp_test_your_id
   RAZORPAY_KEY_SECRET=your_secret

   # Batch Processing & Rate-Pacing Tuning
   RECOVERY_BATCH_SIZE=10
   GEMINI_MAX_CONCURRENCY=2
   GEMINI_TARGET_RPM=10
   NEW_CASE_GENERATION_BATCH=10
   ```

4. **Seed the database:**
   Populate SQLite with the 150+ transaction benchmark dataset:
   ```bash
   npm run seed --prefix backend
   ```

5. **Start the development server:**
   ```bash
   npm run dev
   ```
   - **Frontend App**: `http://localhost:5173`
   - **Backend API**: `http://localhost:3001`

---

## 🧭 Application Routes

| Path | Screen | Purpose |
|---|---|---|
| `/` | **Landing Page** | Opening screen for demo pitches with 6-stage pipeline and feature summary |
| `/dashboard` | **Recovery Command** | Full dashboard with hero metrics, funnel analytics, policy panel, and activity feed |
| `/batch` | **Batch Recovery** | Live SSE execution console with real-time tool progress and summary metrics |
| `/case/:id` | **Case Detail** | Individual transaction breakdown with the new **Agent Execution Timeline** |

---

## 📡 API Reference

### Agent Operations
- `GET /api/agent/trace/:id` — Returns structured, chronological timeline trace for a transaction.
- `GET /api/agent/batch/stream` — SSE endpoint streaming live batch execution with step-level events.
- `POST /api/agent/run/:id` — Execute autonomous recovery on an individual transaction.
- `POST /api/agent/next-batch` — Generate a controlled batch of synthetic at-risk cases.
- `POST /api/agent/simulate-inject` — Inject specific edge-case scenarios (`success`, `failed_retry`, `retry_limit`, `escalation`).
- `POST /api/agent/reset` — Reset transactions to `at_risk` for demo replay.

### Transactions & Analytics
- `GET /api/transactions` — Query all transactions with optional `status`, `limit`, and `offset` filters.
- `GET /api/transactions/stats` — Real-time recovery rates, revenue recovered, funnel metrics, and strategy breakdown.
- `GET /api/transactions/:id` — Complete case details with full audit log trail and decisions.
- `GET /api/health` — System status, API connectivity, and live per-model RPM metrics.

---

## 🧪 Testing & Verification

Run the automated test suite verifying all 10 architectural and policy guarantees:
```bash
cd backend && node test-verification.js
```

### Verified Test Matrix (10/10 Passed):
- `TEST 1`: Normal failed payment recovery flow (Diagnose → Nudge → Guardrail → Verified Recovery)
- `TEST 2`: High-value transaction (> ₹25,000) pre-check escalation without LLM call
- `TEST 3`: Risk score $\ge$ 85 pre-check escalation
- `TEST 4`: Retry limit (attempts $\ge$ 2) blocked by action guardrail
- `TEST 5`: 30-minute cooldown window violation blocked by action guardrail
- `TEST 6`: Payment failure verified by backend (not marked recovered)
- `TEST 7`: Model cascade failover on 429 rate limit with audit logging
- `TEST 8`: Batch fault tolerance during individual case failure/escalation
- `TEST 9`: Dashboard revenue stats exactly matching verified database records
- `TEST 10`: Dynamic batch summary calculations without hardcoded values

---

## 🔒 Security & Compliance

- **Key Isolation**: `GEMINI_API_KEY` and Razorpay secrets are kept strictly server-side and never exposed to the client.
- **Deterministic Control**: The LLM cannot override guardrails, skip verification, or modify database status directly.
- **Audit Immutability**: All decisions and actions are permanently preserved in `audit_log` with zero `UPDATE` or `DELETE` operations.
- **Privacy Safe**: Timeline views expose structured rationale without leaking internal prompts or model chain-of-thought.

---

## 📄 License

MIT License. Created by [Sakshi](https://github.com/sakshi-m-dev).
