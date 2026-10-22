import type { SupabaseClient } from "@supabase/supabase-js";
import { evaluateAd } from "./evaluate";
import { AKTIVE_QUELLEN } from "./quellen";
import { grundText } from "./gruende";

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

  // Kurze Verbindungsabbrüche zu Supabase ("terminated", "fetch failed")
  // kommen vor — bis zu zweimal neu versuchen, bevor der Lauf abbricht.
  let data: Record<string, unknown>[] | null = null;
  let letzterFehler = "";
  for (let versuch = 0; versuch < 3; versuch++) {
    try {
      const antwort = await query;
      if (!antwort.error) {
        data = antwort.data as Record<string, unknown>[];
        break;
      }
      letzterFehler = antwort.error.message;
    } catch (err) {
      letzterFehler = err instanceof Error ? `${err.name}: ${err.message}` : String(err);
    }
    await new Promise((r) => setTimeout(r, 800 * (versuch + 1)));
  }
  if (!data) throw new Error(`Stellen lesen: ${letzterFehler}`);

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

          const felder = {
            eval_fit: result.fit,
            eval_confidence: result.confidence,
            eval_summary: result.summary,
            eval_pros: result.pros,
            eval_cons: result.cons,
            evaluated_at: new Date().toISOString(),
          };
          let { error: writeError } = await db
            .from("jobs")
            .update({ ...felder, eval_spur: result.spur })
            .eq("uuid", job.uuid as string);
          // Spalte eval_spur fehlt noch (SQL suchspur.sql nicht ausgeführt): ohne Spur speichern.
          if (writeError && /eval_spur/.test(writeError.message)) {
            ({ error: writeError } = await db.from("jobs").update(felder).eq("uuid", job.uuid as string));
          }

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

/** Ab hier gibt es Suchspur B (Career Upgrade). */
const SPUR_B_START = "2026-10-20T12:00:00Z";
const UPGRADE_TITEL = /senior|lead|head|director|leiter|leitung|transformation/i;
const KI_TITEL = /\bki\b|\bai\b|künstl|genai|llm|agentic|automati|machine learning/i;

const LABEL_TEXT: Record<string, string> = {
  must_apply: "BEWERBEN",
  worth_reading: "ANSCHAUEN",
  ignore: "IGNORIEREN",
};

/**
 * Ivers eigene Urteile als Beispiele für das Modell: Labels (mit Begründung,
 * sofern angegeben), echte Bewerbungen und in der Inbox abgelegte Vorschläge.
 * Wird bei JEDEM Bewertungslauf frisch geladen — neue Labels wirken also ab
 * dem nächsten Lauf, ohne dass etwas neu eingestellt werden muss.
 *
 * Die Stellen, die gerade bewertet werden, sind ausgeschlossen. Sonst würde
 * die Kalibrierung sich selbst abschreiben.
 */
async function ladeBeispiele(db: SupabaseClient, ausschliessen: Set<string>): Promise<string> {
  // Mit Begründungen lesen; fehlen die Spalten noch (SQL nicht ausgeführt), ohne.
  const basis = "uuid,title,employer_name,municipal,sector,label,eval_fit,labeled_at";
  const erster = await db
    .from("jobs")
    .select(`${basis},label_gruende,label_notiz`)
    .not("label", "is", null)
    .order("labeled_at", { ascending: false, nullsFirst: false })
    .limit(600);
  let data: unknown[] | null = erster.data;
  if (erster.error) {
    ({ data } = await db
      .from("jobs")
      .select(basis)
      .not("label", "is", null)
      .order("labeled_at", { ascending: false, nullsFirst: false })
      .limit(600));
  }

  // Ältere "Ignorieren"-Urteile über Senior-/Lead-/Head-Rollen ohne KI stammen aus
  // der Zeit vor Suchspur B — sie würden dem Modell beibringen, genau diese
  // Stellen wegzuwerfen. Ab SPUR_B_START gelten neue Urteile wieder normal.
  const veraltet = (row: Record<string, unknown>) =>
    row.label === "ignore" &&
    String(row.labeled_at ?? "") < SPUR_B_START &&
    UPGRADE_TITEL.test(String(row.title ?? "")) &&
    !KI_TITEL.test(String(row.title ?? ""));

  const rows = ((data ?? []) as Array<Record<string, unknown>>).filter(
    (row) => !ausschliessen.has(row.uuid as string) && row.title && !veraltet(row)
  );
  const hatGrund = (row: Record<string, unknown>) =>
    (Array.isArray(row.label_gruende) && row.label_gruende.length > 0) || Boolean(row.label_notiz);
  // Begründete Beispiele zuerst — sie sagen dem Modell mehr als ein nacktes Urteil.
  const sortiert = [...rows.filter(hatGrund), ...rows.filter((row) => !hatGrund(row))];

  const bewerben = rows.filter((row) => row.label === "must_apply").slice(0, 30);
  const anschauen = sortiert.filter((row) => row.label === "worth_reading").slice(0, 15);
  const ignoriertAberHoch = sortiert
    .filter((row) => row.label === "ignore" && (row.eval_fit === "must_apply" || row.eval_fit === "worth_reading"))
    .slice(0, 30);
  const ignoriertRest = sortiert
    .filter((row) => row.label === "ignore" && !ignoriertAberHoch.includes(row))
    .slice(0, Math.max(0, 40 - ignoriertAberHoch.length));

  const zeile = (row: Record<string, unknown>) => {
    const gruende = Array.isArray(row.label_gruende) ? (row.label_gruende as string[]).map(grundText) : [];
    const notiz = typeof row.label_notiz === "string" && row.label_notiz ? `„${row.label_notiz}“` : "";
    const warum = [...gruende, notiz].filter(Boolean).join("; ");
    return (
      `- [${LABEL_TEXT[row.label as string]}] ${row.title} — ${row.employer_name ?? "?"}, ${row.municipal ?? "Ort?"}` +
      (row.sector ? ` (${row.sector})` : "") +
      (warum ? ` → Grund: ${warum}` : "")
    );
  };

  // Häufigste Gründe über ALLE Labels — das Muster hinter den Einzelfällen.
  const zaehler = new Map<string, number>();
  for (const row of rows) {
    if (!Array.isArray(row.label_gruende)) continue;
    for (const key of row.label_gruende as string[]) {
      const k = `${row.label === "ignore" ? "Ignoriert" : "Nur Anschauen"}: ${grundText(key)}`;
      zaehler.set(k, (zaehler.get(k) ?? 0) + 1);
    }
  }
  const muster = Array.from(zaehler.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12)
    .map(([k, n]) => `- ${k} (${n}×)`);

  // Inbox-Entscheidungen als zusätzliche Signale: wo du dich beworben hast, ist
  // ein stärkeres "Ja" als jedes Label; "Ablegen" einer vorgeschlagenen Stelle
  // ist genau der Fehlalarm, den das Modell lernen soll zu vermeiden.
  const { data: inboxData } = await db
    .from("jobs")
    .select("uuid,title,employer_name,municipal,sector,app_status")
    .in("app_status", ["beworben", "interview", "absage", "abgelegt"])
    .is("label", null)
    .order("app_status_at", { ascending: false, nullsFirst: false })
    .limit(200);
  const inbox = ((inboxData ?? []) as Array<Record<string, unknown>>).filter(
    (row) => !ausschliessen.has(row.uuid as string) && row.title && !String(row.uuid).startsWith("manuell-")
  );
  const inboxZeile = (row: Record<string, unknown>) =>
    `- [${row.app_status === "abgelegt" ? "IGNORIEREN — in der Inbox abgelegt" : "BEWERBEN — hat sich beworben"}] ${row.title} — ${row.employer_name ?? "?"}, ${row.municipal ?? "Ort?"}` +
    (row.sector ? ` (${row.sector})` : "");
  const beworbenZeilen = inbox.filter((row) => row.app_status !== "abgelegt").slice(0, 25).map(inboxZeile);
  const abgelegtZeilen = inbox.filter((row) => row.app_status === "abgelegt").slice(0, 20).map(inboxZeile);

  // Absagegründe, die Firmen genannt haben — nur wenn du welche eingetragen hast.
  const { data: absagen } = await db
    .from("jobs")
    .select("title,employer_name,absage_notiz")
    .eq("app_status", "absage")
    .not("absage_notiz", "is", null)
    .order("app_status_at", { ascending: false, nullsFirst: false })
    .limit(20);
  const absageZeilen = ((absagen ?? []) as Array<Record<string, unknown>>)
    .filter((row) => typeof row.absage_notiz === "string" && (row.absage_notiz as string).trim())
    .map((row) => `- ${row.employer_name ?? "?"} (${row.title ?? "?"}): „${String(row.absage_notiz).trim()}“`);

  const beispiele = [
    ...beworbenZeilen,
    ...bewerben.map(zeile),
    ...anschauen.map(zeile),
    ...abgelegtZeilen,
    ...[...ignoriertAberHoch, ...ignoriertRest].map(zeile),
  ].join("\n");
  const teile: string[] = [];
  if (absageZeilen.length) {
    teile.push(
      `LERNPUNKTE AUS ABSAGEN — Gründe, die Firmen Iver genannt haben. Hat eine neue Stelle dieselbe Hürde (etwa eine geforderte Erfahrung, die ihm fehlt), nenne sie als cons und stufe must_apply im Zweifel auf worth_reading herab. Stellen nicht allein deshalb ignorieren.\n${absageZeilen.join("\n")}`
    );
  }
  if (muster.length) {
    teile.push(`HÄUFIGSTE GRÜNDE FÜR SEINE ABLEHNUNGEN (gewichte diese Punkte entsprechend):\n${muster.join("\n")}`);
  }
  teile.push(teile.length ? `EINZELNE URTEILE:\n${beispiele}` : beispiele);
  return teile.join("\n\n");
}
