import { supabaseAdmin } from "@/lib/supabase";
import ApplicationClient from "./ApplicationClient";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const db = supabaseAdmin();

  const { data: job, error } = await db
    .from("jobs")
    .select(
      "uuid,source,title,title_de,employer_name,municipal,county,country,application_url,application_due,application_draft,eval_summary"
    )
    .eq("uuid", uuid)
    .maybeSingle();

  if (error || !job) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-drop">
          Stelle nicht gefunden{error ? `: ${error.message}` : "."}
        </p>
      </main>
    );
  }

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-muted">Bewerbung</p>
        <h1 className="mt-2 text-xl font-semibold leading-snug">
          {(job.title_de as string) ?? (job.title as string)}
        </h1>
        <p className="mt-1 text-sm text-muted">
          {(job.employer_name as string) ?? "—"} ·{" "}
          {[job.municipal, job.county].filter(Boolean).join(", ") ||
            ((job.country as string) ?? "—")}
          {job.application_due ? ` · Frist ${String(job.application_due).slice(0, 10)}` : ""}
        </p>
        {job.application_url && (
          <p className="mt-3 text-sm">
            <a
              href={job.application_url as string}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-4"
            >
              Ausschreibung öffnen
            </a>
          </p>
        )}
      </header>

      <ApplicationClient
        uuid={job.uuid as string}
        draft={(job.application_draft as any) ?? null}
        defaultLang={job.source === "ba" ? "de" : "en"}
      />
    </main>
  );
}
