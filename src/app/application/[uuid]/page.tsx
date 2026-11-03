import { supabaseAdmin } from "@/lib/supabase";
import ApplicationClient from "./ApplicationClient";
import FragenClient from "./FragenClient";
import { CV_BASE, loadCv } from "@/lib/cv-source";
import { BEWORBEN_STATUS, findeFruehere, WARN_TAGE } from "@/lib/firma";
import { dauerText, ensureRef, trackingLink, type Besuch } from "@/lib/tracking";
import TrackingLink from "./TrackingLink";
import BeworbenKnopf from "./BeworbenKnopf";
import VorbereitungClient from "./VorbereitungClient";
import type { Vorbereitung } from "@/lib/vorbereitung";
import { lesen } from "@/lib/lesen";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ProfilUnterlagen } from "./ProfilUnterlagen";
import Link from "next/link";
import Icon from "@/components/ui/Icon";
import { Hinweis } from "@/components/ui/Bausteine";

export const dynamic = "force-dynamic";

export default async function ApplicationPage({
  params,
  searchParams,
}: {
  params: Promise<{ uuid: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { uuid } = await params;
  // Aus welchem Reiter der Inbox kam man? (für „Beworben“ → zurück dorthin)
  const vonRoh = (await searchParams).von;
  const von = typeof vonRoh === "string" && /^[a-z]{2,20}$/.test(vonRoh) ? vonRoh : null;
  const schonBeworben = von !== null && ["beworben", "interview", "absage"].includes(von);

  // Phase 4.3: weitere Profile — Unterlagen aus dem eigenen Lebenslauf. Dein Profil unten wie bisher.
  const profil = await profilAusCookies();
  if (!istStandard(profil)) return <ProfilUnterlagen profil={profil} uuid={uuid} von={von} schonBeworben={schonBeworben} />;

  const db = supabaseAdmin();
  const { quelle } = await loadCv("de");
  const cvQuelle =
    quelle === "ivergentz.de"
      ? `live von ${CV_BASE.replace(/^https?:\/\//, "")}`
      : "Fallback-Kopie im Repo (ivergentz.de/cv.json nicht erreichbar)";

  const { data: job, error } = await lesen(db)
    .select(
      "uuid,source,title,title_de,employer_name,municipal,county,country,application_url,application_due,application_draft,eval_summary"
    )
    .eq("uuid", uuid)
    .maybeSingle();

  const { data: bewerbungen } = await lesen(db)
    .select("uuid,employer_name,title,app_status,app_status_at")
    .in("app_status", BEWORBEN_STATUS)
    .gte("app_status_at", new Date(Date.now() - WARN_TAGE * 864e5).toISOString())
    .limit(300);

  // Gesprächsvorbereitung separat lesen — fehlt die Spalte noch (vorbereitung.sql), bleibt die Seite heil.
  const { data: vorb } = job
    ? await lesen(db).select("vorbereitung").eq("uuid", job.uuid).maybeSingle()
    : { data: null };
  const vorbereitung = ((vorb as { vorbereitung?: Vorbereitung | null } | null)?.vorbereitung ?? null) as Vorbereitung | null;

  if (error || !job) {
    return (
      <main className="page">
        <Hinweis ton="error" titel="Stelle nicht gefunden">
          {error ? error.message : "Die Stelle gibt es nicht (mehr)."}
        </Hinweis>
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
    <main className="page">
      <Link href={von === "interessant" ? "/inbox#interessant" : "/inbox"} className="link-quiet inline-flex items-center gap-1 text-sm no-underline">
        <Icon name="chevronRight" size={14} className="rotate-180" /> Meine Jobs
      </Link>

      <header className="mt-4">
        <p className="eyebrow">Bewerbung</p>
        <h1 className="page-title mt-1.5">{(job.title_de as string) ?? (job.title as string)}</h1>
        <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm text-muted">
          <span className="font-medium text-ink/80">{(job.employer_name as string) ?? "—"}</span>
          <span className="inline-flex items-center gap-1.5">
            <Icon name="mapPin" size={14} />
            {[job.municipal, job.county].filter(Boolean).join(", ") || ((job.country as string) ?? "—")}
          </span>
          {job.application_due ? (
            <span className="inline-flex items-center gap-1.5">
              <Icon name="calendar" size={14} /> Frist {String(job.application_due).slice(0, 10)}
            </span>
          ) : null}
        </div>
        <div className="mt-4 flex flex-wrap items-start gap-2">
          {job.application_url && (
            <a href={job.application_url as string} target="_blank" rel="noopener noreferrer" className="btn-secondary">
              Ausschreibung öffnen <Icon name="external" size={14} />
            </a>
          )}
          {!schonBeworben && <BeworbenKnopf uuid={job.uuid as string} von={von} />}
        </div>
        {!schonBeworben && (
          <p className="mt-2 text-xs text-muted">
            Bewerbung abgeschickt? „Beworben“ legt die Stelle unter Beworben ab und bringt dich zurück zur Liste.
          </p>
        )}
      </header>

      {frueher.length > 0 && (
        <div className="mt-6">
          <Hinweis
            ton="warn"
            titel={frueher.some((f) => f.gleicheStelle) ? "Auf diese Stelle hast du dich schon beworben" : "Achtung – bereits eine Bewerbung bei diesem Unternehmen"}
          >
            <ul className="space-y-0.5 text-muted">
              {frueher.map((f) => (
                <li key={f.uuid}>
                  {f.title} — {f.status === "absage" ? "Absage" : f.status === "interview" ? "Interview" : "beworben"}
                  {f.datum ? ` am ${fmt(f.datum)}` : ""}
                </li>
              ))}
            </ul>
            <p className="mt-1.5 text-xs text-muted">Eine zweite Bewerbung kann trotzdem sinnvoll sein — dann im Anschreiben kurz darauf eingehen.</p>
          </Hinweis>
        </div>
      )}

      <section className="card-pad mt-6">
        <div className="flex items-start gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand-soft text-brand">
            <Icon name="activity" size={16} />
          </span>
          <div className="min-w-0 text-sm">
            <p className="font-medium">Persönlicher Link</p>
            <p className="text-xs text-muted">Steht automatisch in Lebenslauf und Anschreiben — so siehst du, ob die Bewerbung geöffnet wird.</p>
            {link ? (
              <div className="mt-2">
                <TrackingLink href={link.href} text={link.text} />
              </div>
            ) : job.application_draft ? (
              <p className="mt-2 text-drop">Kein Link — in Supabase einmal supabase/besuche.sql ausführen.</p>
            ) : (
              <p className="mt-2 text-muted">Entsteht mit dem ersten Entwurf.</p>
            )}
            {link && (
              <p className={`mt-2 inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs ${besuche.length ? "bg-keep-soft font-medium text-keep" : "bg-subtle text-muted"}`}>
                <Icon name="eye" size={13} />
                {besuche.length === 0 ? "Noch nicht geöffnet." : `${besuche.length}× geöffnet · zuletzt ${zeit(besuche[0].created_at)}`}
              </p>
            )}
            {besuche.length > 0 && (
              <ul className="mt-2 space-y-0.5 text-xs text-muted">
                {besuche.slice(0, 5).map((b) => (
                  <li key={b.sitzung} className="tnum">
                    {zeit(b.created_at)} · {b.geraet ?? "?"} · {b.seiten.join(", ")}
                    {dauerText(b.sekunden) ? ` · ${dauerText(b.sekunden)}` : ""}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
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

      <VorbereitungClient uuid={job.uuid as string} initial={vorbereitung} />
    </main>
  );
}
