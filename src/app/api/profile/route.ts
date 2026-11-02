import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { aktualisiereSuchprofil, erstelleProfil, setzeAktiv } from "@/lib/profil";

export const dynamic = "force-dynamic";

/**
 * Schritt 2.1 · Profile verwalten (nur mit Secret, wie die Läufe in der Steuerung).
 *   POST  { name, email? }   → neues Profil (Rolle „nutzer“)
 *   PATCH { slug, aktiv }    → Profil aktivieren / deaktivieren (dein Admin-Profil nie)
 *   PATCH { slug, profiltext?, regeln?, suchbegriffe? } → Suchprofil eines weiteren Profils (Schritt 2.2)
 */
export async function POST(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "nicht autorisiert — Secret oben eintragen" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as { name?: string; email?: string };
    const ergebnis = await erstelleProfil(supabaseAdmin(), { name: body.name ?? "", email: body.email ?? null });
    return ergebnis.ok ? NextResponse.json(ergebnis) : NextResponse.json({ error: ergebnis.fehler }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if (!authorized(request)) return NextResponse.json({ error: "nicht autorisiert — Secret oben eintragen" }, { status: 401 });
  try {
    const body = (await request.json().catch(() => ({}))) as {
      slug?: string;
      aktiv?: boolean;
      profiltext?: string | null;
      regeln?: string | null;
      suchbegriffe?: string | null;
      ort?: string | null;
      umkreis?: number | null;
    };
    if (!body.slug) return NextResponse.json({ error: "slug fehlt" }, { status: 400 });
    const suchprofil =
      body.profiltext !== undefined || body.regeln !== undefined || body.suchbegriffe !== undefined || body.ort !== undefined || body.umkreis !== undefined;
    if (!suchprofil && typeof body.aktiv !== "boolean") return NextResponse.json({ error: "nichts zu ändern" }, { status: 400 });
    const ergebnis = suchprofil
      ? await aktualisiereSuchprofil(supabaseAdmin(), body.slug, {
          profiltext: body.profiltext,
          regeln: body.regeln,
          suchbegriffe: body.suchbegriffe,
          ort: body.ort,
          umkreis: body.umkreis,
        })
      : await setzeAktiv(supabaseAdmin(), body.slug, body.aktiv as boolean);
    return ergebnis.ok ? NextResponse.json(ergebnis) : NextResponse.json({ error: ergebnis.fehler }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
