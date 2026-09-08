import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { evaluateAd } from "@/lib/evaluate";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Der Puffer muss zum langsamsten Schritt passen, nicht zum Durchschnitt.
 * Ein Modellaufruf kann 25 Sekunden brauchen; startet ein Block bei Sekunde 44,
 * endet er jenseits des 60-Sekunden-Limits von Vercel und reißt alles mit.
 * Deshalb: neue Blöcke nur bis Sekunde 25, plus harter Abbruch pro Aufruf.
 */
const TIME_BUDGET_DEFAULT = 25_000;
const CONCURRENCY = 25;

/**
 * Bewertet Stellen in Blöcken, zeitbudgetiert wie der Importer.
 *
 * ?scope=labeled  — nur Stellen, die Iver selbst beurteilt hat (Kalibrierung)
 * ?scope=all      — alle aktiven Stellen
 * ?force=1        — vorhandene Bewertungen überschreiben (nach Prompt-Änderung)
 */
export async function GET(request: Request) {
  const url = new URL(request.url);
  const secret = process.env.IMPORT_SECRET;
  if (secret && url.searchParams.get("secret") !== secret) {
    return NextResponse.json({ error: "nicht autorisiert" }, { status: 401 });
  }

  const scope = url.searchParams.get("scope") ?? "labeled";
  const force = url.searchParams.get("force") === "1";
  const startedAt = Date.now();
  const TIME_BUDGET_MS = Number(url.searchParams.get("budget") ?? TIME_BUDGET_DEFAULT);
  const db = supabaseAdmin();

  const stats = { evaluated: 0, failed: 0 };
  const errors: string[] = [];

  try {
    let query = db
      .from("jobs")
      .select("uuid,title,employer_name,municipal,county,occupation_level1,description")
      .eq("status", "ACTIVE")
      .order("published", { ascending: false, nullsFirst: false })
      .limit(Number(url.searchParams.get("limit") ?? "75"));

    if (scope === "labeled") query = query.not("label", "is", null);
    if (!force) query = query.is("evaluated_at", null);

    // Alte Anzeigen zuerst zu bewerten lohnt nicht — viele Bewerbungsfristen
    // sind abgelaufen. ?days=N beschränkt auf die letzten N Tage.
    const days = url.searchParams.get("days");
    if (days) {
      const from = new Date(Date.now() - Number(days) * 24 * 60 * 60 * 1000);
      query = query.gte("published", from.toISOString());
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const jobs = data ?? [];

    for (let i = 0; i < jobs.length; i += CONCURRENCY) {
      if (Date.now() - startedAt > TIME_BUDGET_MS) break;

      await Promise.all(
        jobs.slice(i, i + CONCURRENCY).map(async (job) => {
          try {
            const result = await evaluateAd({
              title: (job.title as string) ?? "",
              employer: (job.employer_name as string) ?? "",
              place: [job.municipal, job.county].filter(Boolean).join(", "),
              category: (job.occupation_level1 as string) ?? "",
              description: (job.description as string) ?? "",
            });

            const { error: writeError } = await db
              .from("jobs")
              .update({
                eval_fit: result.fit,
                eval_language: result.language,
                eval_confidence: result.confidence,
                eval_summary: result.summary,
                eval_pros: result.pros,
                eval_cons: result.cons,
                evaluated_at: new Date().toISOString(),
              })
              .eq("uuid", job.uuid as string);

            if (writeError) throw new Error(writeError.message);
            stats.evaluated += 1;
          } catch (error) {
            stats.failed += 1;
            const message = error instanceof Error ? error.message : String(error);
            if (errors.length < 3) errors.push(message);
          }
        })
      );
    }

    const { count: remaining } = await db
      .from("jobs")
      .select("uuid", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .is("evaluated_at", null);

    return NextResponse.json({
      ok: true,
      scope,
      durationMs: Date.now() - startedAt,
      ...stats,
      nochOffen: remaining ?? 0,
      modell: process.env.EVAL_MODEL ?? "claude-sonnet-5",
      fehlerbeispiele: errors,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ ok: false, error: message, ...stats }, { status: 500 });
  }
}
