import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { gueltigerSlug, istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, speichereEinstellungen } from "@/lib/profil";
import { bildtyp, FOTO_BUCKET, FOTO_MAX_BYTES, fotoAus } from "@/lib/foto";
import { sitzungAusHeader } from "@/lib/sitzung";

export const dynamic = "force-dynamic";

const DEIN_PROFIL = "Für dein Profil gibt es (noch) kein Foto — deine Unterlagen kommen von deiner Website.";
const fehler = (meldung: string, status: number) => NextResponse.json({ error: meldung }, { status });

/**
 * Schritt 2.5 · Passfoto.
 *   GET ?profil=<slug>  → das Bild (weitere Personen sehen nur ihr eigenes, du jedes)
 *   POST (multipart „datei“) → zugeschnittenes Foto speichern (ersetzt ein altes)
 *   DELETE              → Foto entfernen
 * Dein Profil ist ausgenommen.
 */
export async function GET(request: Request) {
  const sitzung = sitzungAusHeader(request.headers.get("cookie"));
  const gewuenscht = new URL(request.url).searchParams.get("profil");
  const slug = sitzung?.r === "nutzer" ? sitzung.s : gewuenscht ? gueltigerSlug(gewuenscht) : profilAusRequest(request);
  if (istStandard(slug)) return new NextResponse(null, { status: 404 });
  try {
    const db = supabaseAdmin();
    const foto = fotoAus(await ladeEinstellungen(db, slug));
    if (!foto) return new NextResponse(null, { status: 404 });
    const { data, error } = await db.storage.from(FOTO_BUCKET).download(foto.pfad);
    if (error || !data) return new NextResponse(null, { status: 404 });
    return new NextResponse(await data.arrayBuffer(), {
      headers: { "content-type": foto.typ, "cache-control": "private, max-age=86400", "x-content-type-options": "nosniff" },
    });
  } catch {
    return new NextResponse(null, { status: 404 });
  }
}

export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return fehler("Kein Bild empfangen.", 400);
  }
  const datei = form.get("datei");
  if (!datei || typeof datei === "string") return fehler("Kein Bild empfangen.", 400);
  if (datei.size > FOTO_MAX_BYTES) return fehler("Das Bild ist größer als 3 MB.", 400);
  if (datei.size < 500) return fehler("Das Bild ist leer oder beschädigt.", 400);
  const inhalt = Buffer.from(await datei.arrayBuffer());
  const typ = bildtyp(inhalt);
  if (!typ) return fehler("Bitte ein JPG-, PNG- oder WebP-Bild verwenden.", 400);

  try {
    const db = supabaseAdmin();
    const alt = fotoAus(await ladeEinstellungen(db, profil));
    const endung = typ === "image/png" ? "png" : typ === "image/webp" ? "webp" : "jpg";
    const pfad = `${profil}/foto-${Date.now()}.${endung}`;
    const { error: speicherFehler } = await db.storage.from(FOTO_BUCKET).upload(pfad, inhalt, { contentType: typ, upsert: true });
    if (speicherFehler) return fehler(`Speichern fehlgeschlagen — wurde supabase/fotos.sql ausgeführt? (${speicherFehler.message})`, 500);
    const foto = { pfad, typ, aktualisiert: new Date().toISOString() };
    const gesichert = await speichereEinstellungen(db, profil, { foto });
    if (!gesichert.ok) return fehler(gesichert.fehler, 500);
    if (alt && alt.pfad !== pfad) await db.storage.from(FOTO_BUCKET).remove([alt.pfad]).catch(() => {});
    return NextResponse.json({ ok: true, foto });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function DELETE(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  try {
    const db = supabaseAdmin();
    const alt = fotoAus(await ladeEinstellungen(db, profil));
    const gesichert = await speichereEinstellungen(db, profil, { foto: null });
    if (!gesichert.ok) return fehler(gesichert.fehler, 500);
    if (alt) await db.storage.from(FOTO_BUCKET).remove([alt.pfad]).catch(() => {});
    return NextResponse.json({ ok: true });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}
