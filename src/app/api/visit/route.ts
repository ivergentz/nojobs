import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { sendTelegram } from "@/lib/notify";
import { geraet, istBot, REF_MUSTER } from "@/lib/tracking";

export const dynamic = "force-dynamic";

/**
 * Empfängt Aufrufe der Bewerbungs-Links von der Website (sendBeacon, text/plain).
 *
 *   typ "start" — Link geöffnet → neuer Besuch, ggf. Telegram
 *   typ "seite" — Unterseite angesehen (z. B. "cv")
 *   typ "ende"  — Tab verlassen, mit Verweildauer in Sekunden
 *
 * Öffentlich erreichbar, ohne Secret — die Website muss es aufrufen können.
 * Unbekannte Kürzel werden still ignoriert. Telegram höchstens alle 6 Stunden
 * pro Kürzel, damit niemand den Bot zuspammen kann.
 */

const CORS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

const TELEGRAM_PAUSE_MS = 6 * 3600 * 1000;

const leer = () => new NextResponse(null, { status: 204, headers: CORS });

export async function OPTIONS() {
  return leer();
}

type Meldung = {
  typ?: string;
  ref?: string;
  sitzung?: string;
  pfad?: string;
  sekunden?: number;
  bot?: boolean;
};

function escapeHtml(value: string): string {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

export async function POST(request: Request) {
  let m: Meldung;
  try {
    m = JSON.parse(await request.text()) as Meldung;
  } catch {
    return leer();
  }

  const ref = String(m.ref ?? "").toLowerCase();
  const sitzung = String(m.sitzung ?? "").slice(0, 60);
  if (!REF_MUSTER.test(ref) || !sitzung) return leer();

  const pfad = String(m.pfad ?? "start").toLowerCase().replace(/[^a-z0-9/-]/g, "").slice(0, 40) || "start";
  const ua = request.headers.get("user-agent");

  try {
    const db = supabaseAdmin();
    const { data: job } = await db
      .from("jobs")
      .select("uuid,title,employer_name,app_status,app_status_at")
      .eq("ref", ref)
      .maybeSingle();
    if (!job) return leer();

    const { data: vorhanden } = await db
      .from("besuche")
      .select("id,seiten,sekunden,bot")
      .eq("sitzung", sitzung)
      .maybeSingle();

    if (m.typ === "ende") {
      const sek = Math.max(0, Math.min(3600, Math.round(Number(m.sekunden) || 0)));
      if (vorhanden && sek > ((vorhanden.sekunden as number) ?? 0)) {
        await db.from("besuche").update({ sekunden: sek, updated_at: new Date().toISOString() }).eq("id", vorhanden.id);
      }
      return leer();
    }

    if (vorhanden) {
      const seiten = (vorhanden.seiten as string[]) ?? [];
      if (!seiten.includes(pfad)) {
        await db
          .from("besuche")
          .update({ seiten: [...seiten, pfad], updated_at: new Date().toISOString() })
          .eq("id", vorhanden.id);
      }
      return leer();
    }

    // Neue Besuche entstehen nur über "start" — eine Seiten-Meldung, die vor
    // dem Start ankommt, würde sonst die Bot-Kennung des Starts verlieren.
    if (m.typ !== "start") return leer();

    // Neuer Besuch
    const bot = Boolean(m.bot) || istBot(ua);
    const jetzt = new Date().toISOString();

    const { data: frueher } = await db
      .from("besuche")
      .select("created_at")
      .eq("ref", ref)
      .eq("bot", false)
      .order("created_at", { ascending: false })
      .limit(500);

    const { error: insertError } = await db.from("besuche").insert({
      sitzung,
      ref,
      job_uuid: job.uuid,
      seiten: [pfad],
      geraet: geraet(ua),
      bot,
      created_at: jetzt,
      updated_at: jetzt,
    });
    // Doppelte Sitzung (zwei Meldungen gleichzeitig) → schon erfasst.
    if (insertError) return leer();
    if (bot) return leer();

    const bisher = (frueher ?? []) as Array<{ created_at: string }>;
    const letzter = bisher[0]?.created_at ? new Date(bisher[0].created_at).getTime() : 0;
    if (Date.now() - letzter < TELEGRAM_PAUSE_MS) return leer();

    const nr = bisher.length + 1;
    const firma = escapeHtml((job.employer_name as string) ?? ref);
    const titel = escapeHtml((job.title as string) ?? "");
    const basis = process.env.PUBLIC_BASE_URL ?? `https://${request.headers.get("host") ?? ""}`;
    const text = [
      nr === 1 ? `👀 <b>${firma}</b> hat deine Seite geöffnet` : `👀 <b>${firma}</b> schaut wieder rein (${nr}. Besuch)`,
      titel,
      `${geraet(ua)} · über /${escapeHtml(ref)}`,
      "",
      `${basis}/analytics`,
    ]
      .filter((line, i) => line || i === 3)
      .join("\n");

    try {
      await sendTelegram(text);
    } catch {
      /* Telegram weg — der Besuch ist trotzdem gespeichert */
    }
    return leer();
  } catch {
    // Datenbank weg o. Ä. — die Website darf davon nichts merken.
    return leer();
  }
}
