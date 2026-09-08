import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

/** Zählt, was die Steuerungsseite anzeigen muss. Ohne Secret, nur lesend. */
export async function GET() {
  try {
    const db = supabaseAdmin();

    const count = async (build: (query: any) => any) => {
      const { count: result } = await build(
        db.from("jobs").select("uuid", { count: "exact", head: true })
      );
      return result ?? 0;
    };

    const [aktiv, unbewertet, unbewertet4Tage, inbox, blockiert, ungelabelt, nav, se, cursors] =
      await Promise.all([
        count((q: any) => q.eq("status", "ACTIVE")),
        count((q: any) => q.eq("status", "ACTIVE").is("evaluated_at", null)),
        count((q: any) =>
          q
            .eq("status", "ACTIVE")
            .is("evaluated_at", null)
            .gte("published", new Date(Date.now() - 4 * 864e5).toISOString())
        ),
        db.from("v_inbox").select("uuid", { count: "exact", head: true }),
        db.from("v_language_blocked").select("uuid", { count: "exact", head: true }),
        count((q: any) => q.eq("status", "ACTIVE").is("label", null)),
        count((q: any) => q.eq("status", "ACTIVE").eq("source", "nav")),
        count((q: any) => q.eq("status", "ACTIVE").eq("source", "jobstream")),
        db.from("import_cursor").select("id,at_end,last_item_date,last_run_at,last_note"),
      ]);

    return NextResponse.json({
      aktiv,
      unbewertet,
      unbewertet4Tage,
      inbox: inbox.count ?? 0,
      blockiert: blockiert.count ?? 0,
      ungelabelt,
      nav,
      se,
      cursors: cursors.data ?? [],
      modell: process.env.EVAL_MODEL ?? "claude-sonnet-5",
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
