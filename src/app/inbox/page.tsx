import { supabaseAdmin } from "@/lib/supabase";
import InboxClient, { type InboxJob } from "./InboxClient";
import { AKTIVE_QUELLEN, QUELLEN_NAME } from "@/lib/quellen";
import { findeFruehere } from "@/lib/firma";
import { besucheJeStelle, type Besuch } from "@/lib/tracking";
import { lesen } from "@/lib/lesen";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ladeProfilVoll } from "@/lib/profil";
import { GRUENDE_ABLAGE_PASST, gruendeFuer } from "@/lib/gruende";
import { Hinweis, PageHeader } from "@/components/ui/Bausteine";

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
  // Schritt 2.2: gewähltes Profil. Ohne Auswahl dein Profil — alles wie bisher.
  const profil = await profilAusCookies();
  const eigenes = istStandard(profil);

  const SPALTEN =
    "uuid,source,occupation_level1,title,employer_name,municipal,county,country,sector,eval_fit,eval_confidence,eval_summary,eval_pros,eval_cons,application_due,application_url,salary_min_nok,salary_max_nok,salary_note,app_status,app_status_at,published";

  const laden = (spalten: string) => Promise.all([
    // Reiter "Neu": aktive, positiv bewertete Stellen ohne Bearbeitung
    lesen(db, eigenes ? undefined : profil)
      .select(spalten)
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
    lesen(db, eigenes ? undefined : profil)
      .select(spalten)
      .in("app_status", ["interessant", "beworben", "interview", "absage", "abgelegt"])
      .order("app_status_at", { ascending: false, nullsFirst: false })
      .limit(400),
    lesen(db, eigenes ? undefined : profil)
      .select("uuid", { count: "exact", head: true })
      .eq("status", "ACTIVE")
      .in("source", AKTIVE_QUELLEN)
      .is("evaluated_at", null),
  ]);

  // Mit Suchspur laden; fehlt die Spalte noch (suchspur.sql), ohne.
  // Neuere Spalten (Suchspur, Absagegrund) nur, wenn ihre SQL-Skripte gelaufen sind.
  let [neuQuery, verfolgtQuery, unbewertet] = await laden(`${SPALTEN},eval_spur,absage_notiz`);
  if (neuQuery.error || verfolgtQuery.error) [neuQuery, verfolgtQuery, unbewertet] = await laden(`${SPALTEN},eval_spur`);
  if (neuQuery.error || verfolgtQuery.error) [neuQuery, verfolgtQuery, unbewertet] = await laden(SPALTEN);

  // Aufrufe der persönlichen Links. Eigene Abfrage: Fehlt die Tabelle noch
  // (SQL nicht ausgeführt), bleibt die Inbox trotzdem heil.
  const verfolgteIds = ((verfolgtQuery.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => row.uuid as string);
  const { data: besucheRoh } = verfolgteIds.length
    ? await db.from("besuche").select("*").in("job_uuid", verfolgteIds).limit(2000)
    : { data: [] };
  const besuche = besucheJeStelle((besucheRoh ?? []) as Besuch[]);

  const inbox = {
    data: [...(neuQuery.data ?? []), ...(verfolgtQuery.data ?? [])] as unknown as Array<Record<string, unknown>>,
    error: neuQuery.error ?? verfolgtQuery.error,
  };

  // Alle eigenen Bewerbungen — für die Warnung "bereits bei dieser Firma beworben".
  const bewerbungen = ((verfolgtQuery.data ?? []) as unknown as Array<Record<string, unknown>>).map((row) => ({
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
    // Weitere Profile: Platzhalter der Arbeitsagentur nicht als Gehalt zeigen. Deine Ansicht bleibt wie sie ist.
    salaryNote: !eigenes && row.salary_note === "KEINE_ANGABEN" ? null : ((row.salary_note as string) ?? null),
    status: (row.app_status as string) ?? "neu",
    published: (row.published as string) ?? null,
    quelle:
      row.source === "google" && row.occupation_level1
        ? `Google Jobs, ${String(row.occupation_level1)}`
        : QUELLEN_NAME[row.source as string] ?? String(row.source),
    besuche: besuche.get(row.uuid as string) ?? null,
    spur: (row.eval_spur as string) ?? null,
    absageNotiz: (row.absage_notiz as string) ?? null,
    frueher: findeFruehere(
      { uuid: row.uuid as string, employer: (row.employer_name as string) ?? null, title: (row.title as string) ?? null },
      bewerbungen
    ),
  }));

  const neu = jobs.filter((job) => job.status === "neu").length;
  // Kopfzeile: dein Text wie bisher; weitere Profile sehen ihren eigenen Suchort.
  const fremdesProfil = eigenes ? null : await ladeProfilVoll(db, profil);
  const kopf = fremdesProfil?.suchort.ort ? `${fremdesProfil.suchort.ort} · ${fremdesProfil.suchort.umkreis} km Umkreis` : eigenes ? "Hamburg & Remote" : "Inbox";

  const empfohlen = jobs.filter((job) => job.status === "neu" && job.fit === "must_apply").length;

  // Weitere Profile: Stand der Suche aus vorhandenen Daten (letzte Bewertung). Dein Profil: unverändert.
  let zuletzt: string | null = null;
  if (!eigenes) {
    const { data: letzte } = await lesen(db, profil)
      .select("evaluated_at")
      .not("evaluated_at", "is", null)
      .order("evaluated_at", { ascending: false })
      .limit(1);
    zuletzt = ((letzte ?? []) as Array<{ evaluated_at?: string | null }>)[0]?.evaluated_at ?? null;
  }
  const suchprofilDa = Boolean(fremdesProfil && fremdesProfil.suchbegriffe.length > 0);
  const wann = (iso: string) =>
    new Date(iso).toLocaleString("de-DE", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Berlin" });

  return (
    <main className="page">
      <PageHeader
        eyebrow={`Meine Jobs · ${kopf}`}
        titel={neu === 1 ? "1 neue Stelle" : `${neu} neue Stellen`}
        lead={
          neu > 0
            ? empfohlen > 0
              ? `${empfohlen === 1 ? "Eine passt" : `${empfohlen} passen`} besonders gut zu deinen Zielen — sie stehen oben. Der Rest ist einen zweiten Blick wert.`
              : "Gefunden und vorsortiert — jede Stelle mit einer kurzen Einschätzung, was passt und was nicht."
            : "Hier landen jeden Morgen die Stellen, die zu deinen Zielen passen."
        }
      >
        {inbox.error && (
          <div className="mt-4">
            <Hinweis ton="error" titel="Stellen konnten nicht geladen werden">
              {eigenes ? inbox.error.message : "Bitte die Seite in ein paar Minuten neu laden. Bleibt der Fehler, kurz Bescheid geben."}
            </Hinweis>
          </div>
        )}
        {!eigenes && suchprofilDa && (
          <p className="mt-3 inline-flex flex-wrap items-center gap-x-2 gap-y-1 rounded-full bg-subtle px-3 py-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5 font-medium text-keep">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-keep" /> Suche aktiv
            </span>
            <span>· sucht jede Nacht, bewertet morgens</span>
            {zuletzt && <span>· zuletzt aktualisiert am {wann(zuletzt)} Uhr</span>}
          </p>
        )}
        {eigenes && (unbewertet.count ?? 0) > 0 && (
          <div className="mt-4">
            <Hinweis ton="info">
              {unbewertet.count} Stellen sind noch nicht bewertet und fehlen hier. Bewertet wird jeden Morgen automatisch — oder sofort über
              die Steuerung.
            </Hinweis>
          </div>
        )}
      </PageHeader>

      <InboxClient
        jobs={jobs}
        mitUnterlagen
        suchHinweis={!eigenes}
        lage={eigenes ? undefined : { suchprofil: suchprofilDa, zuletzt }}
        ablageGruende={{ passtNicht: gruendeFuer(profil).ignore, passtAber: GRUENDE_ABLAGE_PASST }} />
    </main>
  );
}
