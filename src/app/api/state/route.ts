import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_MODEL } from "@/lib/evaluate";

export const dynamic = "force-dynamic";

/** Zählt, was die Steuerungsseite anzeigen muss. Ohne Secret, nur lesend. */
export async function GET() {
  try {
    const db = supabaseAdmin();

    const count = async (build: (query: any) => any) => {
      const { count: result } = await build(
        db.from("jobs").select("uuid", { count: "exact", head: true }).eq("source", "ba")
      );
      return result ?? 0;
    };

    const [aktiv, unbewertet, inbox, mustApply, ungelabelt, hamburg, remote, cursors] =
      await Promise.all([
        count((q: any) => q.eq("status", "ACTIVE")),
        count((q: any) => q.eq("status", "ACTIVE").is("evaluated_at", null)),
        count((q: any) =>
          q
            .eq("status", "ACTIVE")
            .in("eval_fit", ["must_apply", "worth_reading"])
            .in("app_status", ["neu", "interessant"])
        ),
        count((q: any) =>
          q.eq("status", "ACTIVE").eq("eval_fit", "must_apply").in("app_status", ["neu", "interessant"])
        ),
        count((q: any) => q.eq("status", "ACTIVE").is("label", null)),
        count((q: any) => q.eq("status", "ACTIVE").like("match_term", "hamburg:%")),
        count((q: any) => q.eq("status", "ACTIVE").like("match_term", "remote:%")),
        db.from("import_cursor").select("id,at_end,last_run_at,last_note").eq("id", "de"),
      ]);

    return NextResponse.json({
      aktiv,
      unbewertet,
      inbox,
      mustApply,
      ungelabelt,
      hamburg,
      remote,
      cursors: cursors.data ?? [],
      modell: process.env.EVAL_MODEL || DEFAULT_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
