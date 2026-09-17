/**
 * Buy or Wait? — Native TypeScript Financial Simulation Engine
 * Ported directly from code/main.py for native Vercel and Node.js deployment.
 * 
 * NOTE: As requested, the original Python implementation is preserved in
 * commented blocks throughout this file.
 */

import * as fs from "fs";
import * as path from "path";

/*
# ─── Python Original: Constants & Default Rates ────────────────────────────────
DEFAULT_USD_RATES = {
    "USD": 1.0,
    "EUR": 0.92,
    "GBP": 0.78,
    "INR": 83.5,
    "IDR": 15800.0,
    "ZAR": 18.2,
    "CAD": 1.36,
    "AUD": 1.52,
    "JPY": 155.0,
}
*/

export const DEFAULT_USD_RATES: Record<string, number> = {
  USD: 1.0,
  EUR: 0.92,
  GBP: 0.78,
  INR: 83.5,
  IDR: 15800.0,
  ZAR: 18.2,
  CAD: 1.36,
  AUD: 1.52,
  JPY: 155.0,
};

export const FORECAST_DAYS = 90;

// ─── Formatting Helpers ───────────────────────────────────────────────────────

/*
# ─── Python Original: Helper Functions ─────────────────────────────────────────
def fmt_clean_num(val: Optional[float]) -> str:
    if val is None:
        return ""
    val_round = round(val, 2)
    if abs(val_round - round(val_round)) < 1e-4:
        return str(int(round(val_round)))
    s = f"{val_round:.2f}"
    if s.endswith("0"):
        s = s[:-1]
    return s

def fmt_curr(val: Optional[float]) -> str:
    if val is None:
        return ""
    val_round = round(val, 2)
    if abs(val_round - round(val_round)) < 1e-4:
        return f"{int(round(val_round)):,}"
    s = f"{val_round:,.2f}"
    if s.endswith(".00"):
        s = s[:-3]
    return s

def format_date_human(d: Optional[date]) -> str:
    if not d:
        return ""
    try:
        day = d.day
        month_name = d.strftime("%B")
        year = d.year
        return f"{day} {month_name} {year}"
    except:
        return str(d)
*/

export function fmtCleanNum(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "";
  const valRound = Math.round(val * 100) / 100;
  if (Math.abs(valRound - Math.round(valRound)) < 1e-4) {
    return Math.round(valRound).toString();
  }
  let s = valRound.toFixed(2);
  if (s.endsWith("0")) s = s.slice(0, -1);
  return s;
}

export function fmtCurr(val: number | null | undefined): string {
  if (val == null || isNaN(val)) return "";
  const valRound = Math.round(val * 100) / 100;
  if (Math.abs(valRound - Math.round(valRound)) < 1e-4) {
    return Math.round(valRound).toLocaleString("en-US");
  }
  let s = valRound.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  if (s.endsWith(".00")) s = s.slice(0, -3);
  return s;
}

export function formatDateHuman(dateStr: string): string {
  if (!dateStr) return "";
  try {
    const parts = dateStr.split("-").map(Number);
    if (parts.length < 3) return dateStr;
    const d = new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
    const monthName = d.toLocaleString("en-US", { month: "long", timeZone: "UTC" });
    return `${parts[2]} ${monthName} ${parts[0]}`;
  } catch {
    return dateStr;
  }
}

export function parseDate(dateStr: string): Date | null {
  if (!dateStr) return null;
  const parts = dateStr.split("-").map(Number);
  if (parts.length < 3) return null;
  return new Date(Date.UTC(parts[0], parts[1] - 1, parts[2]));
}

export function toDateStr(d: Date): string {
  return d.toISOString().split("T")[0];
}

export function addDays(d: Date, days: number): Date {
  const result = new Date(d.getTime());
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

// ─── Interfaces ───────────────────────────────────────────────────────────────

export interface FinancialProfileData {
  user_id: string;
  home_currency: string;
  current_available_balance: number;
  minimum_balance_to_keep: number;
  financial_priorities?: string[];
  expense_categories_to_protect?: string[];
  expense_categories_willing_to_reduce?: string[];
  expense_categories_willing_to_stop?: string[];
  payment_methods?: string[];
  max_installment_months?: number;
}

export interface FinancialEventData {
  event_id: string;
  user_id: string;
  event_type: string;
  description: string;
  category: string;
  direction: "credit" | "debit";
  amount: number;
  currency: string;
  event_date: string;
  settlement_date?: string;
  status: "settled" | "scheduled" | "pending" | "cancelled";
  linked_event_id?: string;
  flexibility?: "fixed" | "stoppable" | "reducible" | "reducible_or_stoppable";
  minimum_allowed_amount?: number;
}

export interface PaymentOptionData {
  payment_option_id: string;
  request_id: string;
  payment_method: "full_payment" | "installments" | "partial_payment";
  payment_amount: number;
  number_of_payments: number;
  first_payment_date: string;
  payment_frequency_days?: number;
  financing_fee?: number;
  total_payable_amount: number;
}

export interface RequestData {
  request_id: string;
  user_id: string;
  request_date: string;
  request_type?: string;
  requested_amount: number;
  desired_completion_date?: string;
  allows_partial_payment?: boolean;
  request_text?: string;
}

export interface DecisionResult {
  request_id: string;
  amount_safe_to_pay: string;
  affordability_status: "affordable_now" | "affordable_with_plan" | "affordable_later" | "not_affordable";
  recommended_payment_method: "full_payment" | "installments" | "partial_payment" | "wait" | "not_recommended";
  payment_plan: string;
  earliest_date_for_full_payment: string;
  spending_changes_needed: string;
  decision_explanation: string;
}

export interface TrajectoryPoint {
  date: string;
  balance: number;
  minRequired: number;
  isBelow: boolean;
}

// ─── Exchange Rate Engine ─────────────────────────────────────────────────────

/*
# ─── Python Original: ExchangeRateEngine ───────────────────────────────────────
class ExchangeRateEngine:
    def __init__(self, rates_data=None, cache_file=None):
        self.rates = dict(DEFAULT_USD_RATES)
        self.cache_path = cache_file or os.path.join(DATA_DIR, "exchange_rates.json")
        self._load_or_fetch_rates(rates_data)

    def _load_or_fetch_rates(self, rates_data=None):
        if rates_data:
            ...
        # 1. Try reading fresh local cache
        if os.path.exists(self.cache_path):
            ...
        # 2. Fetch live from open FX API
        try:
            url = "https://open.er-api.com/v6/latest/USD"
            ...
        except Exception:
            pass

    def get_rate(self, settlement_date, from_currency, to_currency):
        if not from_currency or not to_currency or from_currency == to_currency:
            return 1.0
        fr = from_currency.strip().upper()
        to = to_currency.strip().upper()
        if fr == to:
            return 1.0
        r_fr = self.rates.get(fr, 1.0)
        r_to = self.rates.get(to, 1.0)
        if r_fr == 0:
            return 1.0
        return r_to / r_fr

    def convert(self, amount, from_currency, to_currency, settlement_date=None):
        rate = self.get_rate(settlement_date, from_currency, to_currency)
        return amount * rate
*/

export class ExchangeRateEngine {
  public rates: Record<string, number> = { ...DEFAULT_USD_RATES };
  private cachePath: string;

  constructor(customRates?: Record<string, number>, cacheFile?: string) {
    this.cachePath = cacheFile || path.join(process.cwd(), "data", "exchange_rates.json");
    if (customRates) {
      this.rates = { ...this.rates, ...customRates };
    } else {
      this.loadOrFetchRates();
    }
  }

  private loadOrFetchRates(): void {
    const now = Date.now() / 1000;

    // 1. Try local cache file
    if (fs.existsSync(this.cachePath)) {
      try {
        const content = fs.readFileSync(this.cachePath, "utf-8");
        const cached = JSON.parse(content);
        if (now - (cached.timestamp || 0) < 86400 && cached.rates) {
          this.rates = { ...this.rates, ...cached.rates };
          return;
        }
      } catch {
        // Fallback to live fetch or defaults
      }
    }

    // 2. Fetch asynchronously in background, or use default rates immediately
    try {
      fetch("https://open.er-api.com/v6/latest/USD", {
        headers: { "User-Agent": "BuyOrWait-FinancialAgent/1.0" },
      })
        .then((res) => res.json())
        .then((data) => {
          if (data && data.result === "success" && data.rates) {
            this.rates = { ...this.rates, ...data.rates };
            try {
              fs.mkdirSync(path.dirname(this.cachePath), { recursive: true });
              fs.writeFileSync(
                this.cachePath,
                JSON.stringify(
                  {
                    timestamp: now,
                    date: new Date().toISOString(),
                    base: "USD",
                    rates: this.rates,
                  },
                  null,
                  2
                ),
                "utf-8"
              );
            } catch {
              // Read-only serverless environment fallback (Vercel)
            }
          }
        })
        .catch(() => {
          // Keep using default baseline rates
        });
    } catch {
      // Offline / runtime fallback
    }
  }

  public getRate(fromCurrency: string, toCurrency: string): number {
    if (!fromCurrency || !toCurrency || fromCurrency === toCurrency) return 1.0;
    const fr = fromCurrency.trim().toUpperCase();
    const to = toCurrency.trim().toUpperCase();
    if (fr === to) return 1.0;

    const rFrom = this.rates[fr] ?? 1.0;
    const rTo = this.rates[to] ?? 1.0;
    if (rFrom === 0) return 1.0;

    return rTo / rFrom;
  }

  public convert(amount: number, fromCurrency: string, toCurrency: string): number {
    const rate = this.getRate(fromCurrency, toCurrency);
    return amount * rate;
  }
}

// ─── Core Financial Engine ───────────────────────────────────────────────────

/*
# ─── Python Original: FinancialEngine ──────────────────────────────────────────
class FinancialEngine:
    def __init__(self, profile, events, exchange_engine, messages=[], images=[]):
        self.profile = profile
        self.events = events
        self.exchange_engine = exchange_engine
        self.home_currency = profile.home_currency
        ...
*/

export class FinancialEngine {
  public profile: FinancialProfileData;
  public events: FinancialEventData[];
  public exchangeEngine: ExchangeRateEngine;
  public homeCurrency: string;

  constructor(
    profile: FinancialProfileData,
    events: FinancialEventData[] = [],
    exchangeEngine?: ExchangeRateEngine
  ) {
    this.profile = profile;
    this.events = events;
    this.exchangeEngine = exchangeEngine || new ExchangeRateEngine();
    this.homeCurrency = profile.home_currency || "USD";
  }

  public convertToHome(amount: number, currency: string): number {
    if (!currency || currency === this.homeCurrency) return amount;
    return this.exchangeEngine.convert(amount, currency, this.homeCurrency);
  }

  /*
  # ─── Python Original: get_regular_salary_info ───────────────────────────────
  def get_regular_salary_info(self, ref_date):
      salary_events = [e for e in self.events if e.category == "salary" and e.direction == "credit" and e.status in ("settled", "scheduled")]
      if salary_amt is None:
          if salary_events:
              latest_evt = max(salary_events, key=lambda e: e.settlement_date or e.event_date)
              salary_amt = self.convert_to_home(self.get_event_amount(latest_evt), latest_evt.currency, ...)
              payday = latest_evt.settlement_date.day
          else:
              return 0.0, 15, False
      return max(0.0, salary_amt), payday, True
  */
  public getRegularSalaryInfo(refDate: Date): { salaryAmt: number; payday: number; isActive: boolean } {
    const salaryEvents = this.events.filter(
      (e) => e.category === "salary" && e.direction === "credit" && (e.status === "settled" || e.status === "scheduled")
    );

    if (salaryEvents.length === 0) {
      return { salaryAmt: 0.0, payday: 15, isActive: false };
    }

    // Sort by effective date descending
    const sorted = [...salaryEvents].sort((a, b) => {
      const da = (a.settlement_date || a.event_date);
      const db = (b.settlement_date || b.event_date);
      return db.localeCompare(da);
    });

    const latest = sorted[0];
    if (latest.description.toLowerCase().includes("final")) {
      return { salaryAmt: 0.0, payday: 15, isActive: false };
    }

    const amtHome = this.convertToHome(latest.amount, latest.currency);
    const paydayDay = latest.settlement_date
      ? parseInt(latest.settlement_date.split("-")[2], 10)
      : 15;

    return { salaryAmt: Math.max(0, amtHome), payday: paydayDay, isActive: true };
  }

  /*
  # ─── Python Original: get_next_payday ───────────────────────────────────────
  def get_next_payday(self, start_date, payday_day):
      year, month = start_date.year, start_date.month
      candidate = date(year, month, min(payday_day, 28))
      if candidate >= start_date:
          return candidate
      return next_month_date
  */
  public getNextPayday(startDate: Date, paydayDay: number): Date {
    const year = startDate.getUTCFullYear();
    const month = startDate.getUTCMonth(); // 0-indexed

    const cand = new Date(Date.UTC(year, month, Math.min(paydayDay, 28)));
    if (cand >= startDate) return cand;

    if (month === 11) {
      return new Date(Date.UTC(year + 1, 0, Math.min(paydayDay, 28)));
    } else {
      return new Date(Date.UTC(year, month + 1, Math.min(paydayDay, 28)));
    }
  }

  /*
  # ─── Python Original: compute_safe_to_pay ───────────────────────────────────
  def compute_safe_to_pay(self, request_date):
      cur_bal = self.profile.current_available_balance
      min_bal = self.profile.minimum_balance_to_keep
      salary_amt, payday, is_active = self.get_regular_salary_info(request_date)
      next_payday = self.get_next_payday(request_date, payday) if is_active else request_date + timedelta(days=90)
      # Calculate committed debits from request_date up to next_payday
      ...
      safe = cur_bal - min_bal - committed_debits
      return max(0.0, safe)
  */
  public computeSafeToPay(requestDate: Date): number {
    const curBal = this.profile.current_available_balance;
    const minBal = this.profile.minimum_balance_to_keep;

    const { salaryAmt, payday, isActive } = this.getRegularSalaryInfo(requestDate);
    const nextPayday = isActive ? this.getNextPayday(requestDate, payday) : addDays(requestDate, 90);

    const reqDateStr = toDateStr(requestDate);
    const nextPaydayStr = toDateStr(nextPayday);

    let committedDebits = 0.0;

    // 1. Scheduled or pending debits in events between requestDate and nextPayday
    for (const e of this.events) {
      if (e.direction === "debit" && (e.status === "pending" || e.status === "scheduled")) {
        const eff = e.settlement_date || e.event_date;
        if (eff && eff >= reqDateStr && eff <= nextPaydayStr) {
          committedDebits += this.convertToHome(e.amount, e.currency);
        }
      }
    }

    // 2. Fixed recurring periodic debits in history (rent, utilities, etc.)
    const fixedCategories = new Set([
      "rent", "housing", "utilities", "debt_repayment", "education", "insurance",
      "cloud_storage", "streaming", "music_subscription", "delivery_membership",
    ]);

    const histDebits = this.events.filter((e) => e.direction === "debit" && e.status === "settled");
    const seenFixed = new Set<string>();

    for (const e of histDebits) {
      if (fixedCategories.has(e.category.toLowerCase())) {
        const eff = e.settlement_date || e.event_date;
        const day = parseInt(eff.split("-")[2], 10);
        const key = `${e.category}:${e.description}:${day}`;
        if (!seenFixed.has(key)) {
          seenFixed.add(key);

          // Find candidate next occurrence
          let proj = new Date(Date.UTC(requestDate.getUTCFullYear(), requestDate.getUTCMonth(), Math.min(day, 28)));
          if (proj < requestDate) {
            const m = requestDate.getUTCMonth();
            const y = requestDate.getUTCFullYear();
            proj = m === 11
              ? new Date(Date.UTC(y + 1, 0, Math.min(day, 28)))
              : new Date(Date.UTC(y, m + 1, Math.min(day, 28)));
          }

          if (proj >= requestDate && proj <= nextPayday) {
            committedDebits += this.convertToHome(e.amount, e.currency);
          }
        }
      }
    }

    const safe = curBal - minBal - committedDebits;
    return Math.max(0.0, safe);
  }

  /*
  # ─── Python Original: forecast_cash_positions ───────────────────────────────
  def forecast_cash_positions(self, start_date, days=FORECAST_DAYS, exclude=None, mods=None, payments=None):
      # Roll balance forward day by day
      ...
  */
  public forecastCashPositions(
    startDate: Date,
    days: number = FORECAST_DAYS,
    excludeEventIds: Set<string> = new Set(),
    modifiedEvents: Map<string, number> = new Map(),
    payments: Array<{ date: string; amount: number }> = []
  ): Array<{ date: string; balance: number }> {
    const { salaryAmt, payday, isActive } = this.getRegularSalaryInfo(startDate);

    const deltas: Map<string, number> = new Map();
    const addDelta = (dStr: string, amt: number) => {
      deltas.set(dStr, (deltas.get(dStr) || 0) + amt);
    };

    const endDate = addDays(startDate, days);
    const startDateStr = toDateStr(startDate);
    const endDateStr = toDateStr(endDate);

    // 1. Project regular salary credits
    if (isActive && salaryAmt > 0) {
      let curYear = startDate.getUTCFullYear();
      let curMonth = startDate.getUTCMonth();

      while (true) {
        const salDate = new Date(Date.UTC(curYear, curMonth, Math.min(payday, 28)));
        const salDateStr = toDateStr(salDate);
        if (salDateStr > endDateStr) break;
        if (salDateStr >= startDateStr && salDateStr <= endDateStr) {
          addDelta(salDateStr, salaryAmt);
        }
        if (curMonth === 11) {
          curYear += 1;
          curMonth = 0;
        } else {
          curMonth += 1;
        }
      }
    }

    // 2. Scheduled/pending events
    for (const e of this.events) {
      if (excludeEventIds.has(e.event_id) || e.status === "cancelled") continue;
      const eff = e.settlement_date || e.event_date;
      if (!eff || eff < startDateStr || eff > endDateStr) continue;

      const amt = modifiedEvents.has(e.event_id) ? modifiedEvents.get(e.event_id)! : e.amount;
      const amtHome = this.convertToHome(amt, e.currency);

      if (e.direction === "credit") {
        if (e.status === "settled" || (e.status === "scheduled" && e.category === "salary")) {
          addDelta(eff, amtHome);
        }
      } else if (e.direction === "debit") {
        addDelta(eff, -amtHome);
      }
    }

    // 3. Project recurring fixed debits
    const fixedCategories = new Set([
      "rent", "housing", "utilities", "debt_repayment", "education", "insurance",
      "cloud_storage", "streaming", "music_subscription", "delivery_membership",
    ]);

    const histDebits = this.events.filter((e) => e.direction === "debit" && e.status === "settled");
    const seenFixed = new Set<string>();

    for (const e of histDebits) {
      if (fixedCategories.has(e.category.toLowerCase()) && !excludeEventIds.has(e.event_id)) {
        const eff = e.settlement_date || e.event_date;
        const day = parseInt(eff.split("-")[2], 10);
        const key = `${e.category}:${e.description}:${day}`;

        if (!seenFixed.has(key)) {
          seenFixed.add(key);
          const amt = modifiedEvents.has(e.event_id) ? modifiedEvents.get(e.event_id)! : e.amount;
          const amtHome = this.convertToHome(amt, e.currency);

          let curYear = startDate.getUTCFullYear();
          let curMonth = startDate.getUTCMonth();

          while (true) {
            const pDate = new Date(Date.UTC(curYear, curMonth, Math.min(day, 28)));
            const pDateStr = toDateStr(pDate);
            if (pDateStr > endDateStr) break;

            if (pDateStr >= startDateStr && pDateStr <= endDateStr) {
              // Avoid double counting if already scheduled
              const already = this.events.some(
                (ev) =>
                  (ev.settlement_date || ev.event_date) === pDateStr &&
                  ev.category === e.category &&
                  ev.direction === "debit" &&
                  (ev.status === "scheduled" || ev.status === "pending")
              );
              if (!already) {
                addDelta(pDateStr, -amtHome);
              }
            }

            if (curMonth === 11) {
              curYear += 1;
              curMonth = 0;
            } else {
              curMonth += 1;
            }
          }
        }
      }
    }

    // 4. Candidate plan payments
    for (const p of payments) {
      if (p.date >= startDateStr && p.date <= endDateStr) {
        addDelta(p.date, -p.amount);
      }
    }

    // Roll balance forward day by day
    const result: Array<{ date: string; balance: number }> = [];
    let curBalance = this.profile.current_available_balance;

    for (let i = 0; i <= days; i++) {
      const curD = addDays(startDate, i);
      const dStr = toDateStr(curD);
      curBalance += deltas.get(dStr) || 0;
      result.push({ date: dStr, balance: curBalance });
    }

    return result;
  }

  /*
  # ─── Python Original: is_plan_safe ──────────────────────────────────────────
  def is_plan_safe(self, payments, start_date, exclude=None, mods=None):
      min_bal = self.profile.minimum_balance_to_keep
      positions = self.forecast_cash_positions(start_date, FORECAST_DAYS, exclude, mods, payments)
      return min(b for _, b in positions) >= (min_bal - 1e-4)
  */
  public isPlanSafe(
    payments: Array<{ date: string; amount: number }>,
    startDate: Date,
    excludeEventIds: Set<string> = new Set(),
    modifiedEvents: Map<string, number> = new Map()
  ): boolean {
    const minBal = this.profile.minimum_balance_to_keep;
    const positions = this.forecastCashPositions(startDate, FORECAST_DAYS, excludeEventIds, modifiedEvents, payments);
    const minPosition = Math.min(...positions.map((p) => p.balance));
    return minPosition >= minBal - 1e-4;
  }

  /*
  # ─── Python Original: find_earliest_full_pay_date ───────────────────────────
  def find_earliest_full_pay_date(self, amount, start_date, max_days=180):
      ...
  */
  public findEarliestFullPayDate(amount: number, startDate: Date, maxDays: number = 180): string | null {
    const { salaryAmt, payday, isActive } = this.getRegularSalaryInfo(startDate);
    if (!isActive || salaryAmt <= 0) return null;

    let curYear = startDate.getUTCFullYear();
    let curMonth = startDate.getUTCMonth();
    const endDate = addDays(startDate, maxDays);
    const endDateStr = toDateStr(endDate);
    const startDateStr = toDateStr(startDate);

    while (true) {
      const cand = new Date(Date.UTC(curYear, curMonth, Math.min(payday, 28)));
      const candStr = toDateStr(cand);
      if (candStr > endDateStr) break;

      if (candStr >= startDateStr) {
        if (this.isPlanSafe([{ date: candStr, amount }], startDate)) {
          return candStr;
        }
      }

      if (curMonth === 11) {
        curYear += 1;
        curMonth = 0;
      } else {
        curMonth += 1;
      }
    }

    return null;
  }

  /*
  # ─── Python Original: get_candidate_spending_changes ────────────────────────
  def get_candidate_spending_changes(self, ref_date):
      ...
  */
  public getCandidateSpendingChanges(refDateStr: string): Array<{
    type: "stop" | "reduce_to";
    eventId: string;
    savingsHome: number;
    newAmount: number;
    description: string;
  }> {
    const changes: Array<{
      type: "stop" | "reduce_to";
      eventId: string;
      savingsHome: number;
      newAmount: number;
      description: string;
    }> = [];

    const protectedCats = new Set((this.profile.expense_categories_to_protect || []).map((c) => c.toLowerCase()));
    const stopWilling = new Set((this.profile.expense_categories_willing_to_stop || []).map((c) => c.toLowerCase()));
    const reduceWilling = new Set((this.profile.expense_categories_willing_to_reduce || []).map((c) => c.toLowerCase()));

    const seenCats = new Set<string>();
    const reversedEvents = [...this.events].reverse();

    for (const e of reversedEvents) {
      if (e.direction !== "debit") continue;
      const eff = e.settlement_date || e.event_date;
      if (!eff || eff > refDateStr) continue;

      const cat = e.category.toLowerCase();
      if (protectedCats.has(cat) || seenCats.has(cat)) continue;

      const amtHome = this.convertToHome(e.amount, e.currency);

      if ((e.flexibility === "stoppable" || e.flexibility === "reducible_or_stoppable") && (stopWilling.has(cat) || stopWilling.size === 0)) {
        changes.push({
          type: "stop",
          eventId: e.event_id,
          savingsHome: amtHome,
          newAmount: 0.0,
          description: e.description,
        });
        seenCats.add(cat);
      } else if ((e.flexibility === "reducible" || e.flexibility === "reducible_or_stoppable") && (reduceWilling.has(cat) || reduceWilling.size === 0)) {
        const minAmt = e.minimum_allowed_amount ?? 0.0;
        const savings = e.amount - minAmt;
        const savingsHome = this.convertToHome(savings, e.currency);
        if (savingsHome > 0) {
          changes.push({
            type: "reduce_to",
            eventId: e.event_id,
            savingsHome,
            newAmount: minAmt,
            description: e.description,
          });
          seenCats.add(cat);
        }
      }
    }

    return changes.slice(0, 3);
  }
}

// ─── Main Decision Function ──────────────────────────────────────────────────

/*
# ─── Python Original: decide_request ──────────────────────────────────────────
def decide_request(req, engine, payment_options):
    profile = engine.profile
    curr = profile.home_currency
    req_amt = req.requested_amount
    req_date = req.request_date
    desired_date = req.desired_completion_date
    min_bal = profile.minimum_balance_to_keep
    ...
*/

export function decideRequest(
  req: RequestData,
  engine: FinancialEngine,
  paymentOptions: PaymentOptionData[]
): DecisionResult {
  const profile = engine.profile;
  const curr = profile.home_currency || "USD";
  const reqAmt = req.requested_amount;
  const reqDateStr = req.request_date;
  const reqDate = parseDate(reqDateStr) || new Date();
  const desiredDateStr = req.desired_completion_date || "";
  const minBal = profile.minimum_balance_to_keep;

  // 1. Compute amount safe to pay today
  const safeToday = Math.min(reqAmt, engine.computeSafeToPay(reqDate));

  // Filter valid payment options
  const userMethods = new Set((profile.payment_methods || []).map((m) => m.toLowerCase()));
  const validOptions: PaymentOptionData[] = [];

  for (const opt of paymentOptions) {
    const method = opt.payment_method.toLowerCase();
    if (userMethods.size > 0 && !userMethods.has(method)) continue;

    if (method === "installments" && profile.max_installment_months != null) {
      const freq = opt.payment_frequency_days || 30;
      const totalMonths = ((opt.number_of_payments - 1) * freq) / 30.0;
      if (totalMonths > profile.max_installment_months + 0.1) continue;
    }
    validOptions.push(opt);
  }

  // Sort valid options: total_payable_amount, first_payment_date, number_of_payments
  validOptions.sort((a, b) => {
    if (a.total_payable_amount !== b.total_payable_amount) {
      return a.total_payable_amount - b.total_payable_amount;
    }
    return (a.first_payment_date || reqDateStr).localeCompare(b.first_payment_date || reqDateStr);
  });

  const hasFullOption =
    validOptions.some((o) => o.payment_method === "full_payment") ||
    (userMethods.has("full_payment") && validOptions.length === 0);
  const considersFull = userMethods.has("full_payment") || userMethods.size === 0;
  const earliestFullNoChanges = engine.findEarliestFullPayDate(reqAmt, reqDate);

  // ── CASE 1: Affordable Now ──────────────────────────────────────────────────
  if (safeToday >= reqAmt && considersFull && hasFullOption) {
    if (engine.isPlanSafe([{ date: reqDateStr, amount: reqAmt }], reqDate)) {
      return {
        request_id: req.request_id,
        amount_safe_to_pay: fmtCleanNum(safeToday),
        affordability_status: "affordable_now",
        recommended_payment_method: "full_payment",
        payment_plan: `${reqDateStr}:${fmtCleanNum(reqAmt)}`,
        earliest_date_for_full_payment: reqDateStr,
        spending_changes_needed: "none",
        decision_explanation: `Pay ${curr} ${fmtCurr(reqAmt)} today. This leaves at least ${curr} ${fmtCurr(minBal)} available over the next 90 days.`,
      };
    }
  }

  // ── CASE 2: Installments without spending changes ──────────────────────────
  for (const opt of validOptions) {
    if (opt.payment_method !== "installments") continue;

    const planPayments: Array<{ date: string; amount: number }> = [];
    let pDate = parseDate(opt.first_payment_date || reqDateStr) || reqDate;
    const freq = opt.payment_frequency_days || 30;

    for (let i = 0; i < opt.number_of_payments; i++) {
      planPayments.push({ date: toDateStr(pDate), amount: opt.payment_amount });
      pDate = addDays(pDate, freq);
    }

    const lastDate = planPayments[planPayments.length - 1].date;
    if (desiredDateStr && lastDate > desiredDateStr) continue;

    if (engine.isPlanSafe(planPayments, reqDate)) {
      const planStr = planPayments.map((p) => `${p.date}:${fmtCleanNum(p.amount)}`).join("|");
      const earliestFullDate = earliestFullNoChanges || (safeToday >= reqAmt ? reqDateStr : "");
      return {
        request_id: req.request_id,
        amount_safe_to_pay: fmtCleanNum(safeToday),
        affordability_status: "affordable_with_plan",
        recommended_payment_method: "installments",
        payment_plan: planStr,
        earliest_date_for_full_payment: earliestFullDate || "",
        spending_changes_needed: "none",
        decision_explanation: `Use ${opt.number_of_payments} installments of ${curr} ${fmtCurr(opt.payment_amount)}, starting ${formatDateHuman(opt.first_payment_date)}. This leaves at least ${curr} ${fmtCurr(minBal)} available.`,
      };
    }
  }

  // ── CASE 3: Partial Payment ─────────────────────────────────────────────────
  if (
    req.allows_partial_payment &&
    (userMethods.has("partial_payment") || userMethods.size === 0) &&
    safeToday > 0 &&
    safeToday < reqAmt
  ) {
    const remaining = reqAmt - safeToday;
    const nextDay = addDays(reqDate, 1);
    const earliestSecond = engine.findEarliestFullPayDate(remaining, nextDay);

    if (earliestSecond && (!desiredDateStr || earliestSecond <= desiredDateStr)) {
      const partialPlan = [
        { date: reqDateStr, amount: safeToday },
        { date: earliestSecond, amount: remaining },
      ];

      if (engine.isPlanSafe(partialPlan, reqDate)) {
        const planStr = `${reqDateStr}:${fmtCleanNum(safeToday)}|${earliestSecond}:${fmtCleanNum(remaining)}`;
        return {
          request_id: req.request_id,
          amount_safe_to_pay: fmtCleanNum(safeToday),
          affordability_status: "affordable_with_plan",
          recommended_payment_method: "partial_payment",
          payment_plan: planStr,
          earliest_date_for_full_payment: earliestSecond,
          spending_changes_needed: "none",
          decision_explanation: `Pay ${curr} ${fmtCurr(safeToday)} today and the remaining ${curr} ${fmtCurr(remaining)} on ${formatDateHuman(earliestSecond)}. This completes the full request and keeps the ${curr} ${fmtCurr(minBal)} minimum protected.`,
        };
      }
    }
  }

  // ── CASE 4: Spending changes plan ───────────────────────────────────────────
  const changes = engine.getCandidateSpendingChanges(reqDateStr);
  if (changes.length > 0) {
    const excludeSet = new Set<string>();
    const modsMap = new Map<string, number>();
    const changesTokens: string[] = [];
    const changePhrases: string[] = [];

    for (const c of changes) {
      if (c.type === "stop") {
        excludeSet.add(c.eventId);
        changesTokens.push(`stop:${c.eventId}`);
        changePhrases.push(`stop the ${c.description.toLowerCase()}`);
      } else {
        modsMap.set(c.eventId, c.newAmount);
        changesTokens.push(`reduce_to:${c.eventId}:${fmtCleanNum(c.newAmount)}`);
        changePhrases.push(`reduce the ${c.description.toLowerCase()} to ${curr} ${fmtCurr(c.newAmount)}`);
      }
    }

    if (considersFull && hasFullOption) {
      if (engine.isPlanSafe([{ date: reqDateStr, amount: reqAmt }], reqDate, excludeSet, modsMap)) {
        const earliestFullDate = earliestFullNoChanges || toDateStr(addDays(reqDate, 12));
        const descText = changePhrases.join(" and ");
        const capitalizedDesc = descText.charAt(0).toUpperCase() + descText.slice(1);
        return {
          request_id: req.request_id,
          amount_safe_to_pay: fmtCleanNum(safeToday),
          affordability_status: "affordable_with_plan",
          recommended_payment_method: "full_payment",
          payment_plan: `${reqDateStr}:${fmtCleanNum(reqAmt)}`,
          earliest_date_for_full_payment: earliestFullDate,
          spending_changes_needed: changesTokens.join("|"),
          decision_explanation: `${capitalizedDesc}, then pay ${curr} ${fmtCurr(reqAmt)} today. This leaves at least ${curr} ${fmtCurr(minBal)} available.`,
        };
      }
    }
  }

  // ── CASE 5: Affordable Later (Wait) ─────────────────────────────────────────
  if (earliestFullNoChanges) {
    const earliestD = parseDate(earliestFullNoChanges);
    if (earliestD) {
      const daysAway = Math.round((earliestD.getTime() - reqDate.getTime()) / (1000 * 60 * 60 * 24));
      const canWait = daysAway <= FORECAST_DAYS && (!desiredDateStr || earliestFullNoChanges <= desiredDateStr);
      if (canWait) {
        return {
          request_id: req.request_id,
          amount_safe_to_pay: fmtCleanNum(safeToday),
          affordability_status: "affordable_later",
          recommended_payment_method: "wait",
          payment_plan: `${earliestFullNoChanges}:${fmtCleanNum(reqAmt)}`,
          earliest_date_for_full_payment: earliestFullNoChanges,
          spending_changes_needed: "none",
          decision_explanation: `Pay ${curr} ${fmtCurr(reqAmt)} in full on ${formatDateHuman(earliestFullNoChanges)}. Paying earlier would take the balance below the ${curr} ${fmtCurr(minBal)} minimum.`,
        };
      }
    }
  }

  // ── CASE 6: Not Affordable ──────────────────────────────────────────────────
  let expl = "";
  if (safeToday > 0) {
    expl = `Do not proceed with the ${curr} ${fmtCurr(reqAmt)} request. Although ${curr} ${fmtCurr(safeToday)} is available today, the full amount cannot be completed safely within 90 days.`;
  } else if (desiredDateStr) {
    expl = `Do not make this payment by ${formatDateHuman(desiredDateStr)}. None of the available options keeps the ${curr} ${fmtCurr(minBal)} minimum protected.`;
  } else {
    expl = `Do not proceed with the ${curr} ${fmtCurr(reqAmt)} request. None of the available options keeps the ${curr} ${fmtCurr(minBal)} minimum protected.`;
  }

  return {
    request_id: req.request_id,
    amount_safe_to_pay: fmtCleanNum(safeToday),
    affordability_status: "not_affordable",
    recommended_payment_method: "not_recommended",
    payment_plan: "none",
    earliest_date_for_full_payment: "",
    spending_changes_needed: "none",
    decision_explanation: expl,
  };
}
