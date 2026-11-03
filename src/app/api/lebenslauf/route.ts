import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { profilId } from "@/lib/schreiben";
import { BUCKET, bereinige, dateityp, leseLebenslauf, MAX_BYTES } from "@/lib/lebenslauf";

export const dynamic = "force-dynamic";
export const maxDuration = 180;

const DEIN_PROFIL = "Dein Profil nutzt den Lebenslauf von deiner Website — hier wird nichts hochgeladen.";

/**
 * Schritt 2.4 · Lebenslauf des gewählten Profils.
 *   GET  → aktueller Stand (ausgelesen, Richtungen, Prüfbericht)
 *   POST → Datei hochladen (multipart, Feld „datei“), speichern und auslesen lassen
 *   PATCH { lebenslauf, erledigt } → Schritt 2.5: ausgelesene Felder korrigieren, Prüfpunkte abhaken
 * Dein Profil ist gesperrt.
 */
export async function GET(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return NextResponse.json({ error: DEIN_PROFIL }, { status: 400 });
  try {
    const db = supabaseAdmin();
    const id = await profilId(db, profil);
    if (!id) return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
    const { data, error } = await db.from("profile_cv").select("*").eq("profile_id", id).maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ lebenslauf: data ?? null });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return NextResponse.json({ error: DEIN_PROFIL }, { status: 400 });

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: "Keine Datei empfangen." }, { status: 400 });
  }
  const datei = form.get("datei");
  if (!datei || typeof datei === "string") return NextResponse.json({ error: "Keine Datei empfangen." }, { status: 400 });
  if (datei.size > MAX_BYTES) return NextResponse.json({ error: "Die Datei ist größer als 10 MB." }, { status: 400 });
  if (datei.size < 200) return NextResponse.json({ error: "Die Datei ist leer oder beschädigt." }, { status: 400 });

  const inhalt = Buffer.from(await datei.arrayBuffer());
  const typ = dateityp(datei.name, datei.type, inhalt);
  if (!typ) return NextResponse.json({ error: "Bitte ein PDF oder eine Word-Datei (.docx) hochladen." }, { status: 400 });

  try {
    const db = supabaseAdmin();
    const id = await profilId(db, profil);
    if (!id) return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });

    // 1. Original privat speichern
    const sicherName = datei.name.replace(/[^A-Za-z0-9._-]+/g, "_").slice(-80) || "lebenslauf";
    const pfad = `${profil}/${Date.now()}-${sicherName}`;
    const { error: speicherFehler } = await db.storage.from(BUCKET).upload(pfad, inhalt, { contentType: typ, upsert: true });
    if (speicherFehler) {
      return NextResponse.json({ error: `Speichern fehlgeschlagen — wurde supabase/lebenslauf.sql ausgeführt? (${speicherFehler.message})` }, { status: 500 });
    }
    const basis = {
      profile_id: id,
      datei_pfad: pfad,
      datei_name: datei.name.slice(0, 200),
      datei_typ: typ,
      datei_bytes: datei.size,
      updated_at: new Date().toISOString(),
    };
    const { error: zeileFehler } = await db
      .from("profile_cv")
      .upsert({ ...basis, status: "hochgeladen", fehler: null }, { onConflict: "profile_id" });
    if (zeileFehler) return NextResponse.json({ error: zeileFehler.message }, { status: 500 });

    // 2. Auslesen lassen
    try {
      const lebenslauf = await leseLebenslauf(inhalt, typ, { anlass: "knopf", profil });
      const { richtungen, pruefung, ...rest } = lebenslauf;
      const ergebnis = { ...basis, status: "ausgelesen", fehler: null, lebenslauf: rest, richtungen, pruefung };
      const { error } = await db.from("profile_cv").upsert(ergebnis, { onConflict: "profile_id" });
      if (error) return NextResponse.json({ error: error.message }, { status: 500 });
      return NextResponse.json({ lebenslauf: ergebnis });
    } catch (err) {
      const meldung = err instanceof Error ? err.message : String(err);
      await db.from("profile_cv").upsert({ ...basis, status: "fehler", fehler: meldung.slice(0, 500) }, { onConflict: "profile_id" });
      return NextResponse.json({ error: `Auslesen fehlgeschlagen: ${meldung}` }, { status: 502 });
    }
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

/** Schritt 2.5 · Korrigierte Fassung speichern. Ein neuer Upload ersetzt sie wieder. */
export async function PATCH(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return NextResponse.json({ error: DEIN_PROFIL }, { status: 400 });
  const body = (await request.json().catch(() => null)) as { lebenslauf?: Record<string, unknown>; erledigt?: unknown } | null;
  if (!body?.lebenslauf || typeof body.lebenslauf !== "object") return NextResponse.json({ error: "Keine Daten empfangen." }, { status: 400 });
  try {
    const db = supabaseAdmin();
    const id = await profilId(db, profil);
    if (!id) return NextResponse.json({ error: "Profil nicht gefunden" }, { status: 404 });
    const { data: alt, error: leseFehler } = await db.from("profile_cv").select("status,pruefung").eq("profile_id", id).maybeSingle();
    if (leseFehler) return NextResponse.json({ error: leseFehler.message }, { status: 500 });
    if (!alt || alt.status !== "ausgelesen") return NextResponse.json({ error: "Erst einen Lebenslauf hochladen." }, { status: 400 });

    // Gleiche Bereinigung wie beim Auslesen — Längen und Listen begrenzt, nur bekannte Felder.
    const { richtungen: _r, pruefung: _p, ...lebenslauf } = bereinige(body.lebenslauf as never);
    const erledigt = new Set(Array.isArray(body.erledigt) ? body.erledigt.filter((i): i is number => Number.isInteger(i)) : []);
    const pruefung = (Array.isArray(alt.pruefung) ? alt.pruefung : []).map((p: Record<string, unknown>, i: number) => ({ ...p, erledigt: erledigt.has(i) }));
    const jetzt = new Date().toISOString();
    const { error } = await db
      .from("profile_cv")
      .update({ lebenslauf: { ...lebenslauf, bearbeitet_at: jetzt }, pruefung, updated_at: jetzt })
      .eq("profile_id", id);
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, lebenslauf: { ...lebenslauf, bearbeitet_at: jetzt }, pruefung });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
