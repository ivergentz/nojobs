import { sitzungAusCookies } from "@/lib/sitzung";
import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, ladeProfilVoll } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import { fotoAus, fotoUrl } from "@/lib/foto";
import { EmptyState, Hinweis, PageHeader } from "@/components/ui/Bausteine";
import Icon from "@/components/ui/Icon";
import FotoClient from "./FotoClient";
import LebenslaufEditor, { type CvDaten, type Pruefpunkt } from "./LebenslaufEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Lebenslauf bearbeiten · nojobs" };

/** Schritt 2.5 · Ausgelesenen Lebenslauf korrigieren, Prüfpunkte abhaken, Foto hochladen. */
export default async function LebenslaufBearbeiten() {
  const slug = await profilAusCookies();
  if (istStandard(slug)) {
    return (
      <main className="page">
        <EmptyState icon="user" titel="Lebenslauf bearbeiten">
          <p>Dein Profil nutzt den Lebenslauf von deiner Website — hier ist nichts zu tun.</p>
          <Link href="/inbox" className="btn-secondary mt-4">
            Zu meinen Jobs
          </Link>
        </EmptyState>
      </main>
    );
  }

  const db = supabaseAdmin();
  const [profil, id, einstellungen] = await Promise.all([
    ladeProfilVoll(db, slug),
    profilId(db, slug),
    ladeEinstellungen(db, slug).catch(() => ({}) as Record<string, unknown>),
  ]);
  let cv: CvDaten | null = null;
  let pruefung: Pruefpunkt[] = [];
  let hinweis: string | null = null;
  if (id) {
    const { data, error } = await db.from("profile_cv").select("status,lebenslauf,pruefung").eq("profile_id", id).maybeSingle();
    // Technischer Hinweis nur für dich (Admin); weitere Personen bekommen eine verständliche Meldung.
    if (error) hinweis = (await sitzungAusCookies())?.r === "nutzer" ? "Dieser Bereich ist gerade nicht verfügbar. Bitte später noch einmal versuchen — bleibt es so, kurz Bescheid geben." : "Noch nicht eingerichtet — supabase/lebenslauf.sql im SQL Editor ausführen.";
    else if (data?.status === "ausgelesen" && data.lebenslauf) {
      const l = data.lebenslauf as Partial<CvDaten>;
      cv = {
        person: {
          name: l.person?.name ?? "",
          ort: l.person?.ort ?? "",
          titel: l.person?.titel ?? "",
          email: l.person?.email ?? "",
          telefon: l.person?.telefon ?? "",
          linkedin: l.person?.linkedin ?? "",
          xing: l.person?.xing ?? "",
        },
        kurzprofil: l.kurzprofil ?? "",
        stationen: l.stationen ?? [],
        ausbildung: l.ausbildung ?? [],
        kenntnisse: l.kenntnisse ?? [],
        sprachen: l.sprachen ?? [],
        bearbeitet_at: l.bearbeitet_at ?? null,
      };
      pruefung = Array.isArray(data.pruefung) ? (data.pruefung as Pruefpunkt[]) : [];
    }
  }

  return (
    <main className="page">
      {/* bewusst <a>: so fragt der Browser bei ungespeicherten Änderungen nach */}
      <a href="/profil#lebenslauf" className="link-quiet inline-flex items-center gap-1 text-sm no-underline">
        <Icon name="chevronRight" size={14} className="rotate-180" /> Zurück zu Mein Profil
      </a>
      <PageHeader
        eyebrow={profil?.name ?? slug}
        titel="Lebenslauf bearbeiten"
        lead="Korrigiere, was beim Auslesen nicht stimmt, und ergänze, was der Prüfbericht vorschlägt. Diese Fassung nutzen wir für dein Suchprofil — und später für deine Unterlagen."
      />
      <div className="space-y-6">
        {/* Mit Lebenslauf: Foto als eigener Reiter im Editor, sonst wie bisher allein */}
        {!cv && <FotoClient slug={slug} initialUrl={fotoUrl(slug, fotoAus(einstellungen))} />}
        {hinweis ? (
          <Hinweis ton="error">{hinweis}</Hinweis>
        ) : cv ? (
          <>
            {cv.bearbeitet_at && (
              <Hinweis ton="info">
                Zuletzt bearbeitet am {new Date(cv.bearbeitet_at).toLocaleDateString("de-DE")}. Ein neuer Upload unter „Mein Profil“ ersetzt diese Fassung.
              </Hinweis>
            )}
            <LebenslaufEditor initial={cv} pruefung={pruefung} foto={<FotoClient slug={slug} initialUrl={fotoUrl(slug, fotoAus(einstellungen))} />} />
          </>
        ) : (
          <EmptyState icon="file" titel="Noch kein Lebenslauf ausgelesen">
            <p>Lade zuerst deinen Lebenslauf unter „Mein Profil“ hoch.</p>
            <Link href="/profil" className="btn-secondary mt-4">
              Zu Mein Profil
            </Link>
          </EmptyState>
        )}
      </div>
    </main>
  );
}
