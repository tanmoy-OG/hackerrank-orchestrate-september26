import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import {
  FinancialEngine,
  decideRequest,
  ExchangeRateEngine,
  FinancialProfileData,
  FinancialEventData,
  PaymentOptionData,
  RequestData,
  parseDate,
  toDateStr,
  addDays,
} from "@/lib/financialEngine";
import { generateGroundedExplanation } from "@/lib/llmOrchestrator";

const BASE_DIR = process.cwd();
const HISTORY_PATH = path.join(BASE_DIR, "data", "history.json");
const PROFILE_PATH = path.join(BASE_DIR, "data", "profile.json");

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const {
      query = "Can I afford this purchase?",
      amount = 1000,
      currency = "USD",
      requestDate = new Date().toISOString().split("T")[0],
      desiredDate = "",
      allowsPartial = false,
      uploadedReceiptName = "",
      extractedReceiptAmount = null,
      customProfile = null,
    } = body;

    const supabase = createServerSupabaseClient();
    let authUser: any = null;
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      authUser = user;
    }

    // Load active profile: customProfile > Supabase profile > local file
    let activeProfile = customProfile;
    if (!activeProfile && authUser && supabase) {
      const { data: dbProfile } = await supabase
        .from("profiles")
        .select("*")
        .eq("id", authUser.id)
        .single();

      if (dbProfile) {
        activeProfile = {
          name: dbProfile.name || authUser.email?.split("@")[0] || "User",
          homeCurrency: dbProfile.home_currency,
          currentBalance: dbProfile.current_balance,
          minimumBalance: dbProfile.minimum_balance,
          monthlySalary: dbProfile.monthly_salary,
          payday: dbProfile.payday,
          monthlyFixedExpenses: dbProfile.monthly_fixed_expenses,
          financialPriorities: dbProfile.financial_priorities,
          expenseCategoriesToProtect: dbProfile.expense_categories_to_protect,
          expenseCategoriesWillingToReduce: dbProfile.expense_categories_willing_to_reduce,
          expenseCategoriesWillingToStop: dbProfile.expense_categories_willing_to_stop,
          paymentMethodsUserWillConsider: dbProfile.payment_methods,
          maxInstallmentMonths: dbProfile.max_installment_months,
        };
      }
    }

    if (!activeProfile && fs.existsSync(PROFILE_PATH)) {
      try {
        activeProfile = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
      } catch {
        // Fallback below
      }
    }

    const cUser = String(activeProfile?.name || "user_me").trim().toLowerCase().replace(/\s+/g, "_");
    const cCurr = String(activeProfile?.homeCurrency || currency);
    const cBal = Number(activeProfile?.currentBalance ?? amount * 2);
    const cMin = Number(activeProfile?.minimumBalance ?? amount * 0.5);
    const cPrio = activeProfile?.financialPriorities || ["emergency_savings"];
    const cProt = activeProfile?.expenseCategoriesToProtect || activeProfile?.categoriesToProtect || ["rent", "groceries", "utilities"];
    const cRed = activeProfile?.expenseCategoriesWillingToReduce || activeProfile?.categoriesToReduce || ["dining", "shopping"];
    const cStop = activeProfile?.expenseCategoriesWillingToStop || activeProfile?.categoriesToStop || ["streaming", "cloud_storage"];
    const cMeth = activeProfile?.paymentMethodsUserWillConsider || activeProfile?.paymentMethods || ["full_payment", "installments", "partial_payment"];
    const cMaxM = Number(activeProfile?.maxInstallmentMonths ?? 6);
    const salaryAmt = Number(activeProfile?.monthlySalary ?? amount * 1.5);
    const paydayDay = Number(activeProfile?.payday ?? 15);
    const fixedExp = Number(activeProfile?.monthlyFixedExpenses ?? amount * 0.4);

    const profileData: FinancialProfileData = {
      user_id: cUser,
      home_currency: cCurr,
      current_available_balance: cBal,
      minimum_balance_to_keep: cMin,
      financial_priorities: cPrio,
      expense_categories_to_protect: cProt,
      expense_categories_willing_to_reduce: cRed,
      expense_categories_willing_to_stop: cStop,
      payment_methods: cMeth,
      max_installment_months: cMaxM,
    };

    const reqD = parseDate(requestDate) || new Date();
    const reqYear = reqD.getUTCFullYear();
    const reqMonth = reqD.getUTCMonth();

    // 1. Synthesize realistic salary events
    const uEvents: FinancialEventData[] = [];

    // Past settled salary in previous month
    const prevMonthYear = reqMonth === 0 ? reqYear - 1 : reqYear;
    const prevMonthIdx = reqMonth === 0 ? 11 : reqMonth - 1;
    const pastSalDate = toDateStr(new Date(Date.UTC(prevMonthYear, prevMonthIdx, Math.min(paydayDay, 28))));

    uEvents.push({
      event_id: `${cUser}_sal_01`,
      user_id: cUser,
      event_type: "income",
      description: "Monthly payroll credit",
      category: "salary",
      direction: "credit",
      amount: salaryAmt,
      currency: cCurr,
      event_date: pastSalDate,
      settlement_date: pastSalDate,
      status: "settled",
      flexibility: "fixed",
    });

    // Next scheduled salary
    let nextSalDateObj = new Date(Date.UTC(reqYear, reqMonth, Math.min(paydayDay, 28)));
    if (toDateStr(nextSalDateObj) < requestDate) {
      nextSalDateObj = reqMonth === 11
        ? new Date(Date.UTC(reqYear + 1, 0, Math.min(paydayDay, 28)))
        : new Date(Date.UTC(reqYear, reqMonth + 1, Math.min(paydayDay, 28)));
    }
    const nextSalDateStr = toDateStr(nextSalDateObj);

    uEvents.push({
      event_id: `${cUser}_sal_02`,
      user_id: cUser,
      event_type: "income",
      description: "Next confirmed salary",
      category: "salary",
      direction: "credit",
      amount: salaryAmt,
      currency: cCurr,
      event_date: nextSalDateStr,
      settlement_date: nextSalDateStr,
      status: "scheduled",
      flexibility: "fixed",
    });

    // 2. Fixed recurring debits (Rent & Utilities)
    const rentAmt = Math.round(fixedExp * 0.7 * 100) / 100;
    const utilAmt = Math.round(fixedExp * 0.3 * 100) / 100;
    const rentDate = toDateStr(new Date(Date.UTC(reqYear, reqMonth, 1)));
    const utilDate = toDateStr(new Date(Date.UTC(reqYear, reqMonth, Math.min(7, 28))));

    uEvents.push({
      event_id: `${cUser}_rent_01`,
      user_id: cUser,
      event_type: "expense",
      description: "Monthly rent / housing",
      category: "rent",
      direction: "debit",
      amount: rentAmt,
      currency: cCurr,
      event_date: rentDate,
      settlement_date: rentDate,
      status: "settled",
      flexibility: "fixed",
    });

    uEvents.push({
      event_id: `${cUser}_util_01`,
      user_id: cUser,
      event_type: "expense",
      description: "Essential utility bill",
      category: "utilities",
      direction: "debit",
      amount: utilAmt,
      currency: cCurr,
      event_date: utilDate,
      settlement_date: utilDate,
      status: "settled",
      flexibility: "fixed",
    });

    // 3. Stoppable subscription
    const streamAmt = Math.round(fixedExp * 0.05 * 100) / 100;
    const streamDate = toDateStr(new Date(Date.UTC(reqYear, reqMonth, Math.min(10, 28))));
    uEvents.push({
      event_id: `${cUser}_stream_01`,
      user_id: cUser,
      event_type: "subscription",
      description: "Streaming entertainment subscription",
      category: "streaming",
      direction: "debit",
      amount: streamAmt,
      currency: cCurr,
      event_date: streamDate,
      settlement_date: streamDate,
      status: "settled",
      flexibility: "stoppable",
      minimum_allowed_amount: 0,
    });

    // 4. Reducible dining
    const dineAmt = Math.round(fixedExp * 0.15 * 100) / 100;
    const dineDate = toDateStr(new Date(Date.UTC(reqYear, reqMonth, Math.min(12, 28))));
    uEvents.push({
      event_id: `${cUser}_dine_01`,
      user_id: cUser,
      event_type: "expense",
      description: "Weekend restaurant dining",
      category: "dining",
      direction: "debit",
      amount: dineAmt,
      currency: cCurr,
      event_date: dineDate,
      settlement_date: dineDate,
      status: "settled",
      flexibility: "reducible",
      minimum_allowed_amount: Math.round(dineAmt * 0.4 * 100) / 100,
    });

    // Attached receipt/invoice if present
    if (extractedReceiptAmount != null) {
      uEvents.push({
        event_id: "receipt_upload_01",
        user_id: cUser,
        event_type: "expense",
        description: "Attached invoice / receipt",
        category: "shopping",
        direction: "debit",
        amount: Number(extractedReceiptAmount),
        currency: currency,
        event_date: requestDate,
        settlement_date: requestDate,
        status: "pending",
        flexibility: "fixed",
      });
    }

    // Initialize native engine
    const exchangeEngine = new ExchangeRateEngine();
    const engine = new FinancialEngine(profileData, uEvents, exchangeEngine);

    const reqData: RequestData = {
      request_id: `req_${Date.now()}`,
      user_id: profileData.user_id,
      request_date: requestDate,
      request_type: "purchase",
      requested_amount: Number(amount),
      desired_completion_date: desiredDate,
      allows_partial_payment: Boolean(allowsPartial),
      request_text: query,
    };

    // Candidate payment options
    const paymentOpts: PaymentOptionData[] = [
      {
        payment_option_id: "opt_full",
        request_id: reqData.request_id,
        payment_method: "full_payment",
        payment_amount: Number(amount),
        number_of_payments: 1,
        first_payment_date: requestDate,
        total_payable_amount: Number(amount),
      },
      {
        payment_option_id: "opt_inst_3",
        request_id: reqData.request_id,
        payment_method: "installments",
        payment_amount: Math.round((Number(amount) / 3.0) * 100) / 100,
        number_of_payments: 3,
        first_payment_date: requestDate,
        payment_frequency_days: 30,
        total_payable_amount: Number(amount),
      },
    ];

    // Compute decision natively
    const decision = decideRequest(reqData, engine, paymentOpts);

    // Compute 90-day trajectory
    let planPayments: Array<{ date: string; amount: number }> = [];
    if (decision.recommended_payment_method === "full_payment") {
      planPayments = [{ date: reqData.request_date, amount: reqData.requested_amount }];
    } else if (decision.recommended_payment_method === "installments" && decision.payment_plan !== "none") {
      planPayments = decision.payment_plan.split("|").map((item) => {
        const [dStr, aStr] = item.split(":");
        return { date: dStr, amount: parseFloat(aStr) };
      });
    }

    const rawTrajectory = engine.forecastCashPositions(reqD, 90, new Set(), new Map(), planPayments);
    const sampledChart = [];
    let lowestBalance = Infinity;
    let lowestBalanceDate = reqData.request_date;

    for (let idx = 0; idx < rawTrajectory.length; idx++) {
      const pt = rawTrajectory[idx];
      if (pt.balance < lowestBalance) {
        lowestBalance = pt.balance;
        lowestBalanceDate = pt.date;
      }
      if (idx % 5 === 0) {
        sampledChart.push({
          date: pt.date,
          balance: Math.round(pt.balance * 100) / 100,
          minRequired: Math.round(profileData.minimum_balance_to_keep * 100) / 100,
          isBelow: pt.balance < profileData.minimum_balance_to_keep,
        });
      }
    }
    if (lowestBalance === Infinity) lowestBalance = profileData.current_available_balance;

    // Invoke Grounded Multi-LLM Waterfall (Gemini -> Mistral -> Groq -> Native Engine)
    const llmResult = await generateGroundedExplanation({
      query,
      amount: Number(amount),
      currency: cCurr,
      verdict: decision.affordability_status,
      currentBalance: profileData.current_available_balance,
      minimumBalance: profileData.minimum_balance_to_keep,
      safeToday: Number(decision.amount_safe_to_pay) || 0,
      lowestProjectedBalance: Math.round(lowestBalance * 100) / 100,
      lowestBalanceDate,
      recommendedPaymentMethod: decision.recommended_payment_method,
      paymentPlan: decision.payment_plan,
      spendingChangesNeeded: decision.spending_changes_needed,
      deterministicExplanation: decision.decision_explanation,
      userName: activeProfile?.name || "User",
    });

    const enrichedDecision = {
      ...decision,
      decision_explanation: llmResult.ai_explanation,
      deterministic_explanation: decision.decision_explanation,
      ai_provider: llmResult.ai_provider,
      ai_model: llmResult.ai_model,
      math_verified: llmResult.math_verified,
      ai_latency_ms: llmResult.latency_ms,
      lowest_projected_balance: Math.round(lowestBalance * 100) / 100,
      lowest_balance_date: lowestBalanceDate,
    };

    const outputPayload = {
      decision: enrichedDecision,
      profile: {
        user_id: profileData.user_id,
        home_currency: profileData.home_currency,
        current_balance: profileData.current_available_balance,
        minimum_balance: profileData.minimum_balance_to_keep,
        priorities: profileData.financial_priorities,
        payment_methods: profileData.payment_methods,
      },
      trajectory: sampledChart,
    };

    // Save this decision to History (Supabase if authenticated, else local JSON fallback)
    const historyId = `req_${Date.now()}`;
    const historyItem = {
      id: historyId,
      createdAt: new Date().toISOString(),
      query,
      amount,
      currency,
      requestDate,
      desiredDate,
      allowsPartial,
      uploadedReceiptName,
      decision: outputPayload.decision,
      profileSnapshot: {
        name: activeProfile?.name || outputPayload.profile.user_id,
        currentBalance: outputPayload.profile.current_balance,
        minimumBalance: outputPayload.profile.minimum_balance,
        homeCurrency: outputPayload.profile.home_currency,
      },
      trajectory: outputPayload.trajectory,
    };

    if (authUser && supabase) {
      try {
        await supabase.from("decisions").insert({
          id: historyId,
          user_id: authUser.id,
          query: historyItem.query,
          amount: Number(historyItem.amount),
          currency: historyItem.currency,
          request_date: historyItem.requestDate,
          desired_date: historyItem.desiredDate,
          allows_partial: Boolean(historyItem.allowsPartial),
          uploaded_receipt_name: historyItem.uploadedReceiptName,
          decision: historyItem.decision,
          profile_snapshot: historyItem.profileSnapshot,
          trajectory: historyItem.trajectory,
        });
      } catch (dbErr) {
        console.error("Failed to insert decision to Supabase:", dbErr);
      }
    } else {
      try {
        let history: any[] = [];
        if (fs.existsSync(HISTORY_PATH)) {
          try {
            history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
          } catch {
            history = [];
          }
        }
        history.unshift(historyItem);
        fs.mkdirSync(path.dirname(HISTORY_PATH), { recursive: true });
        fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
      } catch {
        // In serverless read-only environments, history write is skipped safely
      }
    }

    return NextResponse.json({
      success: true,
      ...outputPayload,
      savedHistoryId: historyItem.id,
      source: authUser ? "supabase" : "local",
    });
  } catch (err: any) {
    console.error("Error in analyze route:", err);
    return NextResponse.json(
      { success: false, error: err.message || "Failed to analyze purchase request" },
      { status: 500 }
    );
  }
}
