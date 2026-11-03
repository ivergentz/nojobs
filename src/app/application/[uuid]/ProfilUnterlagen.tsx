import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { lesen } from "@/lib/lesen";
import { ladeEinstellungen } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import { layoutWahlAus } from "@/lib/unterlagen";
import type { ProfilEntwurf } from "@/lib/unterlagen-entwurf";
import type { Vorbereitung } from "@/lib/vorbereitung";
import Icon from "@/components/ui/Icon";
import { EmptyState, Hinweis } from "@/components/ui/Bausteine";
import BeworbenKnopf from "./BeworbenKnopf";
import ProfilUnterlagenClient from "./ProfilUnterlagenClient";
import VorbereitungClient from "./VorbereitungClient";
import BewerbungsAblauf from "./BewerbungsAblauf";

/** Phase 4.3 · Unterlagen-Seite für weitere Profile (eigene Daten aus jobs_profil / profile_cv). */
export async function ProfilUnterlagen({ profil, uuid, von, schonBeworben }: { profil: string; uuid: string; von: string | null; schonBeworben: boolean }) {
  const db = supabaseAdmin();
  const [{ data: job, error }, id, einstellungen] = await Promise.all([
    lesen(db, profil)
      .select("uuid,title,employer_name,municipal,county,country,application_url,application_due,application_draft,vorbereitung,app_status")
      .eq("uuid", uuid)
      .maybeSingle(),
    profilId(db, profil),
    ladeEinstellungen(db, profil).catch(() => ({}) as Record<string, unknown>),
  ]);
  const zurueck = (
    <Link href={von === "interessant" ? "/inbox#interessant" : "/inbox"} className="link-quiet inline-flex items-center gap-1 text-sm no-underline">
      <Icon name="chevronRight" size={14} className="rotate-180" /> Meine Jobs
    </Link>
  );
  if (error || !job) {
    return (
      <main className="page">
        {zurueck}
        <div className="mt-4">
          <Hinweis ton="error" titel="Stelle nicht gefunden">
            {error ? error.message : "Die Stelle gibt es nicht (mehr)."}
          </Hinweis>
        </div>
      </main>
    );
  }
  const { data: cvZeile } = id ? await db.from("profile_cv").select("status,lebenslauf").eq("profile_id", id).maybeSingle() : { data: null };
  const lebenslauf = cvZeile?.status === "ausgelesen" ? (cvZeile.lebenslauf as { stationen?: Array<{ titel: string; arbeitgeber: string; stichpunkte: string[] }> }) : null;
  const entwurf = (job.application_draft as ProfilEntwurf | null)?.art === "profil" ? (job.application_draft as ProfilEntwurf) : null;
  const status = job.app_status as string;
  const beworben = schonBeworben || ["beworben", "interview", "absage"].includes(status);

  return (
    <main className="page">
      {zurueck}
      <header className="mt-4">
        <p className="eyebrow">Bewerbung</p>
        <h1 className="page-title mt-1.5">{job.title as string}</h1>
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
          {!beworben && <BeworbenKnopf uuid={job.uuid as string} von={von} />}
        </div>
        {!beworben && (
          <p className="mt-2 text-xs text-muted">Bewerbung abgeschickt? „Beworben“ legt die Stelle unter Beworben ab und bringt dich zurück zur Liste.</p>
        )}
      </header>

      {lebenslauf ? (
        <>
          <BewerbungsAblauf entwurf={Boolean(entwurf)} beworben={beworben} />
          <ProfilUnterlagenClient
            uuid={job.uuid as string}
            initial={entwurf}
            standardLayout={layoutWahlAus(einstellungen).layout}
            stationen={(lebenslauf.stationen ?? []).map((s) => ({ titel: s.titel, arbeitgeber: s.arbeitgeber, stichpunkte: s.stichpunkte ?? [] }))}
          />
          <VorbereitungClient uuid={job.uuid as string} initial={(job.vorbereitung as Vorbereitung | null) ?? null} />
        </>
      ) : (
        <div className="mt-6">
          <EmptyState icon="file" titel="Erst deinen Lebenslauf hochladen">
            <p>Anschreiben und Lebenslauf entstehen aus deinem eigenen Lebenslauf.</p>
            <Link href="/profil#lebenslauf" className="btn-primary mt-4">
              Zu Mein Profil
            </Link>
          </EmptyState>
        </div>
      )}
    </main>
  );
}
