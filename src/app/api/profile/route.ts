import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const PROFILE_PATH = path.resolve(process.cwd(), "data", "profile.json");

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from("profiles")
          .select("*")
          .eq("id", user.id)
          .single();

        if (error && error.code !== "PGRST116") {
          console.error("Supabase profile error:", error);
        }

        // Return the Supabase profile, or sensible defaults for a new user
        const profileRow = data || {};
        return NextResponse.json({
          success: true,
          profile: {
            name: profileRow.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
            homeCurrency: profileRow.home_currency || "USD",
            currentBalance: Number(profileRow.current_balance ?? 5000),
            minimumBalance: Number(profileRow.minimum_balance ?? 1500),
            monthlySalary: Number(profileRow.monthly_salary ?? 3500),
            payday: Number(profileRow.payday ?? 15),
            monthlyFixedExpenses: Number(profileRow.monthly_fixed_expenses ?? 1200),
            financialPriorities: profileRow.financial_priorities || ["emergency_savings", "retirement"],
            expenseCategoriesToProtect: profileRow.expense_categories_to_protect || ["rent", "groceries", "utilities", "healthcare"],
            expenseCategoriesWillingToReduce: profileRow.expense_categories_willing_to_reduce || ["dining", "shopping", "entertainment"],
            expenseCategoriesWillingToStop: profileRow.expense_categories_willing_to_stop || ["streaming", "cloud_storage"],
            paymentMethodsUserWillConsider: profileRow.payment_methods || ["full_payment", "installments", "partial_payment"],
            maxInstallmentMonths: Number(profileRow.max_installment_months ?? 6),
          },
          source: "supabase",
          user: { id: user.id, email: user.email },
        });
      }
    }

    // Local JSON fallback
    if (!fs.existsSync(PROFILE_PATH)) {
      return NextResponse.json({ error: "Profile not found" }, { status: 404 });
    }
    const data = JSON.parse(fs.readFileSync(PROFILE_PATH, "utf-8"));
    return NextResponse.json({ success: true, profile: data, source: "local" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const updated = {
      ...body,
      updatedAt: new Date().toISOString(),
    };

    const supabase = createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const dbPayload = {
          id: user.id,
          name: updated.name || user.user_metadata?.full_name || user.email?.split("@")[0] || "User",
          home_currency: updated.homeCurrency || "USD",
          current_balance: Number(updated.currentBalance ?? 0),
          minimum_balance: Number(updated.minimumBalance ?? 0),
          monthly_salary: Number(updated.monthlySalary ?? 0),
          payday: Number(updated.payday ?? 1),
          monthly_fixed_expenses: Number(updated.monthlyFixedExpenses ?? 0),
          financial_priorities: updated.financialPriorities || ["emergency_savings"],
          expense_categories_to_protect: updated.expenseCategoriesToProtect || ["rent", "groceries"],
          expense_categories_willing_to_reduce: updated.expenseCategoriesWillingToReduce || ["dining"],
          expense_categories_willing_to_stop: updated.expenseCategoriesWillingToStop || ["streaming"],
          payment_methods: updated.paymentMethodsUserWillConsider || ["full_payment"],
          max_installment_months: Number(updated.maxInstallmentMonths ?? 6),
          updated_at: new Date().toISOString(),
        };

        const { error } = await supabase.from("profiles").upsert(dbPayload);
        if (error) {
          console.error("Supabase profile upsert error:", error);
          throw new Error(error.message);
        }

        return NextResponse.json({
          success: true,
          profile: updated,
          source: "supabase",
        });
      }
    }

    // Local JSON fallback
    try {
      fs.mkdirSync(path.dirname(PROFILE_PATH), { recursive: true });
      fs.writeFileSync(PROFILE_PATH, JSON.stringify(updated, null, 2), "utf-8");
    } catch {
      // In serverless environments, file write is gracefully ignored
    }

    return NextResponse.json({ success: true, profile: updated, source: "local" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
