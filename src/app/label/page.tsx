import { supabaseAdmin } from "@/lib/supabase";
import LabelClient, { type LabelJob } from "./LabelClient";

export const dynamic = "force-dynamic";

/**
 * NAV liefert die Beschreibung als HTML. Wir zeigen sie als reinen Text —
 * fremdes Markup gehört nicht ungeprüft in die Seite, und zum Beurteilen
 * reicht der Fließtext.
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

  // IT zuerst — dort sitzen die echten Positivbeispiele. Danach die
  // Bürokategorie als Quelle für harte Negativbeispiele.
  const { data, error } = await db
    .from("jobs")
    .select(
      "uuid,title,employer_name,municipal,county,occupation_level1,occupation_level2,extent,application_due,application_url,description,published,label"
    )
    .eq("status", "ACTIVE")
    .is("label", null)
    .in("occupation_level1", ["IT", "Kontor og økonomi"])
    .order("occupation_level1", { ascending: true })
    .order("published", { ascending: false })
    .limit(120);

  const { count: doneCount } = await db
    .from("jobs")
    .select("uuid", { count: "exact", head: true })
    .not("label", "is", null);

  const jobs: LabelJob[] = (data ?? []).map((row) => ({
    uuid: row.uuid as string,
    title: (row.title as string) ?? "Ohne Titel",
    employer: (row.employer_name as string) ?? "—",
    place: [row.municipal, row.county].filter(Boolean).join(", ") || "—",
    category: [row.occupation_level1, row.occupation_level2].filter(Boolean).join(" · ") || "—",
    extent: (row.extent as string) ?? null,
    due: (row.application_due as string) ?? null,
    url: (row.application_url as string) ?? null,
    description: toPlainText(row.description as string | null),
  }));

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-muted">Career Inbox · Kalibrierung</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">
          Würdest du dich hierauf bewerben?
        </h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Kein KI-Vorschlag, absichtlich. Erst dein Urteil, dann das Prompt — sonst richtet sich
          deine Messlatte nach dem Modell statt umgekehrt. Zügig entscheiden, Bauchgefühl reicht.
        </p>
      </header>

      {error && (
        <p className="mt-8 text-sm text-drop">
          Stellen konnten nicht geladen werden: {error.message}
        </p>
      )}

      <LabelClient jobs={jobs} alreadyDone={doneCount ?? 0} />
    </main>
  );
}
