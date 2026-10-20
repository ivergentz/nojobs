import { supabaseAdmin } from "@/lib/supabase";
import InboxClient, { type InboxJob } from "./InboxClient";
import { AKTIVE_QUELLEN, QUELLEN_NAME } from "@/lib/quellen";
import { findeFruehere } from "@/lib/firma";
import { besucheJeStelle, type Besuch } from "@/lib/tracking";

export const dynamic = "force-dynamic";

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

/**
 * Liest direkt aus `jobs` statt aus der View v_inbox. Die View filterte auf
 * die alte Sprachbewertung (Skandinavisch) und kannte nur Norwegen/Schweden-
 * Logik — die Bedingungen stehen jetzt sichtbar hier im Code.
 */
export default async function InboxPage() {
  const db = supabaseAdmin();

  const SPALTEN =
    "uuid,source,occupation_level1,title,employer_name,municipal,county,country,sector,eval_fit,eval_confidence,eval_summary,eval_pros,eval_cons,application_due,application_url,salary_min_nok,salary_max_nok,salary_note,app_status,app_status_at,published";

  const [neuQuery, verfolgtQuery, unbewertet] = await Promise.all([
    // Reiter "Neu": aktive, positiv bewertete Stellen ohne Bearbeitung
    db
      .from("jobs")
      .select(SPALTEN)
      .eq("status", "ACTIVE")
      .in("source", AKTIVE_QUELLEN)
      .in("eval_fit", ["must_apply", "worth_reading"])
      .eq("app_status", "neu")
      // "must_apply" sortiert alphabetisch vor "worth_reading".
      .order("eval_fit", { ascending: true })
      .order("published", { ascending: false, nullsFirst: false })
      .limit(150),
    // Alle anderen Reiter: alles, was du angefasst hast — auch wenn die
    // Anzeige inzwischen offline ist. Eine laufende Bewerbung darf nicht
    // verschwinden, nur weil die Firma die Stelle vom Netz nimmt.
    db
      .from("jobs")
      .select(SPALTEN)
      .in("app_status", ["interessant", "beworben", "interview", "absage", "abgelegt"])
      .order("app_status_at", { ascending: false, nullsFirst: false })
      .limit(400),
    db
      .from("jobs")
      .select("uuid", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .in("source", AKTIVE_QUELLEN)
      .is("evaluated_at", null),
  ]);

  // Aufrufe der persönlichen Links. Eigene Abfrage: Fehlt die Tabelle noch
  // (SQL nicht ausgeführt), bleibt die Inbox trotzdem heil.
  const verfolgteIds = (verfolgtQuery.data ?? []).map((row) => row.uuid as string);
  const { data: besucheRoh } = verfolgteIds.length
    ? await db.from("besuche").select("*").in("job_uuid", verfolgteIds).limit(2000)
    : { data: [] };
  const besuche = besucheJeStelle((besucheRoh ?? []) as Besuch[]);

  const inbox = {
    data: [...(neuQuery.data ?? []), ...(verfolgtQuery.data ?? [])],
    error: neuQuery.error ?? verfolgtQuery.error,
  };

  // Alle eigenen Bewerbungen — für die Warnung "bereits bei dieser Firma beworben".
  const bewerbungen = (verfolgtQuery.data ?? []).map((row) => ({
    uuid: row.uuid as string,
    employer_name: (row.employer_name as string) ?? null,
    title: (row.title as string) ?? null,
    app_status: (row.app_status as string) ?? "",
    app_status_at: (row.app_status_at as string) ?? null,
  }));

  const jobs: InboxJob[] = (inbox.data ?? []).map((row) => ({
    uuid: row.uuid as string,
    title: (row.title as string) ?? "Ohne Titel",
    employer: (row.employer_name as string) ?? "—",
    place:
      [row.municipal, row.county].filter(Boolean).join(", ") ||
      ((row.country as string) ?? "—"),
    homeoffice: (row.sector as string) ?? null,
    fit: (row.eval_fit as string) ?? "worth_reading",
    confidence: (row.eval_confidence as string) ?? "medium",
    summary: (row.eval_summary as string) ?? "",
    pros: asList(row.eval_pros),
    cons: asList(row.eval_cons),
    due: (row.application_due as string) ?? null,
    url: (row.application_url as string) ?? null,
    salaryMin: (row.salary_min_nok as number) ?? null,
    salaryMax: (row.salary_max_nok as number) ?? null,
    salaryNote: (row.salary_note as string) ?? null,
    status: (row.app_status as string) ?? "neu",
    published: (row.published as string) ?? null,
    quelle:
      row.source === "google" && row.occupation_level1
        ? `Google Jobs, ${String(row.occupation_level1)}`
        : QUELLEN_NAME[row.source as string] ?? String(row.source),
    besuche: besuche.get(row.uuid as string) ?? null,
    frueher: findeFruehere(
      { uuid: row.uuid as string, employer: (row.employer_name as string) ?? null, title: (row.title as string) ?? null },
      bewerbungen
    ),
  }));

  const neu = jobs.filter((job) => job.status === "neu").length;

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-8">
        <p className="text-sm text-muted">Career Inbox · Hamburg & Remote</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {neu === 1 ? "1 neue Stelle" : `${neu} neue Stellen`}
        </h1>
        {inbox.error && (
          <p className="mt-4 text-sm text-drop">Fehler: {inbox.error.message}</p>
        )}
        {(unbewertet.count ?? 0) > 0 && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            {unbewertet.count} Stellen sind noch nicht bewertet und fehlen hier. Bewertet wird
            jeden Morgen automatisch — oder sofort über die Steuerung.
          </p>
        )}
      </header>

      <InboxClient jobs={jobs} />
    </main>
  );
}
