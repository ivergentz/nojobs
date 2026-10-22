import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";

export const dynamic = "force-dynamic";

const ALLOWED = ["neu", "interessant", "beworben", "interview", "absage", "abgelegt"];

/**
 * Status einer Stelle setzen.
 *
 *   { uuid, status }                → nur Status
 *   { uuid, absageNotiz }           → nur den Absagegrund speichern (leer = löschen)
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

    if (body.absageNotiz !== undefined) {
      const notiz = body.absageNotiz.trim().slice(0, 500) || null;
      const { error } = await db.from("jobs").update({ absage_notiz: notiz }).eq("uuid", body.uuid);
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

    const { error } = await db
      .from("jobs")
      .update({
        app_status: body.status,
        app_status_at: new Date().toISOString(),
        ...(body.note !== undefined ? { app_note: body.note } : {}),
      })
      .eq("uuid", body.uuid);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
