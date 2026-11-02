import { NextResponse } from "next/server";
import { authorized } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/supabase";
import { erstelleProfil, setzeAktiv } from "@/lib/profil";

export const dynamic = "force-dynamic";

/**
 * Schritt 2.1 · Profile verwalten (nur mit Secret, wie die Läufe in der Steuerung).
 *   POST  { name, email? }   → neues Profil (Rolle „nutzer“)
 *   PATCH { slug, aktiv }    → Profil aktivieren / deaktivieren (dein Admin-Profil nie)
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
    const body = (await request.json().catch(() => ({}))) as { slug?: string; aktiv?: boolean };
    if (!body.slug || typeof body.aktiv !== "boolean") return NextResponse.json({ error: "slug oder aktiv fehlt" }, { status: 400 });
    const ergebnis = await setzeAktiv(supabaseAdmin(), body.slug, body.aktiv);
    return ergebnis.ok ? NextResponse.json(ergebnis) : NextResponse.json({ error: ergebnis.fehler }, { status: 400 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 500 });
  }
}
