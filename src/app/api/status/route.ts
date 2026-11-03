import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vorbereitungFuerProfil, vorbereitungFuerStelle } from "@/lib/vorbereitung";
import { lesen } from "@/lib/lesen";
import { schreibeFelder } from "@/lib/schreiben";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { gruendeFuer, istAblageGrund } from "@/lib/gruende";

export const dynamic = "force-dynamic";
// Platz für die Gesprächsvorbereitung (Websuche + Briefing), die nach der Antwort im Hintergrund entsteht.
// Bis 300 s erlaubt Vercel Hobby mit Fluid Compute.
// Websuche (bis 75 s) + Briefing (bis 150 s). Vercel Hobby mit Fluid Compute erlaubt bis 300 s.
export const maxDuration = 300;

const ALLOWED = ["neu", "interessant", "beworben", "interview", "absage", "abgelegt"];

/**
 * Status einer Stelle setzen.
 *
 *   { uuid, status }                → nur Status
 *   { uuid, absageNotiz }           → nur den Absagegrund speichern (leer = löschen)
 *
 * Wechsel auf "beworben" erzeugt im Hintergrund die Gesprächsvorbereitung.
 *
 *   { uuid, status: "abgelegt", ablage: { gruende, notiz } } → Ablegen mit Grund (fließt ins Lernen ein):
 *       Gründe „Passt nicht“ (wie beim Labeln) → Urteil „Ignorieren“ mit Begründung.
 *       Gründe „Passt, aber …“ (ablage-…)  → kein Urteil; die Stelle zählt nicht als Fehlalarm.
 *       Ohne Grund → wie bisher.
 *
 * Der Absagegrund fließt als Lernpunkt in die Bewertung neuer Stellen ein
 * (run-evaluate.ts). Fehlt die Spalte noch (absage-notiz.sql), gibt es eine
 * Warnung statt eines Fehlers.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      uuid?: string;
      status?: string;
      note?: string;
      absageNotiz?: string;
      ablage?: { gruende?: unknown; notiz?: unknown };
    };

    if (!body.uuid) {
      return NextResponse.json({ error: "uuid fehlt" }, { status: 400 });
    }

    const db = supabaseAdmin();
    // Schritt 2.2: gewähltes Profil (Cookie). Dein Profil schreibt wie bisher in jobs.
    const profil = profilAusRequest(request);

    if (body.absageNotiz !== undefined) {
      const notiz = body.absageNotiz.trim().slice(0, 500) || null;
      const { error } = await schreibeFelder(db, profil, body.uuid, { absage_notiz: notiz });
      if (error) {
        return NextResponse.json(
          { error: `Grund nicht gespeichert — wurde supabase/absage-notiz.sql ausgeführt? (${error.message})` },
          { status: 500 }
        );
      }
      if (!body.status) return NextResponse.json({ ok: true });
    }

    if (!ALLOWED.includes(body.status ?? "")) {
      return NextResponse.json({ error: "uuid oder status fehlt" }, { status: 400 });
    }

    const { error } = await schreibeFelder(db, profil, body.uuid, {
      app_status: body.status,
      app_status_at: new Date().toISOString(),
      ...(body.note !== undefined ? { app_note: body.note } : {}),
    });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    if (body.status === "abgelegt" && body.ablage) {
      const warnung = await ablageGrundSpeichern(db, profil, body.uuid, body.ablage);
      if (warnung) return NextResponse.json({ ok: true, warnung });
    }

    // "Beworben": Gesprächsvorbereitung im Hintergrund erzeugen, falls es noch keine gibt.
    // Die Antwort an die Inbox wartet darauf nicht.
    // Nur für dein Profil: Unterlagen und Vorbereitung für weitere Profile kommen in Phase 4.
    if (body.status === "beworben" && istStandard(profil)) {
      const uuid = body.uuid;
      after(async () => {
        try {
          const { data, error: leseFehler } = await lesen(db).select("vorbereitung").eq("uuid", uuid).maybeSingle();
          if (leseFehler || data?.vorbereitung) return; // Spalte fehlt oder schon vorhanden
          await vorbereitungFuerStelle(db, uuid, "status");
        } catch {
          /* Nicht schlimm — auf der Unterlagen-Seite lässt sie sich von Hand erzeugen. */
        }
      });
    }
    // Phase 4.3: weitere Profile — nur mit ausgelesenem Lebenslauf, sonst still nichts.
    if (body.status === "beworben" && !istStandard(profil)) {
      const uuid = body.uuid;
      after(async () => {
        try {
          const { data } = await lesen(db, profil).select("vorbereitung").eq("uuid", uuid).maybeSingle();
          if (data?.vorbereitung) return;
          await vorbereitungFuerProfil(db, profil, uuid, "status");
        } catch {
          /* z. B. noch kein Lebenslauf — auf der Unterlagen-Seite von Hand möglich. */
        }
      });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

/**
 * Grund fürs Ablegen. Gibt bei einem Problem eine Warnung zurück — der Status ist dann
 * schon gespeichert, nur der Grund nicht.
 */
async function ablageGrundSpeichern(
  db: ReturnType<typeof supabaseAdmin>,
  profil: string,
  uuid: string,
  ablage: { gruende?: unknown; notiz?: unknown }
): Promise<string | null> {
  const erlaubtNicht = new Set(gruendeFuer(profil).ignore.map((g) => g.key));
  const roh = Array.isArray(ablage.gruende) ? ablage.gruende.filter((k): k is string => typeof k === "string") : [];
  const passtNicht = roh.filter((k) => erlaubtNicht.has(k)).slice(0, 6);
  const passtAber = roh.filter(istAblageGrund).slice(0, 6);
  const notiz = typeof ablage.notiz === "string" ? ablage.notiz.trim().slice(0, 300) || null : null;
  if (!passtNicht.length && !passtAber.length && !notiz) return null;

  if (passtNicht.length) {
    // Echte Absage an die Stelle → dasselbe wie „Ignorieren“ mit Begründung beim Labeln.
    const { error } = await schreibeFelder(db, profil, uuid, {
      label: "ignore",
      labeled_at: new Date().toISOString(),
      label_gruende: passtNicht,
      label_notiz: notiz,
    });
    return error ? `Grund nicht gespeichert: ${error.message}` : null;
  }
  // „Passt, aber …“ (oder nur eine Notiz): kein Urteil setzen. Ein vorhandenes Urteil bleibt unberührt.
  const { data, error: leseFehler } = await lesen(db, profil).select("label").eq("uuid", uuid).maybeSingle();
  if (leseFehler) return `Grund nicht gespeichert: ${leseFehler.message}`;
  if (data?.label) return null;
  const { error } = await schreibeFelder(db, profil, uuid, { label_gruende: passtAber.length ? passtAber : null, label_notiz: notiz });
  return error ? `Grund nicht gespeichert: ${error.message}` : null;
}
