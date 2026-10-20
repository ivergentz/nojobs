import { supabaseAdmin } from "@/lib/supabase";
import ApplicationClient from "./ApplicationClient";
import FragenClient from "./FragenClient";
import { CV_BASE, loadCv } from "@/lib/cv-source";
import { BEWORBEN_STATUS, findeFruehere, WARN_TAGE } from "@/lib/firma";
import { dauerText, ensureRef, trackingLink, type Besuch } from "@/lib/tracking";
import TrackingLink from "./TrackingLink";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
}: {
  params: Promise<{ uuid: string }>;
}) {
  const { uuid } = await params;
  const db = supabaseAdmin();
  const { quelle } = await loadCv("de");
  const cvQuelle =
    quelle === "ivergentz.de"
      ? `live von ${CV_BASE.replace(/^https?:\/\//, "")}`
      : "Fallback-Kopie im Repo (ivergentz.de/cv.json nicht erreichbar)";

  const { data: job, error } = await db
    .from("jobs")
    .select(
      "uuid,source,title,title_de,employer_name,municipal,county,country,application_url,application_due,application_draft,eval_summary"
    )
    .eq("uuid", uuid)
    .maybeSingle();

  const { data: bewerbungen } = await db
    .from("jobs")
    .select("uuid,employer_name,title,app_status,app_status_at")
    .in("app_status", BEWORBEN_STATUS)
    .gte("app_status_at", new Date(Date.now() - WARN_TAGE * 864e5).toISOString())
    .limit(300);

  if (error || !job) {
    return (
      <main className="mx-auto max-w-2xl px-6 py-16">
        <p className="text-sm text-drop">
          Stelle nicht gefunden{error ? `: ${error.message}` : "."}
        </p>
      </main>
    );
  }

  // Persönlicher Link — erst vergeben, wenn es einen Entwurf gibt. Sonst würde
  // jede nur angesehene Stelle ein Kürzel wie "otto" belegen.
  const ref = job.application_draft ? await ensureRef(db, job.uuid as string) : null;
  const link = ref ? trackingLink(ref) : null;
  const { data: besucheRoh } = ref
    ? await db.from("besuche").select("*").eq("job_uuid", job.uuid).order("created_at", { ascending: false }).limit(50)
    : { data: [] };
  const besuche = ((besucheRoh ?? []) as Besuch[]).filter((b) => !b.bot);
  const zeit = (d: string) =>
    new Date(d).toLocaleString("de-DE", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Berlin" });

  const frueher = findeFruehere(
    { uuid: job.uuid as string, employer: (job.employer_name as string) ?? null, title: (job.title as string) ?? null },
    (bewerbungen ?? []) as any
  );
  const fmt = (d: string | null) =>
    d ? new Date(d).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : "";

  return (
    <main className="mx-auto max-w-2xl px-6 py-12">
      {frueher.length > 0 && (
        <div className="mb-8 rounded border border-drop/40 bg-drop/5 px-4 py-3 text-sm text-drop">
          <p className="font-semibold">
            {frueher.some((f) => f.gleicheStelle)
              ? "⚠️ Auf diese Stelle hast du dich schon beworben"
              : "⚠️ Achtung – bereits eine Bewerbung bei diesem Unternehmen"}
          </p>
          <ul className="mt-1 space-y-0.5">
            {frueher.map((f) => (
              <li key={f.uuid}>
                {f.title} — {f.status === "absage" ? "Absage" : f.status === "interview" ? "Interview" : "beworben"}
                {f.datum ? ` am ${fmt(f.datum)}` : ""}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs">
            Eine zweite Bewerbung kann trotzdem sinnvoll sein — dann im Anschreiben kurz darauf eingehen.
          </p>
        </div>
      )}
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

      <section className="mt-6 rounded border border-rule px-4 py-3 text-sm">
        <p className="text-xs text-muted">Persönlicher Link — steht automatisch in Lebenslauf und Anschreiben</p>
        {link ? (
          <div className="mt-1">
            <TrackingLink href={link.href} text={link.text} />
          </div>
        ) : job.application_draft ? (
          <p className="mt-1 text-drop">
            Kein Link — in Supabase einmal supabase/besuche.sql ausführen.
          </p>
        ) : (
          <p className="mt-1 text-muted">Entsteht mit dem ersten Entwurf.</p>
        )}
        {link && (
          <p className="mt-2 text-muted">
            {besuche.length === 0
              ? "Noch nicht geöffnet."
              : `👀 ${besuche.length}× geöffnet · zuletzt ${zeit(besuche[0].created_at)}`}
          </p>
        )}
        {besuche.length > 0 && (
          <ul className="mt-1 space-y-0.5 text-xs text-muted">
            {besuche.slice(0, 5).map((b) => (
              <li key={b.sitzung}>
                {zeit(b.created_at)} · {b.geraet ?? "?"} · {b.seiten.join(", ")}
                {dauerText(b.sekunden) ? ` · ${dauerText(b.sekunden)}` : ""}
              </li>
            ))}
          </ul>
        )}
      </section>

      <ApplicationClient
        uuid={job.uuid as string}
        draft={(job.application_draft as any) ?? null}
        defaultLang="de"
        cvQuelle={cvQuelle}
      />

      <FragenClient
        uuid={job.uuid as string}
        initial={
          Array.isArray((job.application_draft as any)?.fragen) ? (job.application_draft as any).fragen : []
        }
      />
    </main>
  );
}
