import { supabaseAdmin } from "@/lib/supabase";
import { fetchNokToEur } from "@/lib/translate";
import InboxClient, { type InboxJob } from "./InboxClient";

export const dynamic = "force-dynamic";

const asList = (value: unknown): string[] =>
  Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

export default async function InboxPage() {
  const db = supabaseAdmin();

  const [inbox, blocked, fx] = await Promise.all([
    db.from("v_inbox").select("*").limit(120),
    db.from("v_language_blocked").select("uuid", { count: "exact", head: true }),
    fetchNokToEur(),
  ]);

  const jobs: InboxJob[] = (inbox.data ?? []).map((row) => ({
    uuid: row.uuid as string,
    source: (row.source as string) ?? "nav",
    title: (row.title_de as string) ?? (row.title as string) ?? "Ohne Titel",
    originalTitle: (row.title as string) ?? null,
    employer: (row.employer_name as string) ?? "—",
    place:
      [row.municipal, row.county].filter(Boolean).join(", ") ||
      ((row.country as string) ?? "—"),
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
  }));

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-8">
        <p className="text-sm text-muted">Career Inbox</p>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          {jobs.filter((job) => job.status === "neu").length} neue Stellen
        </h1>
        {inbox.error && (
          <p className="mt-4 text-sm text-drop">Fehler: {inbox.error.message}</p>
        )}
        {(blocked.count ?? 0) > 0 && (
          <p className="mt-4 max-w-xl text-sm leading-relaxed text-muted">
            Dazu {blocked.count} Stellen, die inhaltlich passen, aber Skandinavisch verlangen. Die
            liegen im Wartebereich und tauchen hier nicht auf.
          </p>
        )}
      </header>

      <InboxClient jobs={jobs} fx={fx} />
    </main>
  );
}
