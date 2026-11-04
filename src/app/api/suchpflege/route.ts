import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { STANDARD_SLUG } from "@/lib/profil";
import { pflegeAus, wendeAn, type Art, type Aktion } from "@/lib/suchpflege";

export const dynamic = "force-dynamic";

/**
 * Suchpflege bestätigen — nur für den Betreiber (der Proxy lässt hier nur die Admin-Sitzung
 * oder ein gültiges Secret durch; Nutzer bekommen 403).
 *   POST { slug, annehmen: [{art, aktion, begriff}], ablehnen: [...] }
 *   POST { slug, zuruecksetzen: true }   → eigene Abweichungen deines Profils verwerfen (wieder Liste aus dem Code)
 */

type Eintrag = { art: Art; aktion: Aktion; begriff: string };
const ARTEN = new Set(["ba", "google", "profil"]);
const AKTIONEN = new Set(["aus", "neu"]);

function eintraege(v: unknown): Eintrag[] {
  if (!Array.isArray(v)) return [];
  return v
    .filter((x): x is Eintrag => Boolean(x) && typeof x === "object" && ARTEN.has((x as Eintrag).art) && AKTIONEN.has((x as Eintrag).aktion) && typeof (x as Eintrag).begriff === "string")
    .slice(0, 40);
}

export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { slug?: unknown; annehmen?: unknown; ablehnen?: unknown; zuruecksetzen?: unknown };
  const slug = typeof body.slug === "string" ? body.slug : "";
  if (!slug) return NextResponse.json({ error: "Profil fehlt." }, { status: 400 });

  const db = supabaseAdmin();
  const { data: zeile, error } = await db.from("profiles").select("slug,rolle,suchbegriffe,einstellungen").eq("slug", slug).maybeSingle();
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!zeile) return NextResponse.json({ error: "Profil nicht gefunden." }, { status: 404 });

  const admin = slug === STANDARD_SLUG;
  const einstellungen = (zeile.einstellungen && typeof zeile.einstellungen === "object" ? zeile.einstellungen : {}) as Record<string, unknown>;
  const pflege = pflegeAus(einstellungen);

  if (body.zuruecksetzen === true) {
    if (!admin) return NextResponse.json({ error: "Nur für dein Profil." }, { status: 400 });
    const neu = { ...pflege, ba_aus: [], ba_neu: [], google_aus: [], google_neu: [] };
    const { error: e } = await db.from("profiles").update({ einstellungen: { ...einstellungen, suchpflege: neu }, updated_at: new Date().toISOString() }).eq("slug", slug);
    return e ? NextResponse.json({ error: e.message }, { status: 500 }) : NextResponse.json({ ok: true, zurueckgesetzt: true });
  }

  const suchbegriffe = Array.isArray(zeile.suchbegriffe) ? (zeile.suchbegriffe as unknown[]).filter((x): x is string => typeof x === "string") : [];
  const ergebnis = wendeAn(admin ? "admin" : "nutzer", pflege, suchbegriffe, { annehmen: eintraege(body.annehmen), ablehnen: eintraege(body.ablehnen) });
  if (ergebnis.fehler.some((f) => f.startsWith("Es muss"))) return NextResponse.json({ error: ergebnis.fehler.join(" ") }, { status: 400 });

  const aenderung: Record<string, unknown> = { einstellungen: { ...einstellungen, suchpflege: ergebnis.pflege }, updated_at: new Date().toISOString() };
  if (!admin) aenderung.suchbegriffe = ergebnis.suchbegriffe;
  const { error: e } = await db.from("profiles").update(aenderung).eq("slug", slug);
  if (e) return NextResponse.json({ error: e.message }, { status: 500 });
  return NextResponse.json({ ok: true, angenommen: ergebnis.angenommen.length, hinweise: ergebnis.fehler });
}
