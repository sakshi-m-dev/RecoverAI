# RecoverAI ⚡

> **Autonomous Revenue Recovery Agent for Indian Fintech & SaaS**  
> Diagnoses payment failures, enforces deterministic policy guardrails, executes context-aware recovery nudges, and verifies revenue recovery in real-time.

---

## 📌 Problem Statement

Payment failures in Indian fintech and digital commerce (UPI timeouts, card declines, OTP expiries, and bank gateway drops) result in **billions in lost revenue annually**. Traditional recovery systems rely on blunt, automated retry spam that alienates customers and risks compliance breaches.

**RecoverAI** solves this with an **intelligent, guardrail-governed recovery agent** that:
1. Understands *why* a payment failed using structured LLM reasoning (Gemini function calling).
2. Applies strict, deterministic business safety policies *before* taking any action.
3. Dispatches personalized recovery nudges or calibrated discount incentives.
4. Independently verifies payment completion before marking revenue recovered.
5. Emits an immutable, append-only audit trail for compliance and risk analytics.

---

## 🏗️ Architecture & Pipeline

```
  ┌───────────────────────────────────────────────────────────────┐
  │                     SQLite Database (150+ Transactions)       │
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
  └───────────────────────────────┬───────────────────────────────┘
                                  │
                                  ▼
  ┌───────────────────────────────────────────────────────────────┐
  │              STAGE 1: PRE-CHECK GUARDRAILS                    │
  │   • Amount > ₹25,000 → Escalate (No LLM call wasted)          │
  │   • Risk Score ≥ 85  → Escalate to Human Review               │
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
  │                  IMMUTABLE AUDIT TRAIL                        │
  │   DETECTED → PRE-CHECK → DIAGNOSIS → ACTION GUARDRAIL →       │
  │   ACTION → VERIFY → OUTCOME (recovered | failed | escalated)  │
  └───────────────────────────────────────────────────────────────┘
```

---

## 🔑 Core Capabilities

### 1. Two-Stage Deterministic Guardrails
- **Stage 1 (Pre-Check)**: Blocks high-value transactions (> ₹25,000) and extreme-risk cases (≥ 85) before any LLM invocation, saving token quota and eliminating autonomous financial risk.
- **Stage 2 (Action Guardrail)**: Validates AI action proposals against contact frequency limits (max 2 messages), cooldown timers (30 min), and commercial discount thresholds (hard 10% maximum).

### 2. Multi-Model Rate-Limit-Aware Fallback Cascade
- Built for production rate-limit resilience with automatic failover across 4 Gemini tiers.
- In-process sliding-window RPM and daily RPD tracking with exponential backoff on retryable 429/5xx codes.
- Every model switch is audited with `event_type: 'model_fallback'`.

### 3. Backend-Governed Verification
- Prevents LLM hallucination in financial state updates.
- The AI initiates recovery actions, but only backend confirmation against payment links and gateway hooks commits `status = 'recovered'` and increments dashboard ROI counters.

### 4. Append-Only Compliance Audit Log
- Fully immutable audit log at the application layer.
- Zero `UPDATE` or `DELETE` operations on audit history. Every step from detection to resolution is logged chronologically.

---

## 💻 Tech Stack

- **Frontend**: React 18, Vite, TailwindCSS, Framer Motion, Axios, Lucide Icons
- **Backend**: Node.js, Express, Better-SQLite3, SSE (Server-Sent Events)
- **AI / LLM**: Google Gemini API (`@google/generative-ai`), Function Calling with `SchemaType` validation
- **Payments**: Razorpay Node SDK (Test Mode / Simulated Fallback)

---

## 🚀 Getting Started

### Prerequisites
- Node.js (v18.0.0 or higher)
- npm (v9.0.0 or higher)
- Google Gemini API Key ([Get a free key here](https://aistudio.google.com/))

### Installation

1. **Clone the repository:**
   ```bash
   git clone https://github.com/sakshi-m-dev/RecoverAI.git
   cd RecoverAI
   ```

2. **Install root and subproject dependencies:**
   ```bash
   npm install
   cd backend && npm install && cd ..
   cd frontend && npm install && cd ..
   ```

3. **Configure environment variables:**
   Create a `.env` file in the `backend/` folder (or copy from `.env.example`):
   ```bash
   cp backend/.env.example backend/.env
   ```
   Add your Gemini and Razorpay keys:
   ```env
   PORT=3001
   FRONTEND_URL=http://localhost:5173

   # Gemini API Key
   GEMINI_API_KEY=your_gemini_api_key_here

   # Razorpay Test Keys (Optional — simulated if omitted)
   RAZORPAY_KEY_ID=rzp_test_your_id
   RAZORPAY_KEY_SECRET=your_secret

   # Batch Processing & Rate Pacing Tuning
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

5. **Start the development servers:**
   ```bash
   npm run dev
   ```
   - **Frontend UI**: `http://localhost:5173`
   - **Backend API**: `http://localhost:3001`

---

## 🧪 Testing & Verification

Run the automated test suite verifying all 10 architectural and policy guarantees:
```bash
cd backend && node test-verification.js
```

### Verified Test Matrix (10/10 Passed):
- `TEST 1`: Normal failed payment recovery flow (Diagnose → Nudge → Guardrail → Verified Recovery)
- `TEST 2`: High-value transaction (> ₹25,000) pre-check escalation without LLM call
- `TEST 3`: Risk score ≥ 85 pre-check escalation
- `TEST 4`: Retry limit (attempts ≥ 2) blocked by action guardrail
- `TEST 5`: 30-minute cooldown window violation blocked by action guardrail
- `TEST 6`: Payment failure verified by backend (not marked recovered)
- `TEST 7`: Model cascade failover on 429 rate limit with audit logging
- `TEST 8`: Batch fault tolerance during individual case failure/escalation
- `TEST 9`: Dashboard revenue stats exactly matching verified database records
- `TEST 10`: Dynamic batch summary calculations without hardcoded values

---

## 📡 API Endpoints

### Agent Operations
- `GET /api/agent/batch/stream` — SSE endpoint streaming live batch execution with stage updates
- `POST /api/agent/run/:id` — Execute recovery on an individual transaction
- `POST /api/agent/next-batch` — Generate a controlled batch of synthetic at-risk cases
- `POST /api/agent/simulate-inject` — Inject specific edge-case scenarios (`high_value`, `retry_limit`, `success`, `fail`)
- `POST /api/agent/reset` — Reset transactions to `at_risk` for demo replay

### Analytics & Data
- `GET /api/transactions` — Query all transactions with status and pagination filters
- `GET /api/transactions/stats` — Real-time recovery rates, revenue recovered, and pipeline counts
- `GET /api/transactions/:id` — Complete case details with full audit log trail
- `GET /api/health` — System status, API connectivity, and live per-model RPM metrics

---

## 🔒 Security & Compliance

- **Key Isolation**: `GEMINI_API_KEY` and Razorpay secrets are kept strictly server-side and never exposed to the client.
- **Deterministic Control**: The LLM cannot override guardrails, skip verification, or modify database status directly.
- **Audit Immutability**: All decisions and actions are permanently preserved in `audit_log`.

---

## 📄 License
MIT License. Created by [Sakshi](https://github.com/sakshi-m-dev).
