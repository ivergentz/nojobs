import type { SupabaseClient } from "@supabase/supabase-js";
import { logFehler } from "./fehlerlog";
import { runEvaluation } from "./run-evaluate";
import { ladeEinstellungen, ladeProfile } from "./profil";
import { morgennachrichtFuer, sendeAn, verbindungAus } from "./telegram-profil";
import { entscheide, ladeAktivitaeten, markiereGemeldet, pausenText, starteUhr } from "./aktivitaet";
import { linkMail, mailEingerichtet, sendeMail } from "./mail";
import { neuerLink } from "./sitzung";

/**
 * Morgenlauf für weitere Profile — läuft nach deiner Nachricht im Hintergrund.
 * Je Profil: Pause prüfen (7 Tage ohne Besuch → keine Bewertung, keine Morgennachricht; einmalig Bescheid),
 * sonst bewerten und die eigene Telegram-Nachricht schicken.
 */
export async function morgenlaufWeitereProfile(db: SupabaseClient, basisUrl: string, beginn: number): Promise<void> {
  const start = Date.now();
  try {
    const { profile } = await ladeProfile(db);
    const aktivitaet = await ladeAktivitaeten(db);
    for (const p of profile) {
      if (p.rolle === "admin" || p.aktiv === false || !p.profiltext) continue;
      // Pause bei Inaktivität: nach 7 Tagen ohne Besuch keine Bewertung und keine Morgennachricht mehr.
      const a = aktivitaet.get(p.slug);
      const lage = entscheide(a);
      if (lage === "uhr-starten") {
        await starteUhr(db, p.slug).catch(() => undefined);
      } else if (a && (lage === "pause-melden" || lage === "pausiert")) {
        if (lage === "pause-melden") {
          try {
            await meldePause(db, p, basisUrl);
            await markiereGemeldet(db, p.slug, a);
          } catch (err) {
            await logFehler(db, [{ quelle: "Pause", detail: p.name, meldung: err instanceof Error ? err.message : String(err) }]);
          }
        }
        continue;
      }
      // Gesamtlaufzeit (inkl. deiner Bewertung) unter maxDuration 300 s halten
      const rest = 270_000 - (Date.now() - beginn);
      if (Date.now() - start > 200_000 || rest < 10_000) break;
      try {
        const r = await runEvaluation(db, { budgetMs: Math.min(45_000, rest - 5_000), anlass: "morgenlauf", profil: p.slug });
        if (r.failed > 0) {
          await logFehler(db, [{ quelle: "Bewertung (Claude)", detail: `Morgenlauf · ${p.name}`, meldung: r.fehlerbeispiele[0] ?? "unbekannt" }]);
        }
      } catch (err) {
        await logFehler(db, [{ quelle: "Bewertung (Claude)", detail: `Morgenlauf · ${p.name}`, meldung: err instanceof Error ? err.message : String(err) }]);
      }
      // Phase 3: eigene Morgennachricht, wenn die Person Telegram verbunden hat.
      try {
        const t = verbindungAus(await ladeEinstellungen(db, p.slug));
        // Bewusst kein Eintrag im Laufprotokoll: dort steht dein Morgenlauf und soll es bleiben.
        if (t) await morgennachrichtFuer(db, p, t.chat_id, `${basisUrl}/inbox`);
      } catch (err) {
        await logFehler(db, [{ quelle: "Telegram", detail: `Morgenlauf · ${p.name}`, meldung: err instanceof Error ? err.message : String(err) }]);
      }
    }
  } catch {
    /* Weitere Profile dürfen den Morgenlauf nie stören */
  }
}

/** Letzte Nachricht vor der Pause: Telegram, wenn verbunden — sonst Mail. Der Link meldet direkt an. */
async function meldePause(db: SupabaseClient, p: { slug: string; name: string; email?: string | null }, basis: string) {
  const link = `${basis}/api/anmelden?t=${encodeURIComponent(neuerLink(p.slug, "nutzer", 7 * 24 * 60))}&weiter=${encodeURIComponent("/inbox")}`;
  const t = pausenText(p.name, link);
  const tg = verbindungAus(await ladeEinstellungen(db, p.slug));
  if (tg) return sendeAn(tg.chat_id, t.telegram);
  if (p.email && mailEingerichtet()) {
    const vorname = p.name.split(" ")[0] || "";
    const { html, text } = linkMail({ anrede: vorname ? `Hallo ${vorname},` : "Hallo,", absatz: t.absatz, knopf: "Weiter geht's", link, fuss: "Der Link gilt 7 Tage. Danach meldest du dich einfach mit deiner E-Mail-Adresse an." });
    await sendeMail({ email: p.email, name: p.name }, t.betreff, html, text);
  }
}
