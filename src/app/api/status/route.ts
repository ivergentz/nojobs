import { after, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { vorbereitungFuerStelle } from "@/lib/vorbereitung";
import { lesen } from "@/lib/lesen";
import { schreibeFelder } from "@/lib/schreiben";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";

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

    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
