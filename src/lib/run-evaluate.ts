import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateAd } from "./evaluate";
import { AKTIVE_QUELLEN } from "./quellen";

/**
 * Bewertet offene Stellen in Blöcken, zeitbudgetiert.
 *
 * Gemeinsam genutzt von /api/evaluate (Steuerungsseite) und /api/notify
 * (Morgen-Cron: erst bewerten, dann benachrichtigen).
 *
 * Neue Blöcke starten nur, solange das Budget nicht verbraucht ist. Ein
 * Block kann danach noch bis zum Timeout pro Aufruf (25 s) laufen — das
 * Budget muss also mindestens so viel Luft zum 60-Sekunden-Limit lassen.
 */

const CONCURRENCY = 15;
const num = new Intl.NumberFormat("de-DE", { maximumFractionDigits: 0 });

export type EvaluationRun = {
  evaluated: number;
  failed: number;
  nochOffen: number;
  fehlerbeispiele: string[];
};

export async function runEvaluation(
  db: SupabaseClient,
  options: {
    budgetMs: number;
    scope?: "all" | "labeled";
    force?: boolean;
    /** Neu bewerten, was vor diesem Zeitpunkt bewertet wurde (ISO). Läuft nicht im Kreis. */
    neuVor?: string | null;
    days?: number | null;
    limit?: number;
  }
): Promise<EvaluationRun> {
  const startedAt = Date.now();
  const stats = { evaluated: 0, failed: 0 };
  const errors: string[] = [];

  let query = db
    .from("jobs")
    .select("uuid,title,employer_name,municipal,county,sector,salary_min_nok,salary_max_nok,salary_note,description")
    .eq("status", "ACTIVE")
    .in("source", AKTIVE_QUELLEN)
    .order("published", { ascending: false, nullsFirst: false })
    .limit(options.limit ?? 60);

  if (options.scope === "labeled") query = query.not("label", "is", null);
  if (options.neuVor) {
    query = query.or(`evaluated_at.is.null,evaluated_at.lt.${options.neuVor}`);
  } else if (!options.force) {
    query = query.is("evaluated_at", null);
  }
  if (options.days) {
    const from = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
    query = query.gte("published", from.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(`Stellen lesen: ${error.message}`);

  const jobs = data ?? [];
  const beispiele = jobs.length ? await ladeBeispiele(db, new Set(jobs.map((job) => job.uuid as string))) : "";

  for (let i = 0; i < jobs.length; i += CONCURRENCY) {
    if (Date.now() - startedAt > options.budgetMs) break;

    await Promise.all(
      jobs.slice(i, i + CONCURRENCY).map(async (job) => {
        try {
          const min = job.salary_min_nok as number | null;
          const max = job.salary_max_nok as number | null;
          const salary =
            min !== null || max !== null
              ? `${num.format(min ?? (max as number))}–${num.format(max ?? (min as number))} €`
              : ((job.salary_note as string) ?? "");

          const result = await evaluateAd({
            title: (job.title as string) ?? "",
            employer: (job.employer_name as string) ?? "",
            place: [job.municipal, job.county].filter(Boolean).join(", "),
            homeoffice: (job.sector as string) ?? "",
            salary,
            description: (job.description as string) ?? "",
            beispiele,
          });

          const { error: writeError } = await db
            .from("jobs")
            .update({
              eval_fit: result.fit,
              eval_confidence: result.confidence,
              eval_summary: result.summary,
              eval_pros: result.pros,
              eval_cons: result.cons,
              evaluated_at: new Date().toISOString(),
            })
            .eq("uuid", job.uuid as string);

          if (writeError) throw new Error(writeError.message);
          stats.evaluated += 1;
        } catch (err) {
          stats.failed += 1;
          const message = err instanceof Error ? err.message : String(err);
          if (errors.length < 3) errors.push(message);
        }
      })
    );
  }

  const { count: remaining } = await db
    .from("jobs")
    .select("uuid", { count: "exact", head: true })
    .eq("status", "ACTIVE")
    .in("source", AKTIVE_QUELLEN)
    .is("evaluated_at", null);

  return { ...stats, nochOffen: remaining ?? 0, fehlerbeispiele: errors };
}

const LABEL_TEXT: Record<string, string> = {
  must_apply: "BEWERBEN",
  worth_reading: "ANSCHAUEN",
  ignore: "IGNORIEREN",
};

/**
 * Ivers eigene Labels als Beispiele für das Modell: alle "Bewerben", ein Teil
 * "Anschauen", und vor allem "Ignorieren"-Fälle, die das Modell bisher zu
 * hoch eingestuft hat — genau dort lag das Rauschen.
 *
 * Die Stellen, die gerade bewertet werden, sind ausgeschlossen. Sonst würde
 * die Kalibrierung sich selbst abschreiben.
 */
async function ladeBeispiele(db: SupabaseClient, ausschliessen: Set<string>): Promise<string> {
  const { data } = await db
    .from("jobs")
    .select("uuid,title,employer_name,municipal,sector,label,eval_fit")
    .not("label", "is", null)
    .order("labeled_at", { ascending: false, nullsFirst: false })
    .limit(600);

  const rows = (data ?? []).filter((row) => !ausschliessen.has(row.uuid as string) && row.title);
  const bewerben = rows.filter((row) => row.label === "must_apply").slice(0, 30);
  const anschauen = rows.filter((row) => row.label === "worth_reading").slice(0, 15);
  const ignoriertAberHoch = rows
    .filter((row) => row.label === "ignore" && (row.eval_fit === "must_apply" || row.eval_fit === "worth_reading"))
    .slice(0, 30);
  const ignoriertRest = rows
    .filter((row) => row.label === "ignore" && !ignoriertAberHoch.includes(row))
    .slice(0, Math.max(0, 40 - ignoriertAberHoch.length));

  const zeile = (row: Record<string, unknown>) =>
    `- [${LABEL_TEXT[row.label as string]}] ${row.title} — ${row.employer_name ?? "?"}, ${row.municipal ?? "Ort?"}` +
    (row.sector ? ` (${row.sector})` : "");

  return [...bewerben, ...anschauen, ...ignoriertAberHoch, ...ignoriertRest].map(zeile).join("\n");
}
