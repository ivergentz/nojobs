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
  if (!options.force) query = query.is("evaluated_at", null);
  if (options.days) {
    const from = new Date(Date.now() - options.days * 24 * 60 * 60 * 1000);
    query = query.gte("published", from.toISOString());
  }

  const { data, error } = await query;
  if (error) throw new Error(`Stellen lesen: ${error.message}`);

  const jobs = data ?? [];

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
