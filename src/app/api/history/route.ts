import { NextResponse } from "next/server";
import fs from "fs";
import path from "path";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const HISTORY_PATH = path.resolve(process.cwd(), "data", "history.json");

export async function GET() {
  try {
    const supabase = createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        const { data, error } = await supabase
          .from("decisions")
          .select("*")
          .eq("user_id", user.id)
          .order("created_at", { ascending: false });

        if (error) {
          console.error("Supabase history error:", error);
          throw new Error(error.message);
        }

        const mapped = (data || []).map((row: any) => ({
          id: row.id,
          createdAt: row.created_at,
          query: row.query,
          amount: Number(row.amount),
          currency: row.currency,
          requestDate: row.request_date,
          desiredDate: row.desired_date,
          allowsPartial: row.allows_partial,
          uploadedReceiptName: row.uploaded_receipt_name,
          decision: row.decision,
          profileSnapshot: row.profile_snapshot,
          trajectory: row.trajectory,
        }));

        return NextResponse.json({ success: true, history: mapped, source: "supabase" });
      }
    }

    // Local JSON fallback
    if (!fs.existsSync(HISTORY_PATH)) {
      return NextResponse.json({ success: true, history: [], source: "local" });
    }
    const data = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));
    return NextResponse.json({ success: true, history: data, source: "local" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get("id");

    const supabase = createServerSupabaseClient();
    if (supabase) {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (user) {
        let query = supabase.from("decisions").delete().eq("user_id", user.id);
        if (id) {
          query = query.eq("id", id);
        }
        const { error } = await query;
        if (error) {
          console.error("Supabase delete error:", error);
          throw new Error(error.message);
        }

        return NextResponse.json({ success: true, history: [], source: "supabase" });
      }
    }

    // Local JSON fallback
    if (!fs.existsSync(HISTORY_PATH)) {
      return NextResponse.json({ success: true, history: [], source: "local" });
    }

    let history = JSON.parse(fs.readFileSync(HISTORY_PATH, "utf-8"));

    if (id) {
      history = history.filter((item: any) => item.id !== id);
    } else {
      history = [];
    }

    try {
      fs.writeFileSync(HISTORY_PATH, JSON.stringify(history, null, 2), "utf-8");
    } catch {
      // Ignore in read-only environment
    }

    return NextResponse.json({ success: true, history, source: "local" });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
