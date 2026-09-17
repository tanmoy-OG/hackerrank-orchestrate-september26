# Buy or Wait? — Autonomous AI Financial Commitment Assistant

An AI-powered personal financial decision assistant that decides whether you can safely afford a requested purchase or financial commitment.

Instead of only checking your current bank balance, **Buy or Wait?** constructs a 90-day forward liquidity model. It accounts for your recurring payroll, essential bills (rent, utilities), subscriptions, upcoming debits, flexible discretionary categories, and your personal minimum emergency reserve buffer.

---

## 🚀 Key Features

### 1. ⚡ Interactive Purchase Affordability Evaluator
- Submit any financial question (e.g. *"Can I afford to buy a new laptop for $1,200 today?"*).
- Specify purchase amount, currency, target completion date, and whether you accept partial payments or installments.
- Evaluates four distinct affordability outcomes:
  - **`affordable_now`**: Safe to pay in full today without breaching your reserve buffer at any point in the next 90 days.
  - **`affordable_with_plan`**: Safe via an installment schedule or 2-phase partial payment plan.
  - **`affordable_later`**: Wait until the projected earliest safe date (e.g. following next confirmed salary).
  - **`not_affordable`**: Unsafe within the 90-day horizon without making identified flexible spending reductions.

### 2. 📎 Financial Evidence & Document Ingestion
- Attach receipts, invoices, or contractor estimates (PNG, JPG, PDF) to ground the evaluation in concrete evidence.

### 3. 📈 90-Day Balance Forward Trajectory Curve
- Generates an interactive balance curve tracking your projected daily cash position against your red-line emergency reserve threshold (`minimum_balance_to_keep`).

### 4. 📜 Persistent Decision History
- Every evaluation is automatically saved to persistent storage (`data/history.json`).
- Filter by status (`affordable_now`, `affordable_with_plan`, `affordable_later`, `not_affordable`).
- Search past evaluations by keyword or explanation.
- Expand past decisions to inspect the full payment schedule, safe amounts, and balance curves.
- Delete individual records or clear history at any time.

### 5. 👤 Financial Profile & Safeguard Management
- View and update your active profile live via the UI:
  - Account balance and minimum reserve buffer.
  - Monthly net salary and payday (1–31).
  - Monthly fixed recurring commitments (rent, utilities, debt).
  - **Protected Categories**: Categories that will never be reduced or stopped (e.g. Rent, Healthcare, Groceries).
  - **Reducible Categories**: Discretionary expenses you are willing to cut back if needed (e.g. Dining, Shopping).
  - **Stoppable Categories**: Subscriptions you are willing to pause (e.g. Streaming, Cloud Storage).
  - **Financing Preferences**: Full payment, installments, partial payment, and max installment duration.
- Profile changes are saved directly to `data/profile.json` and immediately used for all subsequent evaluations.

---

## 🛠️ System Architecture

```text
buy-or-wait/
├── src/                             # Next.js 14 App Router (Pages & APIs)
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts     # POST: Invariant simulation runner
│   │   │   ├── history/route.ts     # GET & DELETE: Persistent decision history
│   │   │   └── profile/route.ts     # GET & POST: User financial profile
│   │   ├── globals.css              # Apple + Google glassmorphic design tokens
│   │   ├── layout.tsx               # Root viewport & font setup
│   │   └── page.tsx                 # Standalone UI (Evaluate, History, Profile)
│   └── lib/
│       └── financialEngine.ts       # Native TypeScript 90-day simulation & live FX engine
├── public/                          # Static public assets
├── data/                            # Persistent JSON Storage
│   ├── history.json                 # Evaluated purchase decisions & trajectories
│   ├── profile.json                 # Active user financial profile & safeguards
│   └── exchange_rates.json          # Cached live FX currency rates (auto-generated)
├── package.json                     # Project dependencies & scripts (configured for port 3005)
├── tsconfig.json                    # TypeScript configuration
├── tailwind.config.js               # Tailwind CSS styling configuration
└── next.config.js                   # Next.js configuration
```

### Technology Stack
- **Framework**: Next.js 14 (App Router), React 18, TypeScript, Tailwind CSS.
- **Design Language**: Apple + Google minimalist aesthetic (SF Pro font hierarchy, glassmorphic headers, clean card layouts, semantic pill badges).
- **Backend & APIs**: Next.js Node.js Route Handlers with persistent file-backed JSON stores.
- **Simulation Engine**: 100% Native TypeScript mathematical ledger projection engine verifying daily cash invariants.
- **Live FX Provider**: Dynamic real-time exchange rates via Open FX API with automatic 24-hour local caching.

---

## 💻 Getting Started

### 1. Prerequisites
- **Node.js**: v18 or newer (No Python needed!)

### 2. Installation

```bash
# Install dependencies directly in the project root
npm install
```

### 3. Running the Application

```bash
# Build and start the production server
npm run build
npm start
```

Or start the local development server:

```bash
npm run dev
```

Open [http://localhost:3005](http://localhost:3005) in your browser.

---

## 🔌 API Reference

### `POST /api/analyze`
Analyzes a purchase request against the active user financial profile and 90-day forward cash flow.

**Request Body:**
```json
{
  "query": "Can I afford to buy a new laptop for $1,200 today?",
  "amount": 1200,
  "currency": "USD",
  "requestDate": "2026-09-13",
  "desiredDate": "2026-10-15",
  "allowsPartial": false,
  "uploadedReceiptName": "laptop_quote.pdf",
  "extractedReceiptAmount": 1200
}
```

**Response:**
```json
{
  "success": true,
  "decision": {
    "amount_safe_to_pay": "1200",
    "affordability_status": "affordable_now",
    "recommended_payment_method": "full_payment",
    "payment_plan": "2026-09-13:1200",
    "earliest_date_for_full_payment": "2026-09-13",
    "spending_changes_needed": "none",
    "decision_explanation": "Pay USD 1,200.00 today. This leaves at least USD 1,800.00 available over the next 90 days."
  },
  "trajectory": [ ... ],
  "savedHistoryId": "req_1726245000"
}
```

### `GET /api/profile` & `POST /api/profile`
Retrieves or updates the persistent user profile in `data/profile.json`.

### `GET /api/history` & `DELETE /api/history`
- `GET /api/history`: Returns all stored purchase decisions.
- `DELETE /api/history?id=<id>`: Deletes a specific evaluation from history.
- `DELETE /api/history`: Clears the entire decision history.
