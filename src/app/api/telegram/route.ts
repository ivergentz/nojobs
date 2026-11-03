import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, speichereEinstellungen } from "@/lib/profil";
import { botName, codeGueltig, findeStart, neuerCode, sendeAn, verbindungAus } from "@/lib/telegram-profil";
import { basisUrl } from "@/lib/sitzung";

export const dynamic = "force-dynamic";

const DEIN_PROFIL = "Dein Telegram ist fest eingerichtet (TELEGRAM_CHAT_ID) — hier wird nichts geändert.";
const fehler = (meldung: string, status: number) => NextResponse.json({ error: meldung }, { status });

/**
 * Phase 3 · Telegram für das gewählte weitere Profil.
 *   GET                        → verbunden? (Name, seit wann)
 *   POST { aktion: "start" }   → neuer Code + Link zum Bot
 *   POST { aktion: "pruefen" } → hat die Person in Telegram auf „Start“ getippt? Dann verbinden.
 *   POST { aktion: "test" }    → Testnachricht
 *   POST { aktion: "trennen" } → Verbindung lösen
 * Dein Profil ist gesperrt.
 */
export async function GET(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  try {
    const t = verbindungAus(await ladeEinstellungen(supabaseAdmin(), profil));
    return NextResponse.json({ verbunden: Boolean(t), name: t?.name ?? null, seit: t?.verbunden_at ?? null });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  const body = (await request.json().catch(() => ({}))) as { aktion?: string };
  const db = supabaseAdmin();
  try {
    const e = await ladeEinstellungen(db, profil);

    if (body.aktion === "start") {
      const code = neuerCode();
      const gesichert = await speichereEinstellungen(db, profil, { telegram_code: code });
      if (!gesichert.ok) return fehler(gesichert.fehler, 500);
      return NextResponse.json({ link: `https://t.me/${await botName()}?start=${code.code}`, gueltigBis: code.exp });
    }

    if (body.aktion === "pruefen") {
      if (!codeGueltig(e.telegram_code)) return NextResponse.json({ verbunden: false, abgelaufen: true });
      const treffer = await findeStart(e.telegram_code.code);
      if (!treffer) return NextResponse.json({ verbunden: false });
      const verbindung = { chat_id: treffer.chat_id, name: treffer.name, verbunden_at: new Date().toISOString() };
      const gesichert = await speichereEinstellungen(db, profil, { telegram: verbindung, telegram_code: null });
      if (!gesichert.ok) return fehler(gesichert.fehler, 500);
      await sendeAn(
        treffer.chat_id,
        `✅ <b>Verbunden.</b> Ab jetzt kommt hier jeden Morgen eine kurze Nachricht, wenn es neue Stellen zum Bewerben gibt — an Tagen ohne Treffer bleibt es still.\n\n${basisUrl(request)}/inbox`
      ).catch(() => {});
      return NextResponse.json({ verbunden: true, name: verbindung.name, seit: verbindung.verbunden_at });
    }

    if (body.aktion === "test") {
      const t = verbindungAus(e);
      if (!t) return fehler("Noch nicht mit Telegram verbunden.", 400);
      await sendeAn(t.chat_id, "✅ Testnachricht — die Verbindung funktioniert.");
      return NextResponse.json({ ok: true });
    }

    if (body.aktion === "trennen") {
      const gesichert = await speichereEinstellungen(db, profil, { telegram: null, telegram_code: null });
      if (!gesichert.ok) return fehler(gesichert.fehler, 500);
      return NextResponse.json({ verbunden: false });
    }

    return fehler("Unbekannte Aktion.", 400);
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 502);
  }
}
