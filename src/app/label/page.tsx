import { supabaseAdmin } from "@/lib/supabase";
import LabelClient, { type LabelJob } from "./LabelClient";
import { AKTIVE_QUELLEN, QUELLEN_NAME } from "@/lib/quellen";
import { lesen } from "@/lib/lesen";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { kandidatenFilter, ladeProfilVoll } from "@/lib/profil";
import { gruendeFuer } from "@/lib/gruende";
import Link from "next/link";
import { EmptyState, Hinweis, PageHeader } from "@/components/ui/Bausteine";

export const dynamic = "force-dynamic";

/**
 * Beschreibungen können HTML enthalten. Wir zeigen sie als reinen Text —
 * fremdes Markup gehört nicht ungeprüft in die Seite.
 */
function toPlainText(html: string | null): string {
  if (!html) return "";
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|h[1-6])>/gi, "\n")
    .replace(/<li[^>]*>/gi, "• ")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export default async function LabelPage() {
  const db = supabaseAdmin();
  // Schritt 2.2: gewähltes Profil. Ohne Auswahl dein Profil — alles wie bisher.
  const profil = await profilAusCookies();
  const leseProfil = istStandard(profil) ? undefined : profil;

  // Vorher auf die norwegischen Berufskategorien "IT" und "Kontor og økonomi"
  // gefiltert — deutsche Stellen tauchten hier deshalb nie auf.
  // Schritt 2.6: Weitere Profile sehen nur Stellen zu ihrem Suchprofil — dieselbe Auswahl wie bei der Bewertung.
  const fremd = leseProfil ? await ladeProfilVoll(db, leseProfil) : null;
  const ohneSuchprofil = Boolean(leseProfil) && (!fremd || fremd.suchbegriffe.length === 0);

  let abfrage = lesen(db, leseProfil)
    .select(
      "uuid,source,title,employer_name,municipal,county,occupation_level1,sector,extent,application_due,application_url,description,published,salary_min_nok,salary_max_nok,salary_note"
    )
    .eq("status", "ACTIVE")
    .in("source", AKTIVE_QUELLEN)
    .is("label", null)
    .not("description", "is", null);
  if (fremd && fremd.suchbegriffe.length > 0) abfrage = abfrage.or(kandidatenFilter(fremd.suchbegriffe, fremd.slug));
  const { data, error } = ohneSuchprofil
    ? { data: [] as Record<string, unknown>[], error: null }
    : await abfrage.order("published", { ascending: false, nullsFirst: false }).limit(120);

  const { count: doneCount } = await lesen(db, leseProfil)
    .select("uuid", { count: "exact", head: true })
    .in("source", AKTIVE_QUELLEN)
    .not("label", "is", null);

  const jobs: LabelJob[] = (data ?? []).map((row) => ({
    uuid: row.uuid as string,
    title: (row.title as string) ?? "Ohne Titel",
    employer: (row.employer_name as string) ?? "—",
    place: [row.municipal, row.county].filter(Boolean).join(", ") || "—",
    category: [QUELLEN_NAME[row.source as string] ?? row.source, row.occupation_level1]
      .filter(Boolean)
      .join(" · "),
    homeoffice: (row.sector as string) ?? null,
    extent: (row.extent as string) ?? null,
    due: (row.application_due as string) ?? null,
    url: (row.application_url as string) ?? null,
    description: toPlainText(row.description as string | null),
    salaryMin: (row.salary_min_nok as number) ?? null,
    salaryMax: (row.salary_max_nok as number) ?? null,
    salaryNote: leseProfil && row.salary_note === "KEINE_ANGABEN" ? null : ((row.salary_note as string) ?? null),
  }));

  return (
    <main className="page max-w-2xl">
      <PageHeader
        eyebrow="Stellen beurteilen"
        titel="Würdest du dich hierauf bewerben?"
        lead="Kein KI-Vorschlag, absichtlich. Erst dein Urteil, dann das Prompt — sonst richtet sich deine Messlatte nach dem Modell statt umgekehrt. Zügig entscheiden, Bauchgefühl reicht."
      />

      {error && (
        <div className="mb-6">
          <Hinweis ton="error" titel="Stellen konnten nicht geladen werden">
            {error.message}
          </Hinweis>
        </div>
      )}

      {ohneSuchprofil ? (
        <EmptyState icon="user" titel="Noch kein Suchprofil">
          Für dieses Profil gibt es noch kein Suchprofil — darum auch keine Stellen zum Beurteilen.{" "}
          <Link href="/profil" className="link">
            Unter „Mein Profil“ den Fragebogen ausfüllen
          </Link>
          .
        </EmptyState>
      ) : leseProfil ? (
        <LabelClient
          jobs={jobs}
          alreadyDone={doneCount ?? 0}
          gruendeIgnore={gruendeFuer(leseProfil).ignore}
          gruendeAnschauen={gruendeFuer(leseProfil).anschauen}
        />
      ) : (
        <LabelClient jobs={jobs} alreadyDone={doneCount ?? 0} />
      )}
    </main>
  );
}
