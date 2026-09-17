"use client";

import React, { useState, useEffect, useMemo } from "react";
import { createClient, isSupabaseConfigured } from "@/lib/supabase/client";

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

export default function StandaloneApp() {
  // Navigation Tabs: "advisor" | "history" | "profile"
  const [activeTab, setActiveTab] = useState<"advisor" | "history" | "profile">("advisor");

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
        // Immediately reset to guest defaults so Supabase data doesn't leak
        setProfile(DEFAULT_PROFILE);
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
      const res = await fetch("/api/profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(profile),
      });
      const data = await res.json();
      if (data.success) {
        setProfile(data.profile);
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

  const handlePresetSelect = (p: typeof PRESET_QUERIES[0]) => {
    setQuery(p.text);
    setAmount(p.amount);
    setCurrency(p.currency);
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
          bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
          label: "Affordable Now",
          dot: "bg-emerald-500",
        };
      case "affordable_with_plan":
        return {
          bg: "bg-blue-50 text-blue-700 border-blue-200",
          label: "Affordable with Plan",
          dot: "bg-blue-500",
        };
      case "affordable_later":
        return {
          bg: "bg-amber-50 text-amber-700 border-amber-200",
          label: "Affordable Later (Wait)",
          dot: "bg-amber-500",
        };
      case "not_affordable":
        return {
          bg: "bg-rose-50 text-rose-700 border-rose-200",
          label: "Not Affordable",
          dot: "bg-rose-500",
        };
      default:
        return {
          bg: "bg-gray-100 text-gray-700 border-gray-200",
          label: status,
          dot: "bg-gray-400",
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
    <div className="min-h-screen flex flex-col bg-[#fbfbfd]">
      {/* Sleek Apple + Google Header */}
      <header className="sticky top-0 z-30 glass-nav">
        <div className="max-w-6xl mx-auto px-6 h-16 flex items-center justify-between">
          {/* Brand Logo & Name */}
          <div className="flex items-center space-x-3 cursor-pointer" onClick={() => setActiveTab("advisor")}>
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#34a853] flex items-center justify-center text-white font-bold text-base shadow-sm hover:scale-105 transition-transform">
              ✓
            </div>
            <div>
              <h1 className="text-[17px] font-semibold tracking-tight text-[#1d1d1f] leading-tight">
                Buy or Wait?
              </h1>
              <p className="text-[11px] text-[#86868b] tracking-tight">
                AI Financial Commitment Assistant
              </p>
            </div>
          </div>

          {/* Centered Segmented Navigation Pills */}
          <nav className="flex items-center p-1 bg-gray-200/60 rounded-full border border-black/[0.04] text-xs font-medium">
            <button
              onClick={() => setActiveTab("advisor")}
              className={`px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "advisor"
                  ? "bg-white text-gray-900 shadow-sm font-semibold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>⚡</span>
              <span>Evaluate</span>
            </button>
            <button
              onClick={() => setActiveTab("history")}
              className={`px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "history"
                  ? "bg-white text-gray-900 shadow-sm font-semibold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>📜</span>
              <span>History</span>
              {history.length > 0 && (
                <span className="ml-0.5 px-1.5 py-0.2 rounded-full text-[10px] font-bold bg-blue-100 text-blue-700">
                  {history.length}
                </span>
              )}
            </button>
            <button
              onClick={() => setActiveTab("profile")}
              className={`px-4 py-1.5 rounded-full transition-all flex items-center gap-1.5 ${
                activeTab === "profile"
                  ? "bg-white text-gray-900 shadow-sm font-semibold"
                  : "text-gray-600 hover:text-gray-900"
              }`}
            >
              <span>👤</span>
              <span>Profile</span>
            </button>
          </nav>

          {/* Right Action & User Profile Pill */}
          <div className="flex items-center space-x-2">
            {/* Dual Mode Indicator — always shows both, one active */}
            <div className="hidden md:flex items-center gap-1 p-0.5 bg-gray-100 rounded-full border border-black/[0.04]">
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  !authUser
                    ? "bg-white text-gray-800 shadow-sm border border-gray-200"
                    : "text-gray-400"
                }`}
                title="Local Offline Mode — data stored on disk"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    !authUser ? "bg-amber-500" : "bg-gray-300"
                  }`}
                ></span>
                Local
              </span>
              <span
                className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-medium transition-all ${
                  authUser
                    ? "bg-white text-sky-700 shadow-sm border border-sky-200"
                    : "text-gray-400"
                }`}
                title="Connected to Supabase Cloud Database"
              >
                <span
                  className={`w-1.5 h-1.5 rounded-full ${
                    authUser ? "bg-sky-500 animate-pulse" : "bg-gray-300"
                  }`}
                ></span>
                Cloud
              </span>
            </div>

            {/* User Session State */}
            {authUser ? (
              <div className="flex items-center gap-2">
                <div className="hidden sm:flex items-center gap-2 px-3 py-1 rounded-full text-xs font-medium bg-emerald-50 text-emerald-800 border border-emerald-200">
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="max-w-[120px] truncate">{profile.name || authUser.email}</span>
                </div>
                <button
                  onClick={handleSignOut}
                  className="px-3 py-1.5 rounded-full text-xs font-medium text-gray-600 hover:text-gray-900 hover:bg-gray-100 transition-colors"
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
                className="px-4 py-1.5 rounded-full text-xs font-semibold bg-[#0071e3] hover:bg-[#0077ed] text-white shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center gap-1.5"
              >
                <span>Sign In</span>
                <span>→</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-5xl w-full mx-auto px-6 py-8">
        {/* Highlighted Visitor Sign-In / Sign-Up Dialogue */}
        {!authUser && (
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-r from-blue-600/[0.09] via-indigo-600/[0.08] to-emerald-600/[0.09] border-2 border-[#0071e3]/30 p-5 sm:p-6 mb-8 shadow-sm backdrop-blur-md">
            <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-5">
              <div className="flex items-start gap-4">
                <div className="w-11 h-11 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#34a853] text-white flex items-center justify-center text-xl shadow-md shrink-0">
                  ✨
                </div>
                <div>
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-[#0071e3] text-white shadow-sm">
                      Visitor Tip
                    </span>
                    <h3 className="text-sm sm:text-base font-bold text-[#1d1d1f]">
                      Sign in or create an account to save your profile & history
                    </h3>
                  </div>
                  <p className="text-xs text-[#515154] leading-relaxed max-w-2xl">
                    You are currently using <strong>Local Mode</strong> without an account. Sign in or sign up to permanently save your custom financial profile configurations, access them across devices, and keep an auditable 90-day history of all your purchase evaluations.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2.5 shrink-0 w-full md:w-auto">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }}
                  className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-white hover:bg-gray-50 text-gray-800 text-xs font-semibold border border-gray-200 shadow-sm transition-all hover:scale-105 active:scale-95 text-center cursor-pointer"
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
                  className="flex-1 md:flex-initial px-4 py-2.5 rounded-xl bg-gradient-to-r from-[#0071e3] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white text-xs font-semibold shadow-sm transition-all hover:scale-105 active:scale-95 flex items-center justify-center gap-1.5 cursor-pointer"
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
          <div className="space-y-8">
            {/* Hero Banner */}
            <div className="text-center max-w-2xl mx-auto pt-2 pb-4">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-[#e8f0fe] text-[#1a73e8] mb-3">
                90-Day Liquidity Invariant Simulator
              </span>
              <h2 className="text-3xl sm:text-4xl font-bold tracking-tight text-[#1d1d1f] mb-2">
                Should you buy now, plan, or wait?
              </h2>
              <p className="text-sm text-[#86868b] leading-relaxed">
                Enter any upcoming expense or purchase. Our engine verifies your recurring payroll, essential bills, and reserve buffer over the next 90 days with mathematical rigor.
              </p>
            </div>

            {/* Active Profile Bar */}
            <div className="apple-card p-4 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-3 text-xs bg-white/90">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-full bg-blue-50 text-[#0071e3] font-bold flex items-center justify-center text-xs">
                  {profile.name ? profile.name.charAt(0).toUpperCase() : "G"}
                </div>
                <div>
                  <span className="font-semibold text-gray-900 block">
                    Active Account: {profile.name || "Guest (Unsaved Profile)"}
                  </span>
                  <span className="text-gray-500">
                    Available: <strong className="text-gray-800">{profile.homeCurrency} {(profile.currentBalance || 0).toLocaleString()}</strong> | Reserve Buffer: <strong className="text-gray-800">{profile.homeCurrency} {(profile.minimumBalance || 0).toLocaleString()}</strong>
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab("profile")}
                className="text-xs font-semibold text-[#0071e3] hover:underline"
              >
                Configure Profile & Bills →
              </button>
            </div>

            {/* Evaluation Form Card */}
            <div className="apple-card rounded-3xl p-6 sm:p-8 shadow-sm">
              <form onSubmit={handleAnalyze} className="space-y-6">
                {/* Question Input */}
                <div>
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Purchase Description / Question
                  </label>
                  <textarea
                    rows={2}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="e.g. Can I afford to buy a new laptop for $1,200 today?"
                    className="w-full p-4 rounded-2xl bg-[#f5f5f7] border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/30 focus:border-[#0071e3] transition-all resize-none font-normal"
                    required
                  />

                  {/* Preset Suggestions */}
                  <div className="mt-2.5 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-gray-400 font-medium mr-1">Sample Scenarios:</span>
                    {PRESET_QUERIES.map((p, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handlePresetSelect(p)}
                        className="text-[11px] px-2.5 py-1 rounded-full bg-white hover:bg-gray-100 border border-gray-200 text-gray-600 transition-all font-medium"
                      >
                        {p.text.slice(0, 36)}...
                      </button>
                    ))}
                  </div>
                </div>

                {/* Amount, Currency, Dates */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Amount
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="1"
                      value={amount}
                      onChange={(e) => setAmount(Number(e.target.value))}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Currency
                    </label>
                    <select
                      value={currency}
                      onChange={(e) => setCurrency(e.target.value)}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="INR">INR (₹)</option>
                      <option value="CAD">CAD ($)</option>
                      <option value="AUD">AUD ($)</option>
                      <option value="JPY">JPY (¥)</option>
                      <option value="IDR">IDR (Rp)</option>
                      <option value="ZAR">ZAR (R)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Purchase Date
                    </label>
                    <input
                      type="date"
                      value={requestDate}
                      onChange={(e) => setRequestDate(e.target.value)}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Target Completion Date
                    </label>
                    <input
                      type="date"
                      value={desiredDate}
                      onChange={(e) => setDesiredDate(e.target.value)}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                    />
                  </div>
                </div>

                {/* Additional Options */}
                <div className="flex flex-wrap items-center justify-between gap-4 pt-2 border-t border-gray-100">
                  <label className="flex items-center space-x-2 text-xs font-medium text-gray-700 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={allowsPartial}
                      onChange={(e) => setAllowsPartial(e.target.checked)}
                      className="w-4 h-4 rounded text-[#0071e3] focus:ring-0"
                    />
                    <span>Allow 2-phase partial payment schedule if full payment is unsafe today</span>
                  </label>
                </div>

                {/* Receipt Upload Section */}
                <div className="pt-4 border-t border-gray-100">
                  <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-2">
                    Optional: Attach Bill, Invoice, or Receipt
                  </label>
                  <div className="flex flex-col sm:flex-row gap-3 items-center">
                    <div className="flex-1 w-full border-2 border-dashed border-gray-200 hover:border-[#0071e3]/50 rounded-2xl p-3 text-center cursor-pointer transition-colors bg-gray-50/50">
                      <input
                        type="file"
                        id="doc-upload"
                        accept="image/*,.pdf,.csv"
                        onChange={handleFileUpload}
                        className="hidden"
                      />
                      <label htmlFor="doc-upload" className="cursor-pointer block">
                        <span className="text-xs text-gray-600 font-medium">
                          {uploadedFileName ? (
                            <span className="text-[#0071e3] font-semibold">📎 Attached: {uploadedFileName}</span>
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
                        className="text-xs text-rose-600 hover:underline px-2 py-1 font-medium"
                      >
                        Remove
                      </button>
                    )}
                  </div>

                  {/* Sample Receipts */}
                  <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                    <span className="text-[11px] text-gray-400 font-medium mr-1">Quick Sample Invoices:</span>
                    {SAMPLE_RECEIPTS.map((doc, idx) => (
                      <button
                        key={idx}
                        type="button"
                        onClick={() => handleAttachReceipt(doc)}
                        className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
                      >
                        + {doc.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Submit Action */}
                <div className="pt-4 flex items-center justify-end gap-3">
                  <button
                    type="submit"
                    disabled={loading}
                    className="px-8 py-3.5 rounded-2xl bg-[#0071e3] hover:bg-[#0077ed] text-white font-semibold text-xs shadow-md shadow-blue-500/20 disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
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
                        <span>→</span>
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
              <div className="apple-card rounded-3xl p-6 sm:p-8 shadow-sm space-y-6">
                {/* Result Header Badge */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-gray-100">
                  <div className="flex items-center space-x-3">
                    <span
                      className={`inline-flex items-center px-3.5 py-1.5 rounded-full text-xs font-bold border ${
                        getStatusBadge(result.decision.affordability_status).bg
                      }`}
                    >
                      <span
                        className={`w-2 h-2 rounded-full mr-2 ${
                          getStatusBadge(result.decision.affordability_status).dot
                        }`}
                      ></span>
                      {getStatusBadge(result.decision.affordability_status).label}
                    </span>
                    <span className="text-xs text-gray-500 font-medium">
                      Method: <strong className="text-gray-800 uppercase">{result.decision.recommended_payment_method.replace("_", " ")}</strong>
                    </span>
                  </div>

                  <span className="text-[11px] text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-full border border-emerald-200 font-medium">
                    ✓ Saved to Decision History
                  </span>
                </div>

                {/* Key Metrics Row */}
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block">
                      Safe to Pay Today
                    </span>
                    <span className="text-xl font-bold text-gray-900 mt-1 block">
                      {result.profile.home_currency} {Number(result.decision.amount_safe_to_pay).toLocaleString()}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block">
                      Earliest Safe Full Date
                    </span>
                    <span className="text-sm font-bold text-gray-900 mt-1 block">
                      {result.decision.earliest_date_for_full_payment || "Beyond 90 Days"}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block">
                      Current Account
                    </span>
                    <span className="text-sm font-bold text-gray-900 mt-1 block">
                      {result.profile.home_currency} {result.profile.current_balance.toLocaleString()}
                    </span>
                  </div>

                  <div className="p-4 rounded-2xl bg-[#f5f5f7]">
                    <span className="text-[11px] uppercase tracking-wider text-gray-500 font-semibold block">
                      Reserve Shield
                    </span>
                    <span className="text-sm font-bold text-gray-900 mt-1 block">
                      {result.profile.home_currency} {result.profile.minimum_balance.toLocaleString()}
                    </span>
                  </div>
                </div>

                {/* Recommendation Plain English */}
                <div className="p-5 rounded-2xl bg-gradient-to-r from-blue-50/70 to-emerald-50/70 border border-blue-100 text-gray-900 text-sm leading-relaxed font-medium">
                  {result.decision.decision_explanation}
                </div>

                {/* Trajectory Forward Chart */}
                {result.trajectory && result.trajectory.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      90-Day Balance Forward Trajectory Forecast
                    </h4>
                    <div className="bg-gray-50 p-5 rounded-2xl border border-gray-100">
                      <div className="relative h-44 w-full">
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
                                <polyline fill="none" stroke="#0071e3" strokeWidth="2.5" points={points} />
                              </>
                            );
                          })()}
                        </svg>
                      </div>
                      <div className="flex justify-between items-center text-[11px] text-gray-400 mt-2 px-1">
                        <span>Day 0 ({requestDate})</span>
                        <span className="text-red-500 font-semibold flex items-center">
                          <span className="w-3 h-0.5 bg-red-500 inline-block mr-1"></span>
                          Min Reserve: {result.profile.home_currency} {result.profile.minimum_balance.toLocaleString()}
                        </span>
                        <span className="text-blue-600 font-semibold flex items-center">
                          <span className="w-3 h-0.5 bg-blue-600 inline-block mr-1"></span>
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
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Recommended Payment Schedule
                    </h4>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                      {result.decision.payment_plan.split("|").map((entry, idx) => {
                        const [pDate, pAmt] = entry.split(":");
                        return (
                          <div key={idx} className="p-4 rounded-xl bg-gray-50 border border-gray-100 text-xs">
                            <span className="text-gray-400 block font-medium">Payment {idx + 1}</span>
                            <span className="font-semibold text-gray-800 block text-sm mt-0.5">{pDate}</span>
                            <span className="font-bold text-[#0071e3] mt-1 block">
                              {result.profile.home_currency} {Number(pAmt).toLocaleString()}
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
                    <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                      Identified Flexible Spending Changes Needed
                    </h4>
                    <div className="flex flex-wrap gap-2">
                      {result.decision.spending_changes_needed.split("|").map((sc, idx) => (
                        <span
                          key={idx}
                          className="px-3 py-1.5 rounded-full text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200"
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
              <div className="apple-card p-16 rounded-3xl text-center max-w-lg mx-auto">
                <div className="w-16 h-16 rounded-3xl bg-gradient-to-br from-blue-50 to-sky-100 flex items-center justify-center mx-auto mb-5 text-2xl">
                  🔒
                </div>
                <h3 className="text-lg font-bold text-[#1d1d1f] tracking-tight mb-2">
                  Sign in to view your history
                </h3>
                <p className="text-xs text-[#86868b] leading-relaxed max-w-sm mx-auto mb-6">
                  Decision history is saved to your private cloud account. Sign in or create an account to start tracking your purchase evaluations.
                </p>
                <button
                  onClick={() => {
                    setAuthMode("signin");
                    setAuthError(null);
                    setAuthMessage(null);
                    setAuthModalOpen(true);
                  }}
                  className="px-6 py-3 rounded-2xl bg-gradient-to-r from-[#0071e3] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white font-semibold text-xs shadow-md transition-all active:scale-95 inline-flex items-center gap-2"
                >
                  <span>Sign In to Continue</span>
                  <span>→</span>
                </button>
              </div>
            ) : (
            <>
            {/* Header & Stats Bar */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">
                  Decision History
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Audit and review all past purchase evaluations and 90-day trajectory checks.
                </p>
              </div>

              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  className="self-start sm:self-auto px-3 py-1.5 rounded-xl border border-gray-200 hover:border-rose-300 text-xs font-medium text-gray-600 hover:text-rose-600 transition-colors"
                >
                  Clear History
                </button>
              )}
            </div>

            {/* Stats Overview Pill Cards */}
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
              <div className="p-3 rounded-2xl bg-white border border-gray-100 shadow-sm text-center">
                <span className="text-[11px] text-gray-400 font-medium block">Total Checks</span>
                <span className="text-lg font-bold text-gray-800">{historyStats.total}</span>
              </div>
              <div className="p-3 rounded-2xl bg-emerald-50/60 border border-emerald-100 text-center">
                <span className="text-[11px] text-emerald-600 font-medium block">Affordable Now</span>
                <span className="text-lg font-bold text-emerald-700">{historyStats.affordableNow}</span>
              </div>
              <div className="p-3 rounded-2xl bg-blue-50/60 border border-blue-100 text-center">
                <span className="text-[11px] text-blue-600 font-medium block">With Plan</span>
                <span className="text-lg font-bold text-blue-700">{historyStats.withPlan}</span>
              </div>
              <div className="p-3 rounded-2xl bg-amber-50/60 border border-amber-100 text-center">
                <span className="text-[11px] text-amber-600 font-medium block">Wait (Later)</span>
                <span className="text-lg font-bold text-amber-700">{historyStats.later}</span>
              </div>
              <div className="p-3 rounded-2xl bg-rose-50/60 border border-rose-100 text-center">
                <span className="text-[11px] text-rose-600 font-medium block">Not Affordable</span>
                <span className="text-lg font-bold text-rose-700">{historyStats.notAffordable}</span>
              </div>
            </div>

            {/* Filter and Search Bar */}
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative w-full sm:w-72">
                <input
                  type="text"
                  value={historySearch}
                  onChange={(e) => setHistorySearch(e.target.value)}
                  placeholder="Search evaluations..."
                  className="w-full pl-9 pr-3 py-2 rounded-xl bg-white border border-gray-200 text-xs focus:ring-2 focus:ring-[#0071e3]/30"
                />
                <span className="absolute left-3 top-2.5 text-gray-400 text-xs">🔍</span>
              </div>

              {/* Status Filter Chips */}
              <div className="flex flex-wrap gap-1.5 self-start sm:self-auto">
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
                    className={`px-3 py-1 rounded-full text-xs font-medium transition-all ${
                      historyStatusFilter === chip.id
                        ? "bg-gray-900 text-white shadow-sm"
                        : "bg-white text-gray-600 border border-gray-200 hover:bg-gray-50"
                    }`}
                  >
                    {chip.label}
                  </button>
                ))}
              </div>
            </div>

            {/* History List */}
            {historyLoading ? (
              <div className="text-center py-12 text-xs text-gray-400">Loading history...</div>
            ) : filteredHistory.length === 0 ? (
              <div className="apple-card p-12 rounded-3xl text-center">
                <div className="w-12 h-12 rounded-full bg-gray-100 text-gray-400 flex items-center justify-center mx-auto mb-3 text-lg">
                  📋
                </div>
                <h3 className="text-sm font-bold text-gray-800">No evaluations found</h3>
                <p className="text-xs text-gray-500 mt-1 max-w-sm mx-auto">
                  {historySearch || historyStatusFilter !== "all"
                    ? "Try adjusting your search filters or status tags."
                    : "You haven't run any evaluations yet. Check a purchase to see it logged here."}
                </p>
                <button
                  onClick={() => setActiveTab("advisor")}
                  className="mt-4 px-4 py-2 rounded-xl bg-[#0071e3] text-white text-xs font-semibold hover:bg-blue-600 transition-colors"
                >
                  Start an Evaluation
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                {filteredHistory.map((item) => {
                  const isExpanded = expandedHistoryId === item.id;
                  const statusInfo = getStatusBadge(item.decision.affordability_status);

                  return (
                    <div
                      key={item.id}
                      onClick={() => setExpandedHistoryId(isExpanded ? null : item.id)}
                      className="apple-card p-5 rounded-2xl cursor-pointer hover:border-gray-300 transition-all space-y-3"
                    >
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                        <div className="flex items-center gap-2.5">
                          <span
                            className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-bold border ${statusInfo.bg}`}
                          >
                            <span className={`w-1.5 h-1.5 rounded-full mr-1.5 ${statusInfo.dot}`}></span>
                            {statusInfo.label}
                          </span>
                          <span className="text-xs font-bold text-gray-800">
                            {item.currency} {Number(item.amount).toLocaleString()}
                          </span>
                          {item.uploadedReceiptName && (
                            <span className="text-[10px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                              📎 {item.uploadedReceiptName}
                            </span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          <span className="text-[11px] text-gray-400">
                            {new Date(item.createdAt).toLocaleDateString()} at{" "}
                            {new Date(item.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                          </span>
                          <button
                            onClick={(e) => handleDeleteHistoryItem(item.id, e)}
                            className="p-1 rounded-lg text-gray-300 hover:text-rose-600 transition-colors"
                            title="Delete this record"
                          >
                            ✕
                          </button>
                        </div>
                      </div>

                      {/* Query Text */}
                      <p className="text-xs font-semibold text-gray-900">
                        {item.query}
                      </p>

                      {/* Explanation Snippet */}
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {item.decision.decision_explanation}
                      </p>

                      {/* Expanded View */}
                      {isExpanded && (
                        <div className="pt-4 border-t border-gray-100 space-y-4 mt-2" onClick={(e) => e.stopPropagation()}>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
                            <div className="p-3 rounded-xl bg-gray-50">
                              <span className="text-gray-400 block text-[10px] uppercase font-bold">Safe Today</span>
                              <span className="font-bold text-gray-800 text-sm">
                                {item.currency} {Number(item.decision.amount_safe_to_pay).toLocaleString()}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-gray-50">
                              <span className="text-gray-400 block text-[10px] uppercase font-bold">Method</span>
                              <span className="font-bold text-gray-800 text-sm uppercase">
                                {item.decision.recommended_payment_method.replace("_", " ")}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-gray-50">
                              <span className="text-gray-400 block text-[10px] uppercase font-bold">Full Date</span>
                              <span className="font-bold text-gray-800 text-sm">
                                {item.decision.earliest_date_for_full_payment || "N/A"}
                              </span>
                            </div>
                            <div className="p-3 rounded-xl bg-gray-50">
                              <span className="text-gray-400 block text-[10px] uppercase font-bold">Account Buffer</span>
                              <span className="font-bold text-gray-800 text-sm">
                                {item.currency} {item.profileSnapshot.minimumBalance.toLocaleString()}
                              </span>
                            </div>
                          </div>

                          {/* Payment Plan if present */}
                          {item.decision.payment_plan && item.decision.payment_plan !== "none" && (
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                                Payment Schedule
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {item.decision.payment_plan.split("|").map((p, idx) => {
                                  const [pDate, pAmt] = p.split(":");
                                  return (
                                    <span
                                      key={idx}
                                      className="px-3 py-1 rounded-xl bg-blue-50 text-blue-800 border border-blue-100 text-xs font-medium"
                                    >
                                      Payment {idx + 1}: {pDate} → {item.currency} {Number(pAmt).toLocaleString()}
                                    </span>
                                  );
                                })}
                              </div>
                            </div>
                          )}

                          {/* Spending Changes if present */}
                          {item.decision.spending_changes_needed && item.decision.spending_changes_needed !== "none" && (
                            <div className="space-y-1.5">
                              <span className="text-[11px] font-bold text-gray-400 uppercase tracking-wider block">
                                Spending Changes Required
                              </span>
                              <div className="flex flex-wrap gap-2">
                                {item.decision.spending_changes_needed.split("|").map((sc, idx) => (
                                  <span
                                    key={idx}
                                    className="px-2.5 py-1 rounded-full bg-amber-50 text-amber-800 border border-amber-200 text-xs font-semibold"
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
          <div className="max-w-3xl mx-auto space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-2xl font-bold tracking-tight text-[#1d1d1f]">
                  Financial Profile & Safeguards
                </h2>
                <p className="text-xs text-gray-500 mt-0.5">
                  Update your balances, confirmed income, and priority spending categories.
                </p>
              </div>

              {profileSaveSuccess && (
                <span className="px-3 py-1.5 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 animate-fade-in">
                  ✓ Profile Saved Live
                </span>
              )}
            </div>

            <div className="apple-card rounded-3xl p-6 sm:p-8 shadow-sm">
              <form onSubmit={handleSaveProfile} className="space-y-6">
                {/* Core Account Details */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Account Owner Name
                    </label>
                    <input
                      type="text"
                      value={profile.name}
                      onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Home Currency
                    </label>
                    <select
                      value={profile.homeCurrency}
                      onChange={(e) => setProfile({ ...profile, homeCurrency: e.target.value })}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                    >
                      <option value="USD">USD ($)</option>
                      <option value="EUR">EUR (€)</option>
                      <option value="GBP">GBP (£)</option>
                      <option value="INR">INR (₹)</option>
                      <option value="CAD">CAD ($)</option>
                      <option value="AUD">AUD ($)</option>
                      <option value="JPY">JPY (¥)</option>
                      <option value="IDR">IDR (Rp)</option>
                      <option value="ZAR">ZAR (R)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Current Bank Balance ({profile.homeCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={profile.currentBalance}
                      onChange={(e) => setProfile({ ...profile, currentBalance: Number(e.target.value) })}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                      Emergency Reserve Buffer ({profile.homeCurrency})
                    </label>
                    <input
                      type="number"
                      step="any"
                      value={profile.minimumBalance}
                      onChange={(e) => setProfile({ ...profile, minimumBalance: Number(e.target.value) })}
                      className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                      required
                    />
                    <p className="text-[10px] text-gray-400 mt-1">
                      Balance will never be allowed to drop below this amount.
                    </p>
                  </div>
                </div>

                {/* Payroll & Fixed Recurring Bills */}
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Payroll & Monthly Fixed Commitments
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                        Net Monthly Salary
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={profile.monthlySalary}
                        onChange={(e) => setProfile({ ...profile, monthlySalary: Number(e.target.value) })}
                        className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                        Monthly Payday (Day 1-31)
                      </label>
                      <input
                        type="number"
                        min="1"
                        max="31"
                        value={profile.payday}
                        onChange={(e) => setProfile({ ...profile, payday: Number(e.target.value) })}
                        className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
                        Fixed Expenses (Rent/Bills)
                      </label>
                      <input
                        type="number"
                        step="any"
                        value={profile.monthlyFixedExpenses}
                        onChange={(e) => setProfile({ ...profile, monthlyFixedExpenses: Number(e.target.value) })}
                        className="w-full p-3 rounded-xl bg-[#f5f5f7] border border-gray-200 text-xs font-medium focus:ring-2 focus:ring-[#0071e3]/30"
                        required
                      />
                    </div>
                  </div>
                </div>

                {/* Categorization & Safeguards */}
                <div className="pt-4 border-t border-gray-100 space-y-4">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400">
                    Category Flexibility & Guardrails
                  </h4>

                  {/* Protected Categories */}
                  <div>
                    <span className="text-xs font-semibold text-gray-700 block mb-1.5">
                      Protected Categories (Never Reduced or Stopped):
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {["rent", "groceries", "utilities", "healthcare", "debt_repayment", "education"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleArrayItem("expenseCategoriesToProtect", c)}
                          className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                            profile.expenseCategoriesToProtect.includes(c)
                              ? "bg-emerald-100 text-emerald-800 border border-emerald-300 shadow-sm"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
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
                    <span className="text-xs font-semibold text-gray-700 block mb-1.5">
                      Categories Willing to Reduce if Needed:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {["dining", "shopping", "entertainment", "travel"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleArrayItem("expenseCategoriesWillingToReduce", c)}
                          className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                            profile.expenseCategoriesWillingToReduce.includes(c)
                              ? "bg-blue-100 text-blue-800 border border-blue-300 shadow-sm"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
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
                    <span className="text-xs font-semibold text-gray-700 block mb-1.5">
                      Categories Willing to Stop / Pause:
                    </span>
                    <div className="flex flex-wrap gap-1.5">
                      {["streaming", "cloud_storage", "music_subscription", "delivery_membership", "gym"].map((c) => (
                        <button
                          key={c}
                          type="button"
                          onClick={() => toggleArrayItem("expenseCategoriesWillingToStop", c)}
                          className={`px-3 py-1 rounded-full text-xs font-medium capitalize transition-all ${
                            profile.expenseCategoriesWillingToStop.includes(c)
                              ? "bg-amber-100 text-amber-800 border border-amber-300 shadow-sm"
                              : "bg-gray-100 text-gray-600 border border-gray-200"
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
                <div className="pt-4 border-t border-gray-100">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-gray-400 mb-3">
                    Financing & Payment Methods
                  </h4>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 items-center">
                    <div>
                      <span className="text-xs font-semibold text-gray-700 block mb-2">
                        Accepted Methods:
                      </span>
                      <div className="flex flex-wrap gap-3">
                        {[
                          { id: "full_payment", label: "Full Payment" },
                          { id: "installments", label: "Installments" },
                          { id: "partial_payment", label: "Partial Payment" },
                        ].map((m) => (
                          <label key={m.id} className="flex items-center space-x-2 text-xs cursor-pointer">
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
                      <label className="block text-xs font-semibold uppercase tracking-wider text-gray-500 mb-1.5">
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
                        className="w-full"
                      />
                    </div>
                  </div>
                </div>

                {/* Save Button & Guest reminder */}
                <div className="pt-4 flex flex-col sm:flex-row items-center justify-between gap-3">
                  {!authUser ? (
                    <div className="text-xs text-amber-700 bg-amber-50 border border-amber-200 px-3.5 py-2 rounded-xl flex items-center gap-2">
                      <span>💡</span>
                      <span>
                        Changes apply to current session only.{" "}
                        <button
                          type="button"
                          onClick={() => {
                            setAuthMode("signup");
                            setAuthError(null);
                            setAuthMessage(null);
                            setAuthModalOpen(true);
                          }}
                          className="font-semibold underline hover:text-amber-900 cursor-pointer"
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
                    className="w-full sm:w-auto px-8 py-3.5 rounded-2xl bg-gray-900 hover:bg-black text-white font-semibold text-xs shadow-sm transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer"
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
      </main>

      {/* Footer */}
      <footer className="border-t border-gray-100 py-6 text-center text-xs text-gray-400">
        Buy or Wait? — Verifiable AI Financial Commitment Assistant
      </footer>

      {/* Apple & Google Aesthetic Authentication Modal */}
      {authModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-fadeIn">
          <div
            className="relative w-full max-w-md bg-white rounded-3xl p-7 shadow-2xl border border-black/[0.06] transition-all transform animate-scaleUp"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Close Button */}
            <button
              onClick={() => setAuthModalOpen(false)}
              className="absolute top-5 right-5 w-8 h-8 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center text-sm font-semibold transition-colors cursor-pointer"
            >
              ✕
            </button>

            {/* Modal Header */}
            <div className="text-center mb-6">
              <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-[#0071e3] to-[#34a853] flex items-center justify-center text-white font-bold text-xl mx-auto mb-3 shadow-md">
                ✓
              </div>
              <h3 className="text-xl font-bold text-[#1d1d1f] tracking-tight">
                {authMode === "signin" ? "Sign In to Your Account" : "Create Your Account"}
              </h3>
              <p className="text-xs text-[#86868b] mt-1">
                {authMode === "signin"
                  ? "Access your isolated profiles, decisions, and history."
                  : "Start analyzing purchases with multi-user cloud isolation."}
              </p>
            </div>

            {/* Mode Switcher Pills */}
            <div className="flex p-1 bg-gray-100 rounded-2xl mb-5 text-xs font-semibold">
              <button
                type="button"
                onClick={() => {
                  setAuthMode("signin");
                  setAuthError(null);
                  setAuthMessage(null);
                }}
                className={`flex-1 py-2 rounded-xl transition-all ${
                  authMode === "signin"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
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
                className={`flex-1 py-2 rounded-xl transition-all ${
                  authMode === "signup"
                    ? "bg-white text-gray-900 shadow-sm"
                    : "text-gray-500 hover:text-gray-900"
                }`}
              >
                Create Account
              </button>
            </div>

            {/* Supabase unconfigured warning banner */}
            {!supabaseReady && (
              <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-800 text-xs leading-relaxed">
                <strong className="block font-semibold mb-0.5">Demo Mode Active</strong>
                Add your Supabase credentials to <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-[11px]">.env.local</code> to enable live cloud user accounts.
              </div>
            )}

            {/* Status & Error Alerts */}
            {authError && (
              <div className="mb-4 p-3 rounded-2xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium">
                {authError}
              </div>
            )}
            {authMessage && (
              <div className="mb-4 p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
                {authMessage}
              </div>
            )}

            {/* Auth Form */}
            <form onSubmit={handleAuthSubmit} className="space-y-4">
              {authMode === "signup" && (
                <div>
                  <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                    Full Name
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="Alex Morgan"
                    value={authFullName}
                    onChange={(e) => setAuthFullName(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all bg-gray-50/50 focus:bg-white"
                  />
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                  Email Address
                </label>
                <input
                  type="email"
                  required
                  placeholder="name@example.com"
                  value={authEmail}
                  onChange={(e) => setAuthEmail(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all bg-gray-50/50 focus:bg-white"
                />
              </div>

              <div>
                <label className="text-xs font-semibold text-gray-700 block mb-1.5">
                  Password
                </label>
                <input
                  type="password"
                  required
                  placeholder="••••••••"
                  value={authPassword}
                  onChange={(e) => setAuthPassword(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 text-sm focus:outline-none focus:ring-2 focus:ring-[#0071e3]/20 focus:border-[#0071e3] transition-all bg-gray-50/50 focus:bg-white"
                />
              </div>

              <button
                type="submit"
                disabled={authLoading}
                className="w-full mt-2 py-3 rounded-2xl bg-gradient-to-r from-[#0071e3] to-[#005bb5] hover:from-[#0077ed] hover:to-[#0066cc] text-white font-semibold text-xs shadow-md transition-all disabled:opacity-50 flex items-center justify-center gap-2 cursor-pointer active:scale-98"
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

            <div className="mt-5 text-center text-xs text-gray-400">
              Secured with Supabase Row Level Security (RLS)
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
