"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";
import { ThemeToggle } from "@/components/ThemeToggle";
import {
  detectLocalityCurrency,
  getCurrencySymbol,
  SUPPORTED_CURRENCIES,
  getPresetQueries,
  getLocalizedDefaultScenario,
  type PresetQuery,
} from "@/lib/localeCurrency";

interface TrajectoryPoint {
  date: string;
  balance: number;
  minRequired: number;
  isBelow: boolean;
}

interface Decision {
  request_id?: string;
  amount_safe_to_pay: string;
  affordability_status: string;
  recommended_payment_method: string;
  payment_plan: string;
  earliest_date_for_full_payment: string;
  spending_changes_needed: string;
  decision_explanation: string;
}

interface ProfileData {
  name: string;
  homeCurrency: string;
  currentBalance: number;
  minimumBalance: number;
  monthlySalary: number;
  payday: number;
  monthlyFixedExpenses: number;
  financialPriorities: string[];
  expenseCategoriesToProtect: string[];
  expenseCategoriesWillingToReduce: string[];
  expenseCategoriesWillingToStop: string[];
  paymentMethodsUserWillConsider: string[];
  maxInstallmentMonths: number;
  updatedAt?: string;
}

interface HistoryItem {
  id: string;
  createdAt: string;
  query: string;
  amount: number;
  currency: string;
  requestDate: string;
  desiredDate?: string;
  allowsPartial?: boolean;
  uploadedReceiptName?: string;
  decision: Decision;
  profileSnapshot: {
    name?: string;
    currentBalance: number;
    minimumBalance: number;
    homeCurrency: string;
  };
  trajectory?: TrajectoryPoint[];
}

interface AnalysisResult {
  success: boolean;
  decision: Decision;
  profile: {
    user_id: string;
    home_currency: string;
    current_balance: number;
    minimum_balance: number;
    priorities: string[];
    payment_methods: string[];
  };
  trajectory: TrajectoryPoint[];
  savedHistoryId?: string;
}

const PRESET_QUERIES = [
  { text: "Can I afford to buy a new 4K Monitor for $899 today?", amount: 899, currency: "USD" },
  { text: "Can I replace the home HVAC condenser unit for $3,800?", amount: 3800, currency: "USD", allowsPartial: true },
  { text: "Can I book family vacation flight tickets for $1,450?", amount: 1450, currency: "USD" },
  { text: "Can I pay the annual car insurance premium of $920?", amount: 920, currency: "USD" },
  { text: "Can I purchase a commercial espresso machine for $2,400?", amount: 2400, currency: "USD", allowsPartial: true },
];

const SAMPLE_RECEIPTS = [
  { name: "laptop_receipt.pdf", label: "Laptop Invoice ($1,200)", amount: 1200 },
  { name: "hvac_quote.png", label: "HVAC Contractor Quote ($3,800)", amount: 3800 },
  { name: "airline_itinerary.pdf", label: "Flight Itinerary ($1,450)", amount: 1450 },
  { name: "car_insurance_bill.png", label: "Insurance Bill ($920)", amount: 920 },
];

const FAQ_ITEMS = [
  {
    question: "How does “Should I Buy It?” determine if I can afford a purchase?",
    answer:
      "Rather than simply checking if your current bank account balance exceeds the item price, our simulation projects your day-by-day cash flow over the next 90 days. It accounts for upcoming salary disbursements, recurring bill due dates, and your required emergency buffer. If the purchase would cause your liquid balance to dip below your safety cushion at any point over 90 days, it alerts you.",
  },
  {
    question: "Why is looking at my bank balance not enough before buying?",
    answer:
      "Bank balances reflect a static snapshot, not future commitments. A balance of $3,000 may seem adequate for an $800 laptop today, but if rent ($1,500) and insurance ($400) are due in 5 days before your next paycheck arrives, making that purchase creates an immediate liquidity crisis.",
  },
  {
    question: "Does “Should I Buy It?” require my banking credentials?",
    answer:
      "No. “Should I Buy It?” operates in Local Mode by default without requiring bank logins, Plaid integrations, or credit card connections. All math runs directly in your browser. If you choose to sign in, your profile is stored securely using Supabase Row Level Security.",
  },
  {
    question: "What should my minimum emergency buffer be?",
    answer:
      "Financial planners generally recommend maintaining at least 1 to 3 months of basic living expenses in liquid cash. In our simulator, you define your personal comfort floor (e.g. $1,000 to $5,000) so the algorithm prevents impulse purchases from compromising your security.",
  },
];

export default function StandaloneApp() {
  // Navigation Tabs: "advisor" | "history" | "profile"
  const [activeTab, setActiveTab] = useState<"advisor" | "history" | "profile">("advisor");

  // FAQ Accordion State (first item open by default for immediate preview)
  const [openFaqs, setOpenFaqs] = useState<Record<number, boolean>>({ 0: true });
  const toggleFaq = (idx: number) => {
    setOpenFaqs((prev) => ({ ...prev, [idx]: !prev[idx] }));
  };

  // Authentication State
  const [supabaseReady, setSupabaseReady] = useState(false);
  const [authUser, setAuthUser] = useState<any>(null);
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authMode, setAuthMode] = useState<"signin" | "signup">("signin");
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [authFullName, setAuthFullName] = useState("");
  const [authLoading, setAuthLoading] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [authMessage, setAuthMessage] = useState<string | null>(null);
  const [storageMode, setStorageMode] = useState<"supabase" | "local">("local");

  // Default profile for guest / unauthenticated state (empty — user must configure manually)
  const DEFAULT_PROFILE: ProfileData = {
    name: "",
    homeCurrency: "USD",
    currentBalance: 0,
    minimumBalance: 0,
    monthlySalary: 0,
    payday: 1,
    monthlyFixedExpenses: 0,
    financialPriorities: [],
    expenseCategoriesToProtect: [],
    expenseCategoriesWillingToReduce: [],
    expenseCategoriesWillingToStop: [],
    paymentMethodsUserWillConsider: [],
    maxInstallmentMonths: 6,
  };

  // Active Profile State
  const [profile, setProfile] = useState<ProfileData>(DEFAULT_PROFILE);
  const [profileLoading, setProfileLoading] = useState(true);
  const [profileSaving, setProfileSaving] = useState(false);
  const [profileSaveSuccess, setProfileSaveSuccess] = useState(false);

  // History State
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [historySearch, setHistorySearch] = useState("");
  const [historyStatusFilter, setHistoryStatusFilter] = useState("all");
  const [expandedHistoryId, setExpandedHistoryId] = useState<string | null>(null);

  // Evaluation Form State
  const [query, setQuery] = useState("Can I afford to buy a new laptop for $1,200 today?");
  const [amount, setAmount] = useState<number>(1200);
  const [currency, setCurrency] = useState("USD");
  const [requestDate, setRequestDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [desiredDate, setDesiredDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() + 30);
    return d.toISOString().split("T")[0];
  });
  const [allowsPartial, setAllowsPartial] = useState(false);
  const [uploadedFileName, setUploadedFileName] = useState<string>("");
  const [receiptAmount, setReceiptAmount] = useState<number | null>(null);

  // Dynamic sample queries adapted to the current currency
  const presetQueries = useMemo(() => getPresetQueries(currency), [currency]);

  // Locality Currency Auto-Detection & Preference Persistence
  useEffect(() => {
    try {
      const savedCurrency = localStorage.getItem("user_configured_currency");
      const localProfileStr = localStorage.getItem("custom_user_profile");
      let configuredCurrency: string | null = savedCurrency;

      if (!configuredCurrency && localProfileStr) {
        try {
          const parsed = JSON.parse(localProfileStr);
          if (parsed?.homeCurrency) configuredCurrency = parsed.homeCurrency;
        } catch {}
      }

      if (configuredCurrency) {
        // User has already explicitly configured a currency — respect their preference!
        setCurrency(configuredCurrency);
        setProfile((prev) => {
          let updated = { ...prev, homeCurrency: configuredCurrency! };
          if (localProfileStr) {
            try {
              const parsed = JSON.parse(localProfileStr);
              if (parsed && typeof parsed === "object") {
                updated = { ...updated, ...parsed, homeCurrency: configuredCurrency! };
              }
            } catch {}
          }
          return updated;
        });
      } else {
        // Unconfigured / first-time visitor: auto-detect currency from physical locality
        const detected = detectLocalityCurrency();
        setCurrency(detected);
        setProfile((prev) => ({ ...prev, homeCurrency: detected }));

        // Apply realistic localized scenario (e.g. ₹85,000 in India, $1,200 in US, €1,100 in Europe)
        const scenario = getLocalizedDefaultScenario(detected);
        setQuery(scenario.query);
        setAmount(scenario.amount);
      }
    } catch (e) {
      console.warn("Could not check local currency preference:", e);
    }
  }, []);

  // Execution & Results State
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Fetch profile from API (handles both Supabase and local modes)
  const fetchProfile = async () => {
    setProfileLoading(true);
    try {
      const res = await fetch("/api/profile");
      const data = await res.json();
      if (data.success && data.profile) {
        setProfile(data.profile);
        setCurrency(data.profile.homeCurrency || "USD");
        try {
          if (data.profile.homeCurrency) {
            localStorage.setItem("user_configured_currency", data.profile.homeCurrency);
          }
        } catch {}
      } else if (res.status === 404) {
        // No profile found — keep current state (defaults for guest, or Supabase defaults after login)
      }
      if (data.source) {
        setStorageMode(data.source);
      }
    } catch (err) {
      console.error("Failed to fetch profile:", err);
    } finally {
      setProfileLoading(false);
    }
  };

  // Fetch decision history from API
  const fetchHistory = async () => {
    setHistoryLoading(true);
    try {
      const res = await fetch("/api/history");
      const data = await res.json();
      if (data.success) {
        setHistory(data.history || []);
      }
    } catch (err) {
      console.error("Failed to fetch history:", err);
    } finally {
      setHistoryLoading(false);
    }
  };

  // Reload profile and history with a small delay (lets SSR cookies settle after auth events)
  const reloadUserData = (delayMs = 150) => {
    setTimeout(() => {
      fetchProfile();
      fetchHistory();
    }, delayMs);
  };

  // Initialize Supabase Auth & Listeners
  useEffect(() => {
    const configured = isSupabaseConfigured();
    setSupabaseReady(configured);
    if (!configured) {
      // No Supabase configured — stay on empty defaults, no local file loading
      setStorageMode("local");
      setProfileLoading(false);
      setHistoryLoading(false);
      return;
    }

    const supabase = createClient();
    if (!supabase) return;

    // Check existing session on mount
    supabase.auth.getUser().then(({ data: { user } }) => {
      setAuthUser(user);
      if (user) {
        setStorageMode("supabase");
        // Delay slightly so server route handler sees the auth cookies
        reloadUserData(150);
      } else {
        // Not signed in — keep empty defaults
        setStorageMode("local");
        setProfileLoading(false);
        setHistoryLoading(false);
      }
    });

    // Listen for auth state changes (sign-in, sign-out, token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      const user = session?.user || null;
      setAuthUser(user);

      if (event === "SIGNED_OUT") {
        // Reset to guest profile while preserving configured or detected local currency
        const localCurr =
          (typeof window !== "undefined" && localStorage.getItem("user_configured_currency")) ||
          detectLocalityCurrency();
        setProfile({ ...DEFAULT_PROFILE, homeCurrency: localCurr });
        setCurrency(localCurr);
        setHistory([]);
        setStorageMode("local");
        setProfileLoading(false);
        setHistoryLoading(false);
      } else if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        setStorageMode("supabase");
        // Delay fetch so that SSR cookies are fully committed before the API call
        reloadUserData(200);
      }
    });

    return () => {
      subscription.unsubscribe();
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleAuthSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthLoading(true);
    setAuthError(null);
    setAuthMessage(null);

    const supabase = createClient();
    if (!supabase) {
      setAuthError("Supabase environment variables are not configured.");
      setAuthLoading(false);
      return;
    }

    try {
      if (authMode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: authEmail,
          password: authPassword,
          options: {
            data: {
              full_name: authFullName || authEmail.split("@")[0],
            },
          },
        });
        if (error) throw error;
        if (data.session) {
          // Session exists immediately (e.g. email confirmation disabled)
          setAuthModalOpen(false);
        } else {
          setAuthMessage("Account created! Check your email to confirm your sign-up.");
        }
      } else {
        const { data, error } = await supabase.auth.signInWithPassword({
          email: authEmail,
          password: authPassword,
        });
        if (error) throw error;
        setAuthModalOpen(false);
      }
    } catch (err: any) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setAuthLoading(false);
    }
  };

  const handleSignOut = async () => {
    const supabase = createClient();
    if (supabase) {
      await supabase.auth.signOut();
      // onAuthStateChange SIGNED_OUT handler takes care of resetting state
    }
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileSaving(true);
    try {
      try {
        localStorage.setItem("user_configured_currency", profile.homeCurrency);
        localStorage.setItem("custom_user_profile", JSON.stringify(profile));
      } catch {}

      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
        setCurrency(data.profile.homeCurrency || profile.homeCurrency);
        setProfileSaveSuccess(true);
        setTimeout(() => setProfileSaveSuccess(false), 3500);
      }
    } catch (err) {
      console.error("Error saving profile:", err);
    } finally {
      setProfileSaving(false);
    }
  };

  const handleDeleteHistoryItem = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      const res = await fetch(`/api/history?id=${encodeURIComponent(id)}`, {
        method: "DELETE",
      });
      const data = await res.json();
      if (data.success) {
        setHistory(data.history);
      }
    } catch (err) {
      console.error("Failed to delete history item:", err);
    }
  };

  const handleClearHistory = async () => {
    if (!confirm("Are you sure you want to clear all decision history?")) return;
    try {
      const res = await fetch("/api/history", { method: "DELETE" });
      const data = await res.json();
      if (data.success) {
        setHistory([]);
      }
    } catch (err) {
      console.error("Failed to clear history:", err);
    }
  };

  const handlePresetSelect = (p: PresetQuery) => {
    setQuery(p.text);
    setAmount(p.amount);
    setCurrency(p.currency);
    setProfile((prev) => ({ ...prev, homeCurrency: p.currency }));
    setAllowsPartial(Boolean(p.allowsPartial));
  };

  const handleAttachReceipt = (rec: typeof SAMPLE_RECEIPTS[0]) => {
    setUploadedFileName(rec.name);
    setReceiptAmount(rec.amount);
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      const file = e.target.files[0];
      setUploadedFileName(file.name);
      const match = file.name.match(/\d+/);
      if (match) {
        setReceiptAmount(Number(match[0]));
      }
    }
  };

  const toggleArrayItem = (key: keyof ProfileData, item: string) => {
    const current = (profile[key] as string[]) || [];
    const updated = current.includes(item)
      ? current.filter((i) => i !== item)
      : [...current, item];
    setProfile({ ...profile, [key]: updated });
  };

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch("/api/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          amount,
          currency,
          requestDate,
          desiredDate,
          allowsPartial,
          uploadedReceiptName: uploadedFileName,
          extractedReceiptAmount: receiptAmount,
          customProfile: profile,
        }),
      });

      const data = await res.json();
      if (!data.success) {
        throw new Error(data.error || "Evaluation failed");
      }
      setResult(data);
      // Refresh history silently
      fetchHistory();
    } catch (err: any) {
      setError(err.message || "An unexpected error occurred.");
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "affordable_now":
        return {
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
          label: "Affordable Now",
          dot: "bg-emerald-500",
        };
      case "affordable_with_plan":
        return {
          bg: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
          label: "Affordable with Plan",
          dot: "bg-blue-500",
        };
      case "affordable_later":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
          label: "Affordable Later (Wait)",
          dot: "bg-amber-500",
        };
      case "not_affordable":
        return {
          bg: "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
          label: "Not Affordable",
          dot: "bg-rose-500",
        };
      default:
        return {
          bg: "bg-gray-100 text-gray-700 border-gray-200 dark:bg-[#1c1c1e] dark:text-gray-300 dark:border-white/10",
          label: status,
          dot: "bg-gray-400 dark:bg-gray-500",
        };
    }
  };

  const filteredHistory = useMemo(() => {
    return history.filter((item) => {
      const matchesSearch =
        item.query.toLowerCase().includes(historySearch.toLowerCase()) ||
        item.decision.decision_explanation.toLowerCase().includes(historySearch.toLowerCase());
      const matchesStatus =
        historyStatusFilter === "all" ||
        item.decision.affordability_status === historyStatusFilter;
      return matchesSearch && matchesStatus;
    });
  }, [history, historySearch, historyStatusFilter]);

  const historyStats = useMemo(() => {
    const total = history.length;
    const affordableNow = history.filter((h) => h.decision.affordability_status === "affordable_now").length;
    const withPlan = history.filter((h) => h.decision.affordability_status === "affordable_with_plan").length;
    const later = history.filter((h) => h.decision.affordability_status === "affordable_later").length;
    const notAffordable = history.filter((h) => h.decision.affordability_status === "not_affordable").length;
    return { total, affordableNow, withPlan, later, notAffordable };
  }, [history]);

  return (
    <div className="min-h-screen flex flex-col bg-[#fbfbfd] dark:bg-[#000000] text-[#1d1d1f] dark:text-[#f5f5f7] transition-colors duration-200">
      {/* Sleek Apple + Google Header */}
      <header className="sticky top-0 z-30 glass-nav w-full">
        <div className="max-w-6xl 2xl:max-w-7xl mx-auto px-2.5 sm:px-6 lg:px-8 h-14 sm:h-18 flex items-center justify-between gap-1.5 sm:gap-4">
          {/* Brand Logo & Name */}
          <div
            className="flex items-center space-x-1.5 sm:space-x-3 cursor-pointer group min-w-0 shrink"
            onClick={() => setActiveTab("advisor")}
          >
            <div className="w-7 h-7 sm:w-9 sm:h-9 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#34a853] flex items-center justify-center text-white font-bold text-xs sm:text-base shadow-sm group-hover:scale-110 group-hover:rotate-3 group-hover:shadow-blue-500/20 active:scale-95 transition-all duration-300 shrink-0">
              ✓
            </div>
            <div className="min-w-0">
              <h1 className="text-xs xs:text-sm sm:text-[17px] font-semibold tracking-tight text-[#1d1d1f] dark:text-white leading-tight group-hover:text-[#0071e3] dark:group-hover:text-blue-400 transition-colors truncate">
                Should I Buy It?
              </h1>
              <p className="hidden md:block text-[11px] text-[#86868b] dark:text-gray-400 tracking-tight">
                AI Financial Commitment Assistant
              </p>
            </div>
          </div>

          {/* Centered Segmented Navigation Pills — Desktop & Tablet only */}
          <nav className="hidden sm:flex items-center p-0.5 sm:p-1 bg-gray-200/60 dark:bg-white/[0.08] rounded-full border border-black/[0.04] dark:border-white/[0.08] text-xs font-medium shadow-inner shrink-0">
            <button
              onClick={() => setActiveTab("advisor")}
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all duration-200 flex items-center gap-1 sm:gap-1.5 hover:scale-105 active:scale-95 cursor-pointer ${
                activeTab === "advisor"
                  ? "bg-white text-gray-900 shadow-sm font-semibold dark:bg-[#2c2c2e] dark:text-white dark:shadow-md"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              <span>⚡</span>
              <span>Evaluate</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all duration-200 flex items-center gap-1 sm:gap-1.5 hover:scale-105 active:scale-95 cursor-pointer ${
                activeTab === "history"
                  ? "bg-white text-gray-900 shadow-sm font-semibold dark:bg-[#2c2c2e] dark:text-white dark:shadow-md"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              <span>📜</span>
              <span>History</span>
              {history.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700 dark:bg-blue-900/60 dark:text-blue-300 animate-pulse">
                  {history.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-3 sm:px-4 py-1 sm:py-1.5 rounded-full transition-all duration-200 flex items-center gap-1 sm:gap-1.5 hover:scale-105 active:scale-95 cursor-pointer ${
                activeTab === "profile"
                  ? "bg-white text-gray-900 shadow-sm font-semibold dark:bg-[#2c2c2e] dark:text-white dark:shadow-md"
                  : "text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
              }`}
            >
              <span>👤</span>
              <span>Profile</span>
            </button>
          </nav>

          {/* Right Action & User Profile Pill */}
          <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Active Mode Indicator — Mobile & Tablet (< lg: Only Active Mode shown) */}
            <div className="flex lg:hidden items-center shrink-0">
              {!authUser ? (
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-amber-500/10 text-amber-800 dark:text-amber-300 border border-amber-500/25 shadow-2xs hover:bg-amber-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Local Mode: Data stored on this device. Tap to sync with Cloud."
                  aria-label="Local storage mode active. Tap to sync with Cloud."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-500 shrink-0"></span>
                  <span className="leading-tight font-semibold">Local</span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("profile");
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-medium bg-sky-500/10 text-sky-800 dark:text-sky-300 border border-sky-500/25 shadow-2xs hover:bg-sky-500/20 active:scale-95 transition-all cursor-pointer shrink-0"
                  title="Cloud Mode: Synced with Supabase. Tap to view profile."
                  aria-label="Cloud sync mode active. Tap to view profile."
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-sky-500 animate-pulse shrink-0"></span>
                  <span className="leading-tight font-semibold">Cloud</span>
                </button>
              )}
            </div>

            {/* Dual Mode Indicator — Desktop (>= lg: Both Local & Cloud pills) */}
            <div className="hidden lg:flex items-center gap-1 p-0.5 bg-gray-100 dark:bg-white/[0.06] rounded-full border border-black/[0.04] dark:border-white/[0.08]">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  !authUser
                    ? "bg-white text-gray-800 shadow-sm border border-gray-200 dark:bg-[#2c2c2e] dark:text-gray-200 dark:border-white/10"
                    : "text-gray-400 dark:text-gray-500"
                }`}
                title="Local Offline Mode — data stored on disk"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !authUser ? "bg-amber-500" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                ></span>
                Local
              </span>
              <button
                type="button"
                onClick={() => {
                  if (!authUser) {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }
                }}
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  authUser
                    ? "bg-white text-sky-700 shadow-sm border border-sky-200 dark:bg-[#2c2c2e] dark:text-sky-300 dark:border-sky-800/50 cursor-default"
                    : "text-gray-400 dark:text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 cursor-pointer"
                }`}
                title={authUser ? "Connected to Supabase Cloud Database" : "Click to connect to Supabase Cloud"}
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    authUser ? "bg-sky-500 animate-pulse" : "bg-gray-300 dark:bg-gray-600"
                  }`}
                ></span>
                Cloud
              </button>
            </div>

            {/* Theme Selector (System / Light / Dark) */}
            <ThemeToggle />

            {/* User Session State */}
            {authUser ? (
              <div className="flex items-center gap-1 sm:gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="max-w-[100px] sm:max-w-[140px] truncate">{profile.name || authUser.email}</span>
                </div>
                {/* Mobile avatar */}
                <div
                  className="sm:hidden w-7 h-7 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-300 font-bold flex items-center justify-center text-xs shrink-0"
                  title={profile.name || authUser.email || "User"}
                >
                  {(profile.name || authUser.email || "U").charAt(0).toUpperCase()}
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-2 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 dark:text-gray-400 dark:hover:text-white dark:hover:bg-white/10 transition-colors cursor-pointer shrink-0"
                >
                  Sign Out
                </button>
              </div>
            ) : (
              <button
                onClick={() => {
                  setAuthMode("signin");
                  setAuthError(null);
                  setAuthMessage(null);
                  setAuthModalOpen(true);
                }}
                className="px-2.5 sm:px-4 py-1.5 rounded-full text-xs font-semibold bg-[#0071e3] hover:bg-[#0077ed] text-white shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1 sm:gap-1.5 shrink-0 cursor-pointer"
              >
                <span>Sign In</span>
                <span className="hidden xs:inline">→</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl 2xl:max-w-6xl w-full mx-auto px-3.5 sm:px-6 lg:px-8 py-5 sm:py-8 lg:py-10 pb-24 sm:pb-12">
        {/* Highlighted Visitor Sign-In / Sign-Up Dialogue */}
        {!authUser && (
          <div className="relative overflow-hidden rounded-2xl sm:rounded-3xl bg-gradient-to-r from-blue-600/[0.09] via-indigo-600/[0.08] to-emerald-600/[0.09] dark:from-blue-500/10 dark:via-indigo-500/10 dark:to-emerald-500/10 border-2 border-[#0071e3]/30 dark:border-blue-400/30 p-4 sm:p-6 mb-6 sm:mb-8 shadow-sm backdrop-blur-md">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 sm:gap-5">
              <div className="flex items-start gap-3 sm:gap-4">
                <div className="w-9 h-9 sm:w-11 sm:h-11 rounded-xl sm:rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#34a853] text-white flex items-center justify-center text-lg sm:text-xl shadow-md shrink-0">
                  ✨
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0071e3] text-white shadow-sm">
                      Visitor Tip
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white">
                      Sign in or create an account to save your profile & history
                    </h3>
                  </div>
                  <p className="text-xs text-[#515154] dark:text-[#a1a1a6] leading-relaxed max-w-2xl">
                    You are currently using <strong>Local Mode</strong> without an account. Sign in or sign up to permanently save your custom financial profile configurations, access them across devices, and keep an auditable 90-day history of all your purchase evaluations.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 w-full md:w-auto mt-2 md:mt-0">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }}
                  className="flex-1 md:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-white hover:bg-gray-50 text-gray-800 dark:bg-[#2c2c2e] dark:hover:bg-[#3a3a3c] dark:text-white text-xs font-semibold border border-gray-200 dark:border-white/10 shadow-sm transition-all hover:scale-105 active:scale-95 text-center cursor-pointer"
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signup");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }}
                  className="flex-1 md:flex-initial px-3.5 sm:px-4 py-2 sm:py-2.5 rounded-xl bg-gradient-to-r from-[#0071e3] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <span>Sign Up</span>
                  <span>→</span>
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 1: ADVISOR / EVALUATE PURCHASE */}
        {/* ========================================================================= */}
        {activeTab === "advisor" && (
          <div className="space-y-6 sm:space-y-8">
            {/* Hero Banner */}
            <div className="text-center max-w-2xl 2xl:max-w-3xl mx-auto pt-1 sm:pt-2 pb-3 sm:pb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-[11px] sm:text-xs font-semibold bg-[#e8f0fe] text-[#1a73e8] dark:bg-blue-950/50 dark:text-blue-300 dark:border dark:border-blue-800/40 mb-2.5 sm:mb-3">
                90-Day Liquidity Invariant Simulator
              </span>
              <h2 className="text-2xl sm:text-3xl md:text-4xl 2xl:text-5xl font-bold tracking-tight text-[#1d1d1f] dark:text-white mb-2 sm:mb-2.5">
                Should I buy it now, plan, or wait?
              </h2>
              <p className="text-xs sm:text-sm text-[#86868b] dark:text-gray-400 leading-relaxed px-2">
                Enter any upcoming expense or purchase. Our engine verifies your recurring payroll, essential bills, and reserve buffer over the next 90 days with mathematical rigor.
              </p>
            </div>

            {/* Active Profile Bar */}
            <div className="apple-card p-3.5 sm:p-4 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs bg-white/90 dark:bg-[#1c1c1e]/90">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#0071e3] dark:bg-blue-950/60 dark:text-blue-400 font-bold flex items-center justify-center text-xs shrink-0">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : "G"}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 dark:text-white block">
                    Active Account: {profile.name || "Guest (Unsaved Profile)"}
                  </span>
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] sm:text-xs text-gray-500 dark:text-gray-400">
                    <span>Available: <strong className="text-gray-800 dark:text-gray-200">{getCurrencySymbol(profile.homeCurrency)}{(profile.currentBalance || 0).toLocaleString()} {profile.homeCurrency}</strong></span>
                    <span className="hidden xs:inline text-gray-300 dark:text-gray-600">•</span>
                    <span>Reserve Buffer: <strong className="text-gray-800 dark:text-gray-200">{getCurrencySymbol(profile.homeCurrency)}{(profile.minimumBalance || 0).toLocaleString()} {profile.homeCurrency}</strong></span>
                  </div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="text-xs font-semibold text-[#0071e3] dark:text-blue-400 hover:underline self-start sm:self-auto shrink-0"
              >
                Configure Profile & Bills →
              </button>
            </div>

            {/* Evaluation Form Card */}
            <div className="apple-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm">
              <form onSubmit={handleAnalyze} className="space-y-5 sm:space-y-6">
                {/* Question Input */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-2">
                    Purchase Description / Question
                  </label>
                  <textarea
                    rows={2}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder={`e.g. Can I afford to buy a new laptop for ${getCurrencySymbol(currency)}${currency === "INR" ? "85,000" : "1,200"} today?`}
                    className="w-full p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all resize-none font-normal placeholder:text-gray-400 dark:placeholder:text-gray-600"
                    required
                  />

                  {/* Preset Suggestions */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mr-1">Sample Scenarios:</span>
                    {presetQueries.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePresetSelect(p)}
                        className="interactive-pill text-[11px] px-2.5 sm:px-3 py-1 rounded-full bg-white dark:bg-[#2c2c2e] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-[#0071e3]/40 dark:hover:border-blue-500/40 hover:text-[#0071e3] dark:hover:text-blue-300 border border-gray-200 dark:border-white/10 text-gray-600 dark:text-gray-300 font-medium shadow-sm hover:shadow active:scale-95 transition-all duration-200 cursor-pointer"
                      >
                        {p.text.slice(0, 36)}...
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount, Currency, Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => {
                        const val = e.target.value;
                        setCurrency(val);
                        setProfile((prev) => ({ ...prev, homeCurrency: val }));
                        try {
                          localStorage.setItem("user_configured_currency", val);
                        } catch {}
                      }}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Request Date
                    </label>
                    <input
                      type="date"
                      value={requestDate}
                      onChange={(e) => setRequestDate(e.target.value)}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Target Safe Date
                    </label>
                    <input
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                    />
                  </div>
                </div>

                {/* Partial Payment Options & Document Attachment */}
                <div className="p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f5f7]/60 dark:bg-[#151518]/60 border border-gray-200/80 dark:border-white/10 space-y-3">
                  <div className="flex items-start sm:items-center space-x-3">
                    <input
                      type="checkbox"
                      id="partial-check"
                      checked={allowsPartial}
                      onChange={(e) => setAllowsPartial(e.target.checked)}
                      className="mt-0.5 sm:mt-0 h-4 w-4 rounded text-[#0071e3] focus:ring-[#0071e3] border-gray-300 dark:border-white/20 bg-white dark:bg-[#2c2c2e] shrink-0"
                    />
                    <label htmlFor="partial-check" className="text-xs font-medium text-gray-700 dark:text-gray-300 cursor-pointer leading-snug">
                      I am open to financing, installments, or split payments (e.g. 3 to 6 months)
                    </label>
                  </div>

                  {/* Document & Receipt OCR / Extraction */}
                  <div className="pt-2 border-t border-gray-200/60 dark:border-white/10 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                    <div className="flex items-center space-x-2">
                      <input
                        type="file"
                        id="doc-upload"
                        accept=".pdf,.png,.jpg,.jpeg"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label htmlFor="doc-upload" className="cursor-pointer block">
                        <span className="text-xs text-gray-600 dark:text-gray-400 font-medium">
                          {uploadedFileName ? (
                            <span className="text-[#0071e3] dark:text-blue-400 font-semibold break-all">📎 Attached: {uploadedFileName}</span>
                          ) : (
                            <span>Click to upload receipt or bill (PNG, JPG, PDF)</span>
                          )}
                        </span>
                      </label>
                    </div>

                    {uploadedFileName && (
                      <button
                        type="button"
                        onClick={() => {
                          setUploadedFileName("");
                          setReceiptAmount(null);
                        }}
                        className="text-xs text-rose-600 dark:text-rose-400 hover:underline px-2 py-1 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Sample Receipts */}
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-gray-400 dark:text-gray-500 font-medium mr-1">Quick Sample Invoices:</span>
                    {SAMPLE_RECEIPTS.map((doc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAttachReceipt(doc)}
                        className="interactive-pill text-[10px] px-2.5 py-1 rounded-full bg-gray-100 dark:bg-[#2c2c2e] hover:bg-blue-50 dark:hover:bg-blue-950/40 hover:border-blue-200 dark:hover:border-blue-800 hover:text-[#0071e3] dark:hover:text-blue-300 text-gray-600 dark:text-gray-300 font-medium transition-all duration-200 cursor-pointer shadow-xs"
                      >
                        + {doc.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-3 sm:pt-4 flex items-center justify-end">
                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full sm:w-auto group px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0071e3] via-[#0077ed] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white font-semibold text-xs shadow-md shadow-blue-500/20 hover:shadow-lg hover:shadow-blue-500/30 hover:-translate-y-0.5 active:scale-98 disabled:opacity-50 disabled:pointer-events-none transition-all duration-200 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {loading ? (
                      <>
                        <svg className="animate-spin h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                        <span>Simulating 90-Day Cash Flow...</span>
                      </>
                    ) : (
                      <>
                        <span>Verify Affordability</span>
                        <span className="group-hover:translate-x-1 transition-transform duration-200">→</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>

            {/* Error Message */}
            {error && (
              <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {error}
              </div>
            )}

            {/* ===================================================================== */}
            {/* Dynamic Results Presentation */}
            {/* ===================================================================== */}
            {result && (
              <div className="apple-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm space-y-5 sm:space-y-6 animate-fadeInUp">
                {/* Result Header Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100 dark:border-white/10">
                  <div className="flex flex-wrap items-center gap-2.5 sm:gap-3">
                    <span
                      className={`inline-flex items-center px-3 sm:px-3.5 py-1 sm:py-1.5 rounded-full text-xs font-bold border transition-transform duration-200 hover:scale-105 cursor-default shadow-xs ${
                        getStatusBadge(result.decision.affordability_status).bg
                      }`}
                    >
                      <span className="relative flex h-2 w-2 mr-2">
                        <span
                          className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                            getStatusBadge(result.decision.affordability_status).dot
                          }`}
                        />
                        <span
                          className={`relative inline-flex rounded-full h-2 w-2 ${
                            getStatusBadge(result.decision.affordability_status).dot
                          }`}
                        />
                      </span>
                      {getStatusBadge(result.decision.affordability_status).label}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                      Method: <strong className="text-gray-800 dark:text-gray-200 uppercase">{result.decision.recommended_payment_method.replace("_", " ")}</strong>
                    </span>
                  </div>

                  <span className="self-start sm:self-auto text-[11px] text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 dark:text-emerald-300 px-2.5 py-1 rounded-full border border-emerald-200 dark:border-emerald-800/50 font-medium">
                    ✓ Saved to Decision History
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4">
                  <div className="hover-lift p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f5f7] dark:bg-[#151518] border border-transparent dark:border-white/10 hover:border-blue-300/40 dark:hover:border-blue-500/30 hover:shadow-sm transition-all cursor-default">
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold block">
                      Safe to Pay Today
                    </span>
                    <span className="text-lg sm:text-xl lg:text-2xl font-bold text-gray-900 dark:text-white mt-1 block truncate">
                      {getCurrencySymbol(result.profile.home_currency)}{Number(result.decision.amount_safe_to_pay).toLocaleString()} <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{result.profile.home_currency}</span>
                    </span>
                  </div>

                  <div className="hover-lift p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f5f7] dark:bg-[#151518] border border-transparent dark:border-white/10 hover:border-blue-300/40 dark:hover:border-blue-500/30 hover:shadow-sm transition-all cursor-default">
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold block">
                      Earliest Safe Full Date
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mt-1 block truncate">
                      {result.decision.earliest_date_for_full_payment || "Beyond 90 Days"}
                    </span>
                  </div>

                  <div className="hover-lift p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f5f7] dark:bg-[#151518] border border-transparent dark:border-white/10 hover:border-blue-300/40 dark:hover:border-blue-500/30 hover:shadow-sm transition-all cursor-default">
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold block">
                      Current Account
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mt-1 block truncate">
                      {getCurrencySymbol(result.profile.home_currency)}{result.profile.current_balance.toLocaleString()} <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{result.profile.home_currency}</span>
                    </span>
                  </div>

                  <div className="hover-lift p-3.5 sm:p-4 rounded-xl sm:rounded-2xl bg-[#f5f5f7] dark:bg-[#151518] border border-transparent dark:border-white/10 hover:border-blue-300/40 dark:hover:border-blue-500/30 hover:shadow-sm transition-all cursor-default">
                    <span className="text-[10px] sm:text-[11px] uppercase tracking-wider text-gray-500 dark:text-gray-400 font-semibold block">
                      Reserve Shield
                    </span>
                    <span className="text-xs sm:text-sm font-bold text-gray-900 dark:text-white mt-1 block truncate">
                      {getCurrencySymbol(result.profile.home_currency)}{result.profile.minimum_balance.toLocaleString()} <span className="text-xs text-gray-400 dark:text-gray-500 font-medium">{result.profile.home_currency}</span>
                    </span>
                  </div>
                </div>

                {/* Recommendation Plain English */}
                <div className="hover-lift p-4 sm:p-5 rounded-xl sm:rounded-2xl bg-gradient-to-r from-blue-50/70 to-emerald-50/70 dark:from-blue-950/30 dark:to-emerald-950/30 border border-blue-100 dark:border-blue-800/40 text-gray-900 dark:text-gray-200 text-xs sm:text-sm leading-relaxed font-medium shadow-xs">
                  {result.decision.decision_explanation}
                </div>

                {/* Trajectory Forward Chart */}
                {result.trajectory && result.trajectory.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      90-Day Balance Forward Trajectory Forecast
                    </h4>
                    <div className="hover-lift bg-gray-50 dark:bg-[#151518] p-3.5 sm:p-5 rounded-xl sm:rounded-2xl border border-gray-100 dark:border-white/10 transition-all">
                      <div className="relative h-36 sm:h-44 md:h-48 w-full">
                        <svg className="w-full h-full overflow-visible" viewBox="0 0 500 150" preserveAspectRatio="none">
                          {(() => {
                            const balances = result.trajectory.map((t) => t.balance);
                            const minReq = result.profile.minimum_balance;
                            const allVals = [...balances, minReq];
                            const minVal = Math.min(...allVals) * 0.9;
                            const maxVal = Math.max(...allVals) * 1.1;
                            const range = Math.max(1, maxVal - minVal);

                            const points = result.trajectory
                              .map((t, idx) => {
                                const x = (idx / (result.trajectory.length - 1)) * 500;
                                const y = 150 - ((t.balance - minVal) / range) * 140;
                                return `${x},${y}`;
                              })
                              .join(" ");

                            const minLineY = 150 - ((minReq - minVal) / range) * 140;

                            return (
                              <>
                                <line
                                  x1="0"
                                  y1={minLineY}
                                  x2="500"
                                  y2={minLineY}
                                  stroke="#ea4335"
                                  strokeDasharray="4 4"
                                  strokeWidth="1.5"
                                />
                                <polyline className="chart-line" fill="none" stroke="#0071e3" strokeWidth="2.5" points={points} />
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 mt-2 px-1">
                        <span>Day 0 ({requestDate})</span>
                        <span className="text-red-500 dark:text-red-400 font-semibold flex items-center">
                          <span className="w-2.5 h-0.5 bg-red-500 inline-block mr-1"></span>
                          Min Reserve: {getCurrencySymbol(result.profile.home_currency)}{result.profile.minimum_balance.toLocaleString()} ({result.profile.home_currency})
                        </span>
                        <span className="text-blue-600 dark:text-blue-400 font-semibold flex items-center">
                          <span className="w-2.5 h-0.5 bg-blue-600 inline-block mr-1"></span>
                          Projected Balance
                        </span>
                        <span>Day 90</span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Payment Plan Timeline */}
                {result.decision.payment_plan && result.decision.payment_plan !== "none" && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Recommended Payment Schedule
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-2.5 sm:gap-3">
                      {result.decision.payment_plan.split("|").map((entry, idx) => {
                        const [pDate, pAmt] = entry.split(":");
                        return (
                          <div key={idx} className="hover-lift p-3.5 sm:p-4 rounded-xl bg-gray-50 dark:bg-[#151518] border border-gray-100 dark:border-white/10 hover:border-blue-200 dark:hover:border-blue-900/50 text-xs transition-all cursor-default">
                            <span className="text-gray-400 dark:text-gray-500 block font-medium">Payment {idx + 1}</span>
                            <span className="font-semibold text-gray-800 dark:text-gray-200 block text-xs sm:text-sm mt-0.5">{pDate}</span>
                            <span className="font-bold text-[#0071e3] dark:text-blue-400 mt-1 block">
                              {getCurrencySymbol(result.profile.home_currency)}{Number(pAmt).toLocaleString()} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">{result.profile.home_currency}</span>
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                {/* Spending Adjustments */}
                {result.decision.spending_changes_needed && result.decision.spending_changes_needed !== "none" && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                      Identified Flexible Spending Changes Needed
                    </h4>
                    <div className="flex flex-wrap gap-1.5 sm:gap-2">
                      {result.decision.spending_changes_needed.split("|").map((sc, idx) => (
                        <span
                          key={idx}
                          className="interactive-pill px-2.5 sm:px-3 py-1 sm:py-1.5 rounded-full text-[11px] sm:text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 shadow-2xs cursor-default"
                        >
                          {sc}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 2: DECISION HISTORY */}
        {/* ========================================================================= */}
        {activeTab === "history" && (
          <div className="space-y-6">
            {/* Gate: require authentication for history */}
            {!authUser ? (
              <div className="apple-card p-8 sm:p-12 md:p-16 rounded-2xl sm:rounded-3xl text-center max-w-lg mx-auto">
                <div className="w-14 h-14 sm:w-16 sm:h-16 rounded-2xl sm:rounded-3xl bg-gradient-to-br from-blue-50 to-sky-100 flex items-center justify-center mx-auto mb-4 sm:mb-5 text-xl sm:text-2xl">
                  🔒
                </div>
                <h3 className="text-base sm:text-lg font-bold text-[#1d1d1f] dark:text-white tracking-tight mb-2">
                  Sign in to view your history
                </h3>
                <p className="text-xs text-[#86868b] dark:text-gray-400 leading-relaxed max-w-sm mx-auto mb-6">
                  Decision history is saved to your private cloud account. Sign in or create an account to start tracking your purchase evaluations.
                </p>
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }}
                  className="w-full sm:w-auto px-6 py-3 rounded-2xl bg-gradient-to-r from-[#0071e3] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white font-semibold text-xs shadow-md transition-all active:scale-95 inline-flex items-center justify-center gap-2 cursor-pointer"
                >
                  <span>Sign In to Continue</span>
                  <span>→</span>
                </button>
              </div>
            ) : (
            <>
            {/* Header & Stats Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 sm:gap-4">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                  Decision History
                </h2>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Audit and review all past purchase evaluations and 90-day trajectory checks.
                </p>
              </div>

              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-gray-200 hover:border-rose-300 dark:border-white/10 dark:hover:border-rose-500 text-xs font-medium text-gray-600 hover:text-rose-600 dark:text-gray-400 dark:hover:text-rose-400 transition-colors cursor-pointer"
                >
                  Clear History
                </button>
              )}
            </div>

            {/* Stats Overview Pill Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
              <div className="col-span-2 sm:col-span-1 p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-white dark:bg-[#1c1c1e] border border-gray-100 dark:border-white/10 shadow-sm text-center">
                <span className="text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500 font-medium block">Total Checks</span>
                <span className="text-base sm:text-lg font-bold text-gray-800 dark:text-gray-100">{historyStats.total}</span>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-emerald-50/60 dark:bg-emerald-950/30 border border-emerald-100 dark:border-emerald-800/40 text-center">
                <span className="text-[10px] sm:text-[11px] text-emerald-600 dark:text-emerald-400 font-medium block">Affordable Now</span>
                <span className="text-base sm:text-lg font-bold text-emerald-700 dark:text-emerald-300">{historyStats.affordableNow}</span>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-blue-50/60 dark:bg-blue-950/30 border border-blue-100 dark:border-blue-800/40 text-center">
                <span className="text-[10px] sm:text-[11px] text-blue-600 dark:text-blue-400 font-medium block">With Plan</span>
                <span className="text-base sm:text-lg font-bold text-blue-700 dark:text-blue-300">{historyStats.withPlan}</span>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-amber-50/60 dark:bg-amber-950/30 border border-amber-100 dark:border-amber-800/40 text-center">
                <span className="text-[10px] sm:text-[11px] text-amber-600 dark:text-amber-400 font-medium block">Wait (Later)</span>
                <span className="text-base sm:text-lg font-bold text-amber-700 dark:text-amber-300">{historyStats.later}</span>
              </div>
              <div className="p-2.5 sm:p-3 rounded-xl sm:rounded-2xl bg-rose-50/60 dark:bg-rose-950/30 border border-rose-100 dark:border-rose-800/40 text-center">
                <span className="text-[10px] sm:text-[11px] text-rose-600 dark:text-rose-400 font-medium block">Not Affordable</span>
                <span className="text-base sm:text-lg font-bold text-rose-700 dark:text-rose-300">{historyStats.notAffordable}</span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
              <div className="relative w-full sm:w-64 md:w-72">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search evaluations..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600 text-xs focus:ring-2 focus:ring-[#0071e3]/30"
                />
                <span className="absolute left-3 top-2.5 text-gray-400 dark:text-gray-500 text-xs">🔍</span>
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap gap-1.5 self-stretch sm:self-auto">
                {[
                  { id: "all", label: "All" },
                  { id: "affordable_now", label: "Affordable Now" },
                  { id: "affordable_with_plan", label: "With Plan" },
                  { id: "affordable_later", label: "Wait" },
                  { id: "not_affordable", label: "Not Affordable" },
                ].map((chip) => (
                  <button
                    key={chip.id}
                    onClick={() => setHistoryStatusFilter(chip.id)}
                    className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium transition-all cursor-pointer ${
                      historyStatusFilter === chip.id
                        ? "bg-gray-900 text-white dark:bg-white dark:text-gray-900 shadow-sm"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50 dark:bg-[#1c1c1e] dark:text-gray-300 dark:border-white/10 dark:hover:bg-[#2c2c2e]"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* History List */}
            {historyLoading ? (
              <div className="text-center py-12 text-xs text-gray-400 dark:text-gray-500">Loading history...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="apple-card p-8 sm:p-12 rounded-2xl sm:rounded-3xl text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 dark:bg-[#2c2c2e] text-gray-400 dark:text-gray-500 flex items-center justify-center mx-auto mb-3 text-lg">
                  📋
                </div>
                <h3 className="text-sm font-bold text-gray-800 dark:text-white">No evaluations found</h3>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 max-w-sm mx-auto">
                  {historySearch || historyStatusFilter !== "all"
                    ? "Try adjusting your search filters or status tags."
                    : "You haven't run any evaluations yet. Check a purchase to see it logged here."}
                </p>
                <button
                  onClick={() => setActiveTab("advisor")}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#0071e3] text-white text-xs font-semibold hover:bg-blue-600 transition-colors cursor-pointer"
                >
                  Start an Evaluation
                </button>
              </div>
            ) : (
              <div className="space-y-3 sm:space-y-4">
                {filteredHistory.map((item) => {
                  const isExpanded = expandedHistoryId === item.id;
                  const statusInfo = getStatusBadge(item.decision.affordability_status);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                      className="apple-card p-3.5 sm:p-5 rounded-xl sm:rounded-2xl cursor-pointer hover:border-gray-300 dark:hover:border-white/20 transition-all space-y-2.5 sm:space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-2.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusInfo.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusInfo.dot}`}></span>
                            {statusInfo.label}
                          </span>
                          <span className="text-xs font-bold text-gray-800 dark:text-gray-200">
                            {getCurrencySymbol(item.currency)}{Number(item.amount).toLocaleString()} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">{item.currency}</span>
                          </span>
                          {item.uploadedReceiptName && (
                            <span className="text-[10px] bg-gray-100 dark:bg-[#2c2c2e] text-gray-600 dark:text-gray-300 px-2 py-0.5 rounded-full max-w-[150px] sm:max-w-none truncate">
                              📎 {item.uploadedReceiptName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-2 pt-1 sm:pt-0 border-t sm:border-t-0 border-gray-100 dark:border-white/5">
                          <span className="text-[10px] sm:text-[11px] text-gray-400 dark:text-gray-500">
                            {new Date(item.createdAt).toLocaleDateString()} at{" "}
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <button
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            className="p-1 rounded-lg text-gray-300 dark:text-gray-600 hover:text-rose-600 dark:hover:text-rose-400 transition-colors cursor-pointer"
                            title="Delete this record"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Query Text */}
                      <p className="text-xs sm:text-sm font-semibold text-gray-900 dark:text-white">
                        {item.query}
                      </p>

                      {/* Explanation Snippet */}
                      <p className="text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                        {item.decision.decision_explanation}
                      </p>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="pt-3 sm:pt-4 border-t border-gray-100 dark:border-white/10 space-y-3 sm:space-y-4 mt-2" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3 text-xs">
                            <div className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-[#151518] border border-transparent dark:border-white/10">
                              <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase font-bold">Safe Today</span>
                              <span className="font-bold text-gray-800 dark:text-gray-200 text-xs sm:text-sm truncate block">
                                {getCurrencySymbol(item.currency)}{Number(item.decision.amount_safe_to_pay).toLocaleString()} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">{item.currency}</span>
                              </span>
                            </div>
                            <div className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-[#151518] border border-transparent dark:border-white/10">
                              <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase font-bold">Method</span>
                              <span className="font-bold text-gray-800 dark:text-gray-200 text-xs sm:text-sm uppercase truncate block">
                                {item.decision.recommended_payment_method.replace("_", " ")}
                              </span>
                            </div>
                            <div className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-[#151518] border border-transparent dark:border-white/10">
                              <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase font-bold">Full Date</span>
                              <span className="font-bold text-gray-800 dark:text-gray-200 text-xs sm:text-sm truncate block">
                                {item.decision.earliest_date_for_full_payment || "N/A"}
                              </span>
                            </div>
                            <div className="p-2.5 sm:p-3 rounded-xl bg-gray-50 dark:bg-[#151518] border border-transparent dark:border-white/10">
                              <span className="text-gray-400 dark:text-gray-500 block text-[10px] uppercase font-bold">Account Buffer</span>
                              <span className="font-bold text-gray-800 dark:text-gray-200 text-xs sm:text-sm truncate block">
                                {getCurrencySymbol(item.currency)}{item.profileSnapshot.minimumBalance.toLocaleString()} <span className="text-[10px] text-gray-400 dark:text-gray-500 font-normal">{item.currency}</span>
                              </span>
                            </div>
                          </div>

                          {/* Payment Plan if present */}
                          {item.decision.payment_plan && item.decision.payment_plan !== "none" && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
                                Payment Schedule
                              </span>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {item.decision.payment_plan.split("|").map((p, idx) => {
                                  const [pDate, pAmt] = p.split(":");
                                  return (
                                    <span
                                      key={idx}
                                      className="px-2.5 sm:px-3 py-1 rounded-xl bg-blue-50 text-blue-800 border border-blue-100 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50 text-xs font-medium"
                                    >
                                      Payment {idx + 1}: {pDate} → {getCurrencySymbol(item.currency)}{Number(pAmt).toLocaleString()} <span className="text-[10px] opacity-75 font-normal">{item.currency}</span>
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Spending Changes if present */}
                          {item.decision.spending_changes_needed && item.decision.spending_changes_needed !== "none" && (
                            <div className="space-y-1.5">
                              <span className="text-[10px] sm:text-[11px] font-bold text-gray-400 dark:text-gray-500 uppercase tracking-wider block">
                                Spending Changes Required
                              </span>
                              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                                {item.decision.spending_changes_needed.split("|").map((sc, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 text-xs font-semibold"
                                  >
                                    {sc}
                                  </span>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
            </>
            )}
          </div>
        )}

        {/* ========================================================================= */}
        {/* TAB 3: FINANCIAL PROFILE */}
        {/* ========================================================================= */}
        {activeTab === "profile" && (
          <div className="max-w-3xl 2xl:max-w-4xl mx-auto space-y-6">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                    Financial Profile & Safeguards
                  </h2>
                  <span
                    className={`inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold ${
                      authUser
                        ? "bg-sky-50 text-sky-800 border border-sky-200 dark:bg-sky-950/40 dark:text-sky-300 dark:border-sky-800/50"
                        : "bg-amber-50 text-amber-800 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50"
                    }`}
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${
                        authUser ? "bg-sky-500 animate-pulse" : "bg-amber-500"
                      }`}
                    ></span>
                    {authUser ? "Cloud Mode (Supabase)" : "Local Mode (On Device)"}
                  </span>
                </div>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                  Update your balances, confirmed income, and priority spending categories.
                </p>
              </div>

              {profileSaveSuccess && (
                <span className="self-start sm:self-auto px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 animate-fade-in">
                  ✓ Profile Saved Live
                </span>
              )}
            </div>

            <div className="apple-card rounded-2xl sm:rounded-3xl p-4 sm:p-6 md:p-8 shadow-sm">
              <form onSubmit={handleSaveProfile} className="space-y-5 sm:space-y-6">
                {/* Core Account Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Account Owner Name
                    </label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Home Currency
                    </label>
                    <select
                      value={profile.homeCurrency}
                      onChange={(e) => {
                        const val = e.target.value;
                        setProfile({ ...profile, homeCurrency: val });
                        setCurrency(val);
                        try {
                          localStorage.setItem("user_configured_currency", val);
                        } catch {}
                      }}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                    >
                      {SUPPORTED_CURRENCIES.map((c) => (
                        <option key={c.code} value={c.code}>
                          {c.label}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Current Bank Balance ({profile.homeCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={profile.currentBalance}
                      onChange={(e) => setProfile({ ...profile, currentBalance: Number(e.target.value) })}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                      Emergency Reserve Buffer ({profile.homeCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={profile.minimumBalance}
                      onChange={(e) => setProfile({ ...profile, minimumBalance: Number(e.target.value) })}
                      className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                    <p className="text-[10px] text-gray-400 dark:text-gray-500 mt-1">
                      Balance will never be allowed to drop below this amount.
                    </p>
                  </div>
                </div>

                {/* Payroll & Fixed Recurring Bills */}
                <div className="pt-4 border-t border-gray-100 dark:border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                    Payroll & Monthly Fixed Commitments
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 sm:gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        Net Monthly Salary
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={profile.monthlySalary}
                        onChange={(e) => setProfile({ ...profile, monthlySalary: Number(e.target.value) })}
                        className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        Monthly Payday (Day 1-31)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={profile.payday}
                        onChange={(e) => setProfile({ ...profile, payday: Number(e.target.value) })}
                        className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        Fixed Expenses (Rent/Bills)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={profile.monthlyFixedExpenses}
                        onChange={(e) => setProfile({ ...profile, monthlyFixedExpenses: Number(e.target.value) })}
                        className="w-full p-2.5 sm:p-3 rounded-xl bg-[#f5f5f7] dark:bg-[#151518] border border-gray-200 dark:border-white/10 text-[#1d1d1f] dark:text-white text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Categorization & Safeguards */}
                <div className="pt-4 border-t border-gray-100 dark:border-white/10 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                    Category Flexibility & Guardrails
                  </h4>

                  {/* Protected Categories */}
                  <div>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1.5">
                      Protected Categories (Never Reduced or Stopped):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {["rent", "groceries", "utilities", "healthcare", "debt_repayment", "education"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleArrayItem("expenseCategoriesToProtect", c)}
                          className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium capitalize transition-all cursor-pointer ${
                            profile.expenseCategoriesToProtect.includes(c)
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 shadow-sm"
                              : "bg-gray-100 text-gray-600 border border-gray-200 dark:bg-[#1c1c1e] dark:text-gray-400 dark:border-white/10"
                          }`}
                        >
                          {profile.expenseCategoriesToProtect.includes(c) ? "✓ " : ""}
                          {c.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Reducible Categories */}
                  <div>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1.5">
                      Categories Willing to Reduce if Needed:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {["dining", "shopping", "entertainment", "travel"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleArrayItem("expenseCategoriesWillingToReduce", c)}
                          className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium capitalize transition-all cursor-pointer ${
                            profile.expenseCategoriesWillingToReduce.includes(c)
                              ? "bg-blue-100 text-blue-800 border border-blue-300 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50 shadow-sm"
                              : "bg-gray-100 text-gray-600 border border-gray-200 dark:bg-[#1c1c1e] dark:text-gray-400 dark:border-white/10"
                          }`}
                        >
                          {profile.expenseCategoriesWillingToReduce.includes(c) ? "✓ " : ""}
                          {c.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Stoppable Subscriptions */}
                  <div>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1.5">
                      Categories Willing to Stop / Pause:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {["streaming", "cloud_storage", "music_subscription", "delivery_membership", "gym"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleArrayItem("expenseCategoriesWillingToStop", c)}
                          className={`px-2.5 sm:px-3 py-1 rounded-full text-[11px] sm:text-xs font-medium capitalize transition-all cursor-pointer ${
                            profile.expenseCategoriesWillingToStop.includes(c)
                              ? "bg-amber-100 text-amber-800 border border-amber-300 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 shadow-sm"
                              : "bg-gray-100 text-gray-600 border border-gray-200 dark:bg-[#1c1c1e] dark:text-gray-400 dark:border-white/10"
                          }`}
                        >
                          {profile.expenseCategoriesWillingToStop.includes(c) ? "✓ " : ""}
                          {c.replace("_", " ")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Payment Preferences */}
                <div className="pt-4 border-t border-gray-100 dark:border-white/10">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 dark:text-gray-500 mb-3">
                    Financing & Payment Methods
                  </h4>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4 items-center">
                    <div>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-2">
                        Accepted Methods:
                      </span>
                      <div className="flex flex-wrap gap-2.5 sm:gap-3">
                        {[
                          { id: "full_payment", label: "Full Payment" },
                          { id: "installments", label: "Installments" },
                          { id: "partial_payment", label: "Partial Payment" },
                        ].map((m) => (
                          <label key={m.id} className="flex items-center space-x-2 text-xs text-gray-700 dark:text-gray-300 cursor-pointer">
                            <input
                              type="checkbox"
                              checked={profile.paymentMethodsUserWillConsider.includes(m.id)}
                              onChange={() => toggleArrayItem("paymentMethodsUserWillConsider", m.id)}
                              className="rounded text-[#0071e3] focus:ring-0"
                            />
                            <span>{m.label}</span>
                          </label>
                        ))}
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 dark:text-gray-400 mb-1.5">
                        Max Installment Duration ({profile.maxInstallmentMonths} Months)
                      </label>
                      <input
                        type="range"
                        min="1"
                        max="24"
                        value={profile.maxInstallmentMonths}
                        onChange={(e) =>
                          setProfile({ ...profile, maxInstallmentMonths: Number(e.target.value) })
                        }
                        className="w-full accent-[#0071e3] cursor-pointer"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button & Guest reminder */}
                <div className="pt-4 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                  {!authUser ? (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 px-3.5 py-2.5 rounded-xl flex items-start sm:items-center gap-2">
                      <span className="shrink-0">💡</span>
                      <span className="leading-snug">
                        Changes apply to current session only.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode("signup");
                            setAuthError(null);
                            setAuthMessage(null);
                            setAuthModalOpen(true);
                          }}
                          className="font-semibold underline hover:text-amber-900 dark:hover:text-amber-100 cursor-pointer"
                        >
                          Sign in or Sign up
                        </button>{" "}
                        to save to your cloud account.
                      </span>
                    </div>
                  ) : (
                    <div />
                  )}

                  <button
                    type="submit"
                    disabled={profileSaving}
                    className="w-full sm:w-auto px-6 sm:px-8 py-3 sm:py-3.5 rounded-xl sm:rounded-2xl bg-gray-900 hover:bg-black text-white dark:bg-white dark:hover:bg-gray-100 dark:text-gray-900 font-semibold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
                  >
                    {profileSaving ? (
                      <span>Saving to Storage...</span>
                    ) : (
                      <>
                        <span>Save Financial Profile</span>
                        <span>✓</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* SEO Semantic Content & FAQ Section */}
        <section
          className="mt-16 sm:mt-20 pt-12 sm:pt-16 border-t border-gray-200/60 dark:border-white/10 space-y-12 sm:space-y-16"
          aria-label="Purchase Affordability Guide & Methodology"
        >
          {/* Section 1: Core Methodology */}
          <div>
            <div className="text-center max-w-2xl 2xl:max-w-3xl mx-auto mb-8 sm:mb-10">
              <span className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-blue-50 text-[#0071e3] dark:bg-blue-950/40 dark:text-blue-300 border border-blue-200/60 dark:border-blue-800/40 inline-block mb-2.5 sm:mb-3">
                Forward Cash Flow Modeling
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                How &ldquo;Should I Buy It?&rdquo; Works
              </h2>
              <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[#86868b] dark:text-[#a1a1a6] leading-relaxed px-2">
                Most impulse buys happen because people look at their current bank balance instead of their upcoming cash commitments. Our simulation engine projects every dollar across the next 90 days before you spend.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-5">
              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-[#0071e3]/40 dark:hover:border-blue-500/40 hover:shadow-lg transition-all duration-300 group cursor-default">
                <div className="w-10 h-10 rounded-2xl bg-blue-50 dark:bg-blue-950/50 text-[#0071e3] dark:text-blue-400 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                  01
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-[#1d1d1f] dark:text-white mb-2 group-hover:text-[#0071e3] dark:group-hover:text-blue-400 transition-colors">
                  90-Day Liquidity Curve
                </h3>
                <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                  Calculates exact daily cash balances by harmonizing your recurring payday cycles with fixed monthly obligations like rent, utilities, and debt payments.
                </p>
              </div>

              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-emerald-500/40 dark:hover:border-emerald-500/40 hover:shadow-lg transition-all duration-300 group cursor-default">
                <div className="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                  02
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-[#1d1d1f] dark:text-white mb-2 group-hover:text-emerald-600 dark:group-hover:text-emerald-400 transition-colors">
                  Emergency Buffer Defense
                </h3>
                <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                  Enforces your sacred reserve floor. If a prospective purchase causes your liquid funds to dip below your safety threshold at any point, the model flags it immediately.
                </p>
              </div>

              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-indigo-500/40 dark:hover:border-indigo-500/40 hover:shadow-lg transition-all duration-300 group cursor-default">
                <div className="w-10 h-10 rounded-2xl bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center font-bold text-lg mb-4 group-hover:scale-110 group-hover:rotate-3 transition-transform duration-300">
                  03
                </div>
                <h3 className="text-sm sm:text-base font-semibold text-[#1d1d1f] dark:text-white mb-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">
                  Trough Risk Detection
                </h3>
                <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                  Pinpoints the exact calendar dates when your liquid cash reaches its lowest vulnerability point, preventing overdrafts before the next payroll disbursement.
                </p>
              </div>
            </div>
          </div>

          {/* Section 2: 4 Decision Verdicts */}
          <div>
            <div className="text-center max-w-2xl 2xl:max-w-3xl mx-auto mb-8 sm:mb-10">
              <span className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300 border border-emerald-200/60 dark:border-emerald-800/40 inline-block mb-2.5 sm:mb-3">
                Objective Decision Engine
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                The 4 Decision Outcomes Demystified
              </h2>
              <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[#86868b] dark:text-[#a1a1a6] leading-relaxed px-2">
                Rather than giving vague financial advice, &ldquo;Should I Buy It?&rdquo; generates one of four mathematically verifiable recommendations tailored to your cash position.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-5">
              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-emerald-500/50 dark:hover:border-emerald-500/40 hover:shadow-md flex flex-col justify-between transition-all duration-300 cursor-default">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50 mb-3">
                    <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                    BUY NOW
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white mb-1.5">
                    Safe to Purchase Immediately
                  </h3>
                  <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                    Your 90-day liquidity simulation stays comfortably above your minimum emergency buffer across every upcoming bill payment and payroll cycle. No budget strain detected.
                  </p>
                </div>
              </div>

              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-blue-500/50 dark:hover:border-blue-500/40 hover:shadow-md flex flex-col justify-between transition-all duration-300 cursor-default">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-blue-50 text-blue-700 border border-blue-200 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50 mb-3">
                    <span className="w-2 h-2 rounded-full bg-blue-500"></span>
                    SAFE DELAY (WAIT)
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white mb-1.5">
                    Affordable with Strategic Timing
                  </h3>
                  <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                    Buying today creates a temporary cash squeeze before your next pay cycle. Postponing the purchase by 2 to 4 weeks aligns the expense with incoming cash flow seamlessly.
                  </p>
                </div>
              </div>

              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-amber-500/50 dark:hover:border-amber-500/40 hover:shadow-md flex flex-col justify-between transition-all duration-300 cursor-default">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50 mb-3">
                    <span className="w-2 h-2 rounded-full bg-amber-500"></span>
                    HIGH RISK
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white mb-1.5">
                    Tight Margin of Error
                  </h3>
                  <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                    The purchase is technically feasible with existing cash, but it depresses your discretionary cushion below 15%. Any single unexpected bill could cause an emergency breach.
                  </p>
                </div>
              </div>

              <div className="hover-lift p-5 sm:p-6 rounded-2xl sm:rounded-3xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 shadow-sm hover:border-rose-500/50 dark:hover:border-rose-500/40 hover:shadow-md flex flex-col justify-between transition-all duration-300 cursor-default">
                <div>
                  <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full text-xs font-semibold bg-rose-50 text-rose-700 border border-rose-200 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50 mb-3">
                    <span className="w-2 h-2 rounded-full bg-rose-500"></span>
                    DECLINE
                  </div>
                  <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f] dark:text-white mb-1.5">
                    Not Recommended
                  </h3>
                  <p className="text-xs text-[#86868b] dark:text-[#a1a1a6] leading-relaxed">
                    Executing this purchase causes a severe buffer violation or projected negative balance. We strongly advise pausing or exploring structured installment alternatives.
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Section 3: Frequently Asked Questions (FAQ) */}
          <div>
            <div className="text-center max-w-2xl 2xl:max-w-3xl mx-auto mb-8 sm:mb-10">
              <span className="px-3 py-1 rounded-full text-[11px] font-semibold tracking-wide uppercase bg-purple-50 text-purple-700 dark:bg-purple-950/40 dark:text-purple-300 border border-purple-200/60 dark:border-purple-800/40 inline-block mb-2.5 sm:mb-3">
                Knowledge Base
              </span>
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-[#1d1d1f] dark:text-white">
                Frequently Asked Questions
              </h2>
              <p className="mt-2.5 sm:mt-3 text-xs sm:text-sm text-[#86868b] dark:text-[#a1a1a6] leading-relaxed px-2">
                Everything you need to know about evaluating discretionary purchases, cash flow simulations, and privacy.
              </p>
            </div>

            <div className="space-y-3 sm:space-y-3.5 max-w-3xl 2xl:max-w-4xl mx-auto">
              {FAQ_ITEMS.map((faq, idx) => {
                const isOpen = !!openFaqs[idx];
                return (
                  <div
                    key={idx}
                    className="rounded-xl sm:rounded-2xl bg-white dark:bg-[#1c1c1e] border border-black/[0.06] dark:border-white/10 p-4 sm:p-5 shadow-sm hover:border-[#0071e3]/30 dark:hover:border-white/20 transition-all duration-200"
                  >
                    <button
                      type="button"
                      onClick={() => toggleFaq(idx)}
                      className="w-full text-left text-xs sm:text-sm md:text-base font-semibold text-[#1d1d1f] dark:text-white cursor-pointer flex items-center justify-between group select-none"
                      aria-expanded={isOpen}
                    >
                      <span className="group-hover:text-[#0071e3] dark:group-hover:text-blue-400 transition-colors pr-3 sm:pr-4">
                        {faq.question}
                      </span>
                      <span
                        className={`text-xs text-gray-400 shrink-0 transition-transform duration-300 ease-out ${
                          isOpen ? "rotate-180 text-[#0071e3] dark:text-blue-400" : "rotate-0"
                        }`}
                      >
                        ▼
                      </span>
                    </button>
                    <div
                      className={`grid transition-all duration-300 ease-in-out ${
                        isOpen ? "grid-rows-[1fr] opacity-100 mt-2.5 sm:mt-3" : "grid-rows-[0fr] opacity-0 mt-0"
                      }`}
                    >
                      <div className="overflow-hidden">
                        <p className="text-xs sm:text-sm text-[#515154] dark:text-[#a1a1a6] leading-relaxed">
                          {faq.answer}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      </main>

      {/* Enhanced Apple & Google Aesthetic Footer */}
      <footer className="border-t border-gray-200/60 dark:border-white/10 py-6 sm:py-8 mt-12 mb-16 sm:mb-0 bg-white/40 dark:bg-[#0c0c0e]/40 backdrop-blur-sm">
        <div className="max-w-6xl 2xl:max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex flex-col md:flex-row items-center justify-between gap-4 text-xs text-gray-400 dark:text-gray-500 text-center md:text-left">
          <div className="flex items-center gap-2">
            <span className="w-5 h-5 rounded-lg bg-gradient-to-tr from-[#0071e3] to-[#34a853] flex items-center justify-center text-white font-bold text-[10px]">
              ✓
            </span>
            <span className="font-semibold text-gray-700 dark:text-gray-300">
              Should I Buy It?
            </span>
            <span className="hidden sm:inline">— AI Financial Commitment & 90-Day Liquidity Simulator</span>
          </div>
          <div className="flex flex-wrap justify-center md:justify-end items-center gap-3 sm:gap-4 text-[11px]">
            <button
              onClick={() => {
                setActiveTab("advisor");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
            >
              Evaluate
            </button>
            <button
              onClick={() => {
                setActiveTab("history");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
            >
              History
            </button>
            <button
              onClick={() => {
                setActiveTab("profile");
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="hover:text-gray-700 dark:hover:text-gray-300 transition-colors cursor-pointer"
            >
              Profile
            </button>
            <span>•</span>
            <span>Local & Cloud Mode</span>
          </div>
        </div>
      </footer>

      {/* Mobile Bottom Navigation Bar (Apple iOS / Android Native Style) */}
      <nav
        className="sm:hidden fixed bottom-0 left-0 right-0 z-40 glass-nav border-t border-black/[0.06] dark:border-white/10 px-2 py-1.5 pb-[max(0.6rem,env(safe-area-inset-bottom))] shadow-lg transition-colors"
        aria-label="Mobile Navigation"
      >
        <div className="grid grid-cols-3 max-w-sm mx-auto gap-1">
          <button
            type="button"
            onClick={() => {
              setActiveTab("advisor");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeTab === "advisor"
                ? "text-[#0071e3] dark:text-blue-400 font-semibold bg-blue-50/70 dark:bg-blue-950/40"
                : "text-gray-500 dark:text-gray-400 font-medium hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            <span className="text-base leading-none mb-1">⚡</span>
            <span className="text-[10px] tracking-tight">Evaluate</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("history");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`relative flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeTab === "history"
                ? "text-[#0071e3] dark:text-blue-400 font-semibold bg-blue-50/70 dark:bg-blue-950/40"
                : "text-gray-500 dark:text-gray-400 font-medium hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            <div className="relative inline-block leading-none mb-1">
              <span className="text-base">📜</span>
              {history.length > 0 && (
                <span className="absolute -top-1 -right-2 px-1 py-0.2 rounded-full text-[9px] font-bold bg-[#0071e3] text-white leading-tight min-w-[14px] text-center">
                  {history.length}
                </span>
              )}
            </div>
            <span className="text-[10px] tracking-tight">History</span>
          </button>

          <button
            type="button"
            onClick={() => {
              setActiveTab("profile");
              window.scrollTo({ top: 0, behavior: "smooth" });
            }}
            className={`flex flex-col items-center justify-center py-1.5 px-2 rounded-xl transition-all cursor-pointer ${
              activeTab === "profile"
                ? "text-[#0071e3] dark:text-blue-400 font-semibold bg-blue-50/70 dark:bg-blue-950/40"
                : "text-gray-500 dark:text-gray-400 font-medium hover:text-gray-800 dark:hover:text-gray-200"
            }`}
          >
            <span className="text-base leading-none mb-1">👤</span>
            <span className="text-[10px] tracking-tight">Profile</span>
          </button>
        </div>
      </nav>

      {/* Apple & Google Aesthetic Authentication Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 dark:bg-black/70 backdrop-blur-md animate-fadeIn overflow-y-auto">
          <div
            className="relative w-full max-w-md max-h-[92vh] overflow-y-auto bg-white dark:bg-[#1c1c1e] rounded-2xl sm:rounded-3xl p-5 sm:p-7 shadow-2xl border border-black/[0.06] dark:border-white/10 transition-all transform animate-scaleUp my-auto"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-4 right-4 sm:top-5 sm:right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 dark:bg-white/10 dark:hover:bg-white/20 text-gray-500 dark:text-gray-300 flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="text-center mb-5 sm:mb-6">
              <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#34a853] flex items-center justify-center text-white font-bold text-lg sm:text-xl mx-auto mb-2.5 sm:mb-3 shadow-md">
                ✓
              </div>
              <h3 className="text-lg sm:text-xl font-bold text-[#1d1d1f] dark:text-white tracking-tight">
                {authMode === "signin" ? "Sign In to Your Account" : "Create Your Account"}
              </h3>
              <p className="text-xs text-[#86868b] dark:text-gray-400 mt-1">
                {authMode === "signin"
                  ? "Access your isolated profiles, decisions, and history."
                  : "Start analyzing purchases with multi-user cloud isolation."}
              </p>
            </div>

            {/* Mode Switcher Pills */}
            <div className="flex p-1 bg-gray-100 dark:bg-white/[0.06] rounded-xl sm:rounded-2xl mb-4 sm:mb-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthError(null);
                  setAuthMessage(null);
                }}
                className={`flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all cursor-pointer ${
                  authMode === "signin"
                    ? "bg-white text-gray-900 dark:bg-[#2c2c2e] dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                Sign In
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signup");
                  setAuthError(null);
                  setAuthMessage(null);
                }}
                className={`flex-1 py-1.5 sm:py-2 rounded-lg sm:rounded-xl transition-all cursor-pointer ${
                  authMode === "signup"
                    ? "bg-white text-gray-900 dark:bg-[#2c2c2e] dark:text-white shadow-sm"
                    : "text-gray-500 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Supabase unconfigured warning banner */}
            {!supabaseReady && (
              <div className="mb-4 p-3 rounded-xl sm:rounded-2xl bg-amber-50 border border-amber-200 dark:bg-amber-950/40 dark:border-amber-800/50 text-amber-800 dark:text-amber-300 text-xs leading-relaxed">
                <strong className="block font-semibold mb-0.5">Demo Mode Active</strong>
                Add your Supabase credentials to <code className="bg-amber-100/80 dark:bg-amber-900/50 px-1 py-0.5 rounded font-mono text-[11px]">.env.local</code> to enable live cloud user accounts.
              </div>
            )}

            {/* Status & Error Alerts */}
            {authError && (
              <div className="mb-4 p-3 rounded-xl sm:rounded-2xl bg-rose-50 border border-rose-200 dark:bg-rose-950/40 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs font-medium">
                {authError}
              </div>
            )}
            {authMessage && (
              <div className="mb-4 p-3 rounded-xl sm:rounded-2xl bg-emerald-50 border border-emerald-200 dark:bg-emerald-950/40 dark:border-emerald-800/50 text-emerald-800 dark:text-emerald-300 text-xs font-medium">
                {authMessage}
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-3.5 sm:space-y-4">
              {authMode === "signup" && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1 sm:mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    className="w-full px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all bg-gray-50/50 focus:bg-white dark:bg-[#151518] dark:focus:bg-[#151518] text-[#1d1d1f] dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1 sm:mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all bg-gray-50/50 focus:bg-white dark:bg-[#151518] dark:focus:bg-[#151518] text-[#1d1d1f] dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 dark:text-gray-300 block mb-1 sm:mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-3 sm:px-3.5 py-2 sm:py-2.5 rounded-xl border border-gray-200 dark:border-white/10 text-xs sm:text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all bg-gray-50/50 focus:bg-white dark:bg-[#151518] dark:focus:bg-[#151518] text-[#1d1d1f] dark:text-white placeholder:text-gray-400 dark:placeholder:text-gray-600"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full mt-2 py-2.5 sm:py-3 rounded-xl sm:rounded-2xl bg-gradient-to-r from-[#0071e3] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white font-semibold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
              >
                {authLoading ? (
                  <span>Authenticating...</span>
                ) : (
                  <span>
                    {authMode === "signin" ? "Sign In with Supabase" : "Create Account"}
                  </span>
                )}
              </button>
            </form>

            <div className="mt-4 sm:mt-5 text-center text-xs text-gray-400 dark:text-gray-500">
              Secured with Supabase Row Level Security (RLS)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
