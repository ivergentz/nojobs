import { sitzungAusCookies } from "@/lib/sitzung";
import Link from "next/link";
import { EmptyState, Hinweis, PageHeader } from "@/components/ui/Bausteine";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusCookies } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, ladeProfilVoll } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import LebenslaufClient, { type CvStand } from "./LebenslaufClient";
import type { SuchprofilStand } from "./SuchprofilClient";
import TelegramClient from "./TelegramClient";
import Avatar from "@/components/ui/Avatar";
import { fotoAus, fotoUrl } from "@/lib/foto";
import { verbindungAus } from "@/lib/telegram-profil";
import { kriterienAus } from "@/lib/suchprofil";
import { layoutWahlAus } from "@/lib/unterlagen";
import { einwilligungAus } from "@/lib/einwilligung";

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
      <main className="page">
        <EmptyState icon="user" titel="Mein Profil">
          <p>Dein Profil nutzt den Lebenslauf von deiner Website — hier ist nichts zu tun.</p>
          <Link href="/inbox" className="btn-secondary mt-4">
            Zu meinen Jobs
          </Link>
        </EmptyState>
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
  const telegram = verbindungAus(einstellungen);
  const suchprofil: SuchprofilStand = {
    antworten: (einstellungen.fragebogen as SuchprofilStand["antworten"]) ?? null,
    vorschlag: gespeichert ?? ausSteuerung,
    bestaetigt_at: (einstellungen.bestaetigt_at as string) ?? null,
  };

  let stand: CvStand | null = null;
  let hinweis: string | null = null;
  if (id) {
    const { data, error } = await db.from("profile_cv").select("*").eq("profile_id", id).maybeSingle();
    // Technischer Hinweis nur für dich (Admin); weitere Personen bekommen eine verständliche Meldung.
    if (error) hinweis = (await sitzungAusCookies())?.r === "nutzer" ? "Dieser Bereich ist gerade nicht verfügbar. Bitte später noch einmal versuchen — bleibt es so, kurz Bescheid geben." : "Noch nicht eingerichtet — supabase/lebenslauf.sql im SQL Editor ausführen.";
    else stand = (data as CvStand | null) ?? null;
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Mein Profil"
        titel={
          <span className="flex items-center gap-3">
            <Avatar name={profil?.name ?? slug} src={fotoUrl(slug, fotoAus(einstellungen))} groesse={44} />
            {profil?.name ?? slug}
          </span>
        }
        lead="Hier sagst du nojobs, wer du bist und welche beruflichen Möglichkeiten du suchst: Lebenslauf hochladen, ein paar Fragen beantworten — daraus entsteht dein Suchprofil. Erfunden wird nichts; was fehlt, fragen wir nach."
      />
      {hinweis ? (
        <Hinweis ton="error">{hinweis}</Hinweis>
      ) : (
        <>
          <LebenslaufClient
            initial={stand}
            suchprofil={suchprofil}
            unterlagen={(() => {
              const w = layoutWahlAus(einstellungen);
              return { initial: { layout: w.layout, akzent: w.akzentId, mitFoto: w.o.mitFoto }, hatFoto: Boolean(fotoAus(einstellungen)) };
            })()}
            telegramVerbunden={Boolean(telegram)}
            einwilligung={einwilligungAus(einstellungen)}
            telegram={
              // Phase 3: Telegram — erst sinnvoll, wenn ein Suchprofil steht
              suchprofil.bestaetigt_at || profil?.suchbegriffe.length ? (
                <TelegramClient
                  initial={{
                    verbunden: Boolean(telegram),
                    name: telegram?.name ?? null,
                    seit: telegram?.verbunden_at ?? null,
                  }}
                />
              ) : null
            }
          />
        </>
      )}
    </main>
  );
}
