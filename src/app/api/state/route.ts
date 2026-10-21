import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { DEFAULT_MODEL } from "@/lib/evaluate";
import { AKTIVE_QUELLEN } from "@/lib/quellen";

/** Cursor-IDs der Importer: Arbeitsagentur = "de", die anderen heißen wie ihre Quelle. */
const AKTIVE_QUELLEN_CURSOR = ["de", "ats", "google", "arbeitnow", "nachtlauf", "morgenlauf"];

export const dynamic = "force-dynamic";

/** Zählt, was die Steuerungsseite anzeigen muss. Ohne Secret, nur lesend. */
export async function GET() {
  try {
    const db = supabaseAdmin();

    const count = async (build: (query: any) => any) => {
      const { count: result } = await build(
        db.from("jobs").select("uuid", { count: "exact", head: true }).in("source", AKTIVE_QUELLEN)
      );
      return result ?? 0;
    };

    const [aktiv, unbewertet, inbox, mustApply, ungelabelt, hamburg, remote, cursors, ...proQuelle] =
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
        db.from("import_cursor").select("id,at_end,last_run_at,last_note").in("id", AKTIVE_QUELLEN_CURSOR),
        ...AKTIVE_QUELLEN.map((quelle) => count((q: any) => q.eq("status", "ACTIVE").eq("source", quelle))),
      ]);

    // Ausfälle der letzten 24 Stunden; fehlt die Tabelle, einfach 0.
    const { count: ausfaelle } = await db
      .from("quellen_log")
      .select("id", { count: "exact", head: true })
      .gte("created_at", new Date(Date.now() - 864e5).toISOString());

    return NextResponse.json({
      aktiv,
      unbewertet,
      inbox,
      mustApply,
      ungelabelt,
      hamburg,
      remote,
      cursors: (cursors as any).data ?? [],
      quellen: Object.fromEntries(AKTIVE_QUELLEN.map((quelle, index) => [quelle, proQuelle[index] as number])),
      ausfaelle24h: ausfaelle ?? 0,
      modell: process.env.EVAL_MODEL || DEFAULT_MODEL,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
