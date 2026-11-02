import Link from "next/link";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, ladeProfilVoll } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import LebenslaufClient, { type CvStand } from "./LebenslaufClient";
import type { SuchprofilStand } from "./SuchprofilClient";
import { kriterienAus } from "@/lib/suchprofil";

export const dynamic = "force-dynamic";
export const metadata = { title: "Mein Profil · Career Inbox" };

/**
 * Schritt 2.4 · „Mein Profil“ für weitere Personen: Lebenslauf hochladen,
 * ausgelesene Struktur, vorgeschlagene Richtungen, Prüfbericht.
 * Dein Profil hat diese Seite nicht.
 */
export default async function ProfilSeite() {
  const slug = await profilAusCookies();
  if (istStandard(slug)) {
    return (
      <main className="mx-auto max-w-3xl px-6 py-12">
        <p className="text-sm text-muted">Career Inbox · Mein Profil</p>
        <p className="mt-4 max-w-lg text-sm leading-relaxed">
          Dein Profil nutzt den Lebenslauf von deiner Website — hier ist nichts zu tun.
        </p>
        <Link href="/inbox" className="mt-6 inline-block text-sm underline underline-offset-4">
          Zur Inbox
        </Link>
      </main>
    );
  }

  const db = supabaseAdmin();
  const [profil, id] = await Promise.all([ladeProfilVoll(db, slug), profilId(db, slug)]);
  // Schritt 2.6: Fragebogen-Stand. Ohne eigenen Vorschlag, aber mit Suchprofil aus der Steuerung: das zeigen.
  const einstellungen = await ladeEinstellungen(db, slug).catch(() => ({}) as Record<string, unknown>);
  const gespeichert = (einstellungen.vorschlag as SuchprofilStand["vorschlag"]) ?? null;
  const ausSteuerung =
    !gespeichert && profil && profil.suchbegriffe.length > 0 && profil.profiltext
      ? {
          suchbegriffe: profil.suchbegriffe,
          profiltext: profil.profiltext,
          kriterien: kriterienAus(profil.regeln),
          ort: profil.suchort.ort ?? "",
          umkreis: profil.suchort.umkreis,
        }
      : null;
  const suchprofil: SuchprofilStand = {
    antworten: (einstellungen.fragebogen as SuchprofilStand["antworten"]) ?? null,
    vorschlag: gespeichert ?? ausSteuerung,
    bestaetigt_at: (einstellungen.bestaetigt_at as string) ?? null,
  };

  let stand: CvStand | null = null;
  let hinweis: string | null = null;
  if (id) {
    const { data, error } = await db.from("profile_cv").select("*").eq("profile_id", id).maybeSingle();
    if (error) hinweis = "Noch nicht eingerichtet — supabase/lebenslauf.sql im SQL Editor ausführen.";
    else stand = (data as CvStand | null) ?? null;
  }

  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-muted">Career Inbox · Mein Profil</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">{profil?.name ?? slug}</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Lade deinen Lebenslauf hoch und beantworte ein paar Fragen. Daraus entsteht dein Suchprofil: wonach wir jede Nacht
          suchen und wie wir neue Stellen für dich bewerten. Erfunden wird nichts — was fehlt, fragen wir nach.
        </p>
      </header>
      {hinweis ? <p className="mt-8 text-sm text-drop">{hinweis}</p> : <LebenslaufClient initial={stand} suchprofil={suchprofil} />}
    </main>
  );
}
