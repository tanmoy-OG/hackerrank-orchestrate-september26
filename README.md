<div align="center">

  <img src="public/icon.svg" alt="Should I Buy It Logo" width="80" height="80" style="border-radius: 20px;" />

  # Should I Buy It?
  ### AI Purchase Affordability & 90-Day Liquidity Simulator

  [![Next.js](https://img.shields.io/badge/Next.js-14.2-black?style=for-the-badge&logo=next.js&logoColor=white)](https://nextjs.org/)
  [![TypeScript](https://img.shields.io/badge/TypeScript-5.5-blue?style=for-the-badge&logo=typescript&logoColor=white)](https://www.typescriptlang.org/)
  [![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.4-38bdf8?style=for-the-badge&logo=tailwind-css&logoColor=white)](https://tailwindcss.com/)
  [![Supabase](https://img.shields.io/badge/Supabase-Database%20%26%20Auth-3ecf8e?style=for-the-badge&logo=supabase&logoColor=white)](https://supabase.com/)
  [![Vercel Analytics](https://img.shields.io/badge/Vercel-Web%20Analytics-white?style=for-the-badge&logo=vercel&logoColor=black)](https://vercel.com/analytics)
  [![License: MIT](https://img.shields.io/badge/License-MIT-yellow?style=for-the-badge)](LICENSE)

  <p align="center">
    <strong>Stop guessing if you can afford that purchase.</strong><br />
    A verifiable financial commitment assistant that projects incoming payroll, fixed obligations, and minimum emergency buffers across a forward 90-day ledger before you spend.
  </p>

  [Live Demo](https://shouldibuy.it) • [Features](#-key-features) • [Architecture](#-architecture) • [Getting Started](#-getting-started) • [Supabase Setup](#-supabase-cloud-setup) • [API Reference](#-api-reference)

</div>

---

## 💡 Why "Should I Buy It"?

Most impulse buys happen because people look at their current bank balance instead of their upcoming cash commitments. 

> Having **$3,000** in your account today may make an **$800** laptop seem affordable—until rent (**$1,500**) and car insurance (**$400**) clear five days before your next paycheck arrives.

**Should I Buy It?** eliminates financial blind spots by modeling your day-by-day cash flow for the next 90 days. It mathematically ensures that no purchase compromises your minimum emergency reserve buffer.

---

## ✨ Key Features

### 1. ⚡ Forward 90-Day Cash Flow Simulation
- Calculates day-by-day account balances by harmonizing payday cycles with monthly recurring liabilities.
- Identifies exact **lowest trough dates** to prevent overdrafts prior to upcoming payroll deposits.
- Defends a **sacred emergency reserve floor** customized to your personal comfort level.

### 2. 🚦 Four Objective Decision Verdicts
| Verdict | Meaning | Simulation Behavior |
| :--- | :--- | :--- |
| **`BUY NOW`** | Safe to purchase today | Cash balance stays comfortably above the reserve floor through all upcoming cycles. |
| **`SAFE DELAY`** | Wait 2–4 weeks | A temporary cash squeeze is detected; waiting until a future payday makes it safe. |
| **`HIGH RISK`** | Fragile safety margin | Purchase leaves less than 15% discretionary cushion against unexpected emergencies. |
| **`DECLINE`** | Do not purchase | Triggers a severe buffer breach or negative balance within the 90-day horizon. |

### 3. 🌓 Apple + Google Minimalist UI & OLED Dark Theme
- Designed with Apple typography (`-apple-system`, `SF Pro`), frosted glassmorphic navigation, and Google-inspired semantic color tags.
- **OLED Dark Mode**: Zero-FOUC hydration script with automatic OS theme detection and persistent toggle (System / Light / Dark).
- **Tactile Micro-Interactions**: Springy button presses, interactive pill hover states, SVG stroke draw-in trajectory animations, and smooth CSS Grid-animated FAQ accordions.

### 4. 🔒 Dual-Mode Architecture: Local-First & Cloud Isolation
- **Local Mode (Guest)**: 100% private, client-side evaluations running instantly in your browser without requiring account creation or bank logins.
- **Cloud Mode (Supabase)**: Secure user sign-in and sign-up powered by Supabase Auth and PostgreSQL with **Row Level Security (RLS)** to persist custom profiles and multi-device decision history.

### 5. 🔍 Extreme SEO & AI Discoverability
- Comprehensive **Next.js 14 App Router Metadata**, OpenGraph cards, and Twitter summary tags.
- Valid **Schema.org JSON-LD** structured data (`WebApplication`, `Organization`, `HowTo`, `FAQPage`) for Google Rich Snippets and AI Overviews (Perplexity, ChatGPT, SGE).
- Auto-generated dynamic **Sitemap** (`/sitemap.xml`), **Robots** (`/robots.txt`), and **PWA Web Manifest** (`/manifest.webmanifest`).
- Brand vector favicon (`public/icon.svg`), dynamic App Router icons (`/icon`), and Apple touch icons (`/apple-icon`).

### 6. 📊 Privacy-Friendly Web Analytics
- Built-in **Vercel Web Analytics** (Hobby plan compatible): cookieless, privacy-compliant tracking of page views and visitor trends with zero configuration.

---

## 🏛️ System Architecture

```
should-i-buy-it/
├── public/
│   └── icon.svg                     # Scalable vector brand logo & favicon
├── src/
│   ├── app/
│   │   ├── api/
│   │   │   ├── analyze/route.ts     # POST: 90-day ledger simulation runner
│   │   │   ├── history/route.ts     # GET & DELETE: User evaluation history
│   │   │   └── profile/route.ts     # GET & POST: User financial profile & safeguards
│   │   ├── apple-icon.tsx           # Dynamic Apple touch icon (180x180)
│   │   ├── icon.tsx                 # Dynamic App Router favicon (32x32)
│   │   ├── globals.css              # Dark theme tokens, hover-lift, & animation keyframes
│   │   ├── layout.tsx               # Root layout, metadata, SEO, & Vercel Analytics
│   │   ├── manifest.ts              # Dynamic PWA Web App Manifest
│   │   ├── page.tsx                 # Core UI (Evaluate, History, Profile, FAQ)
│   │   ├── robots.ts                # Dynamic robots.txt search engine directives
│   │   └── sitemap.ts               # Dynamic sitemap.xml indexing route
│   ├── components/
│   │   ├── StructuredData.tsx       # Schema.org JSON-LD (@graph: WebApplication, FAQ, HowTo)
│   │   └── ThemeToggle.tsx          # System / Light / Dark segmented selector
│   └── lib/
│       ├── financialEngine.ts       # 100% Native TypeScript simulation & live FX engine
│       └── supabase/
│           ├── client.ts            # Dynamic browser client with local fallback
│           └── server.ts            # Server client with SSR cookie synchronization
├── data/                            # Local Mode persistent storage
│   ├── history.json                 # Guest decision evaluations
│   └── profile.json                 # Guest baseline financial profile
├── supabase_schema.sql              # Supabase PostgreSQL schema, triggers, & RLS policies
├── tailwind.config.js               # Theme colors, keyframes, & custom animations
└── tsconfig.json                    # Strict TypeScript configuration
```

---

## 🚀 Getting Started

### Prerequisites
- **Node.js**: `v18.17.0` or higher
- **npm**, **pnpm**, or **yarn**

### 1. Clone & Install
```bash
git clone https://github.com/your-username/should-i-buy-it.git
cd should-i-buy-it
npm install
```

### 2. Configure Environment Variables
Copy the example environment file:
```bash
cp .env.example .env.local
```

For **Local Mode only**, no variables are required! The application gracefully runs with local file and in-browser storage.

For **Cloud Mode (Supabase)**, add your project credentials to `.env.local`:
```env
NEXT_PUBLIC_APP_URL=http://localhost:3005

# Supabase Credentials (Optional for local-only development)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-public-key
```

### 3. Run Development Server
```bash
npm run dev
```

Open [http://localhost:3005](http://localhost:3005) in your browser.

---

## 🗄️ Supabase Cloud Setup

To enable multi-user accounts, cloud-synced financial profiles, and private decision history:

1. Create a free project at [supabase.com](https://supabase.com).
2. Open the **SQL Editor** in your Supabase Dashboard.
3. Paste and run the contents of [`supabase_schema.sql`](supabase_schema.sql):
   - Provisions the `profiles` table linked to `auth.users(id)`.
   - Provisions the `decisions` table with JSONB trajectory storage.
   - Sets up automated user creation triggers (`handle_new_user`).
   - Configures **Row Level Security (RLS)** ensuring users can only read/write their own records.
4. Copy your **Project URL** and **Anon Key** from **Project Settings → API** into `.env.local`.

---

## 🔌 API Reference

### `POST /api/analyze`
Simulates forward 90-day liquidity and evaluates purchase affordability.

**Request Body:**
```json
{
  "query": "Can I afford to buy a new laptop for $1,200 today?",
  "amount": 1200,
  "currency": "USD",
  "requestDate": "2026-09-17",
  "desiredDate": "2026-10-17",
  "allowsPartial": true,
  "uploadedReceiptName": "laptop_invoice.pdf",
  "extractedReceiptAmount": 1200
}
```

**Response (`200 OK`):**
```json
{
  "success": true,
  "decision": {
    "amount_safe_to_pay": "1200",
    "affordability_status": "affordable_now",
    "recommended_payment_method": "full_payment",
    "payment_plan": "2026-09-17:1200",
    "earliest_date_for_full_payment": "2026-09-17",
    "spending_changes_needed": "none",
    "decision_explanation": "Pay USD 1,200.00 today. Your liquid reserves stay at least USD 2,400 above your emergency buffer over the next 90 days."
  },
  "profile": {
    "user_id": "usr_12345",
    "home_currency": "USD",
    "current_balance": 5200,
    "minimum_balance": 1500
  },
  "trajectory": [
    { "date": "2026-09-17", "balance": 4000, "minRequired": 1500, "isBelow": false },
    { "date": "2026-09-18", "balance": 3980, "minRequired": 1500, "isBelow": false }
  ],
  "savedHistoryId": "dec_89234710"
}
```

### `GET /api/profile` & `POST /api/profile`
- `GET`: Returns the active user's financial profile, income, pay schedule, and protected expense categories.
- `POST`: Updates baseline balances, salary schedule, and flexible spending preferences.

### `GET /api/history` & `DELETE /api/history`
- `GET`: Fetches stored historical evaluations for the authenticated user.
- `DELETE ?id=<id>`: Removes an individual evaluation record.
- `DELETE`: Clears all evaluation history for the user.

---

## 🚢 Production Deployment

### Deploying to Vercel

1. Push your repository to GitHub.
2. Import the repository in [Vercel](https://vercel.com/new).
3. Under **Environment Variables**, add:
   - `NEXT_PUBLIC_APP_URL` = `https://your-custom-domain.com`
   - `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-anon-key`
4. Click **Deploy**.
5. Once deployed, navigate to the **Analytics** tab in your Vercel Dashboard and click **Enable Web Analytics**.

---

## 🛡️ Privacy & Security

- **No Banking Logins Required**: No Plaid integrations, credentials, or bank accounts are accessed. Calculations are purely based on your high-level inputs.
- **Row Level Security (RLS)**: When logged into Supabase Cloud, your data is mathematically isolated at the database level (`auth.uid() = user_id`).
- **Cookieless Analytics**: Vercel Web Analytics operates completely without cookies or invasive trackers.

---

## 📄 License

This project is licensed under the **MIT License** — see the [LICENSE](LICENSE) file for details.
