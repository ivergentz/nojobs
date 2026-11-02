import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { aktualisiereSuchprofil, ladeEinstellungen, ladeProfilVoll, speichereEinstellungen } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import { bereinigeVorschlag, erstelleVorschlag, pruefeAntworten, regelnAus } from "@/lib/suchprofil";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEIN_PROFIL = "Dein Suchprofil steht im Code — hier wird nichts geändert.";
const fehler = (meldung: string, status: number) => NextResponse.json({ error: meldung }, { status });

/**
 * Schritt 2.6 · Fragebogen und Suchprofil des gewählten Profils.
 *   GET                                   → gespeicherte Antworten, Vorschlag, Bestätigung
 *   POST { aktion: "vorschlag", antworten }  → Antworten speichern, Claude formuliert einen Vorschlag
 *   POST { aktion: "bestaetigen", vorschlag } → Suchprofil übernehmen (Suchbegriffe, Ort, Profiltext, Regeln)
 * Dein Profil ist gesperrt.
 */
export async function GET(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  try {
    const e = await ladeEinstellungen(supabaseAdmin(), profil);
    return NextResponse.json({ antworten: e.fragebogen ?? null, vorschlag: e.vorschlag ?? null, bestaetigt_at: e.bestaetigt_at ?? null });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);

  let body: { aktion?: string; antworten?: unknown; vorschlag?: Record<string, unknown> };
  try {
    body = await request.json();
  } catch {
    return fehler("Ungültige Anfrage.", 400);
  }

  try {
    const db = supabaseAdmin();
    const person = await ladeProfilVoll(db, profil);
    if (!person) return fehler("Profil nicht gefunden.", 404);

    if (body.aktion === "vorschlag") {
      const geprueft = pruefeAntworten(body.antworten);
      if (!geprueft.ok) return fehler(geprueft.fehler, 400);
      // Antworten zuerst sichern — gehen auch dann nicht verloren, wenn Claude ausfällt.
      const gesichert = await speichereEinstellungen(db, profil, { fragebogen: geprueft.antworten });
      if (!gesichert.ok) return fehler(gesichert.fehler, 500);

      let lebenslauf: unknown = null;
      const id = await profilId(db, profil);
      if (id) {
        const { data } = await db.from("profile_cv").select("lebenslauf,status").eq("profile_id", id).maybeSingle();
        if (data?.status === "ausgelesen") lebenslauf = data.lebenslauf;
      }
      try {
        const vorschlag = await erstelleVorschlag(
          { name: person.name, lebenslauf, antworten: geprueft.antworten },
          { anlass: "knopf", profil }
        );
        await speichereEinstellungen(db, profil, { vorschlag });
        return NextResponse.json({ vorschlag, antworten: geprueft.antworten });
      } catch (err) {
        return fehler(`Vorschlag fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, 502);
      }
    }

    if (body.aktion === "bestaetigen") {
      const v = bereinigeVorschlag(body.vorschlag ?? {});
      if (v.suchbegriffe.length === 0) return fehler("Bitte mindestens einen Suchbegriff angeben.", 400);
      if (v.ort.length < 2) return fehler("Bitte einen Ort oder eine Postleitzahl angeben.", 400);
      if (v.profiltext.length < 20) return fehler("Der Profiltext ist zu kurz.", 400);
      if (v.kriterien.length < 20) return fehler("Die Bewertungsregeln sind zu kurz.", 400);
      const ergebnis = await aktualisiereSuchprofil(db, profil, {
        profiltext: v.profiltext,
        regeln: regelnAus(v.kriterien),
        suchbegriffe: v.suchbegriffe.join(", "),
        ort: v.ort,
        umkreis: v.umkreis,
      });
      if (!ergebnis.ok) return fehler(ergebnis.fehler, 500);
      const bestaetigt_at = new Date().toISOString();
      await speichereEinstellungen(db, profil, { vorschlag: v, bestaetigt_at });
      // Neues Suchprofil → bisherige Bewertungen dieses Profils gelten als veraltet und werden beim
      // nächsten Lauf neu bewertet. Labels, Status und Notizen bleiben unangetastet.
      const id = await profilId(db, profil);
      if (id) {
        await db.from("matches").update({ evaluated_at: null }).eq("profile_id", id).not("evaluated_at", "is", null);
      }
      return NextResponse.json({ ok: true, vorschlag: v, bestaetigt_at });
    }

    return fehler("Unbekannte Aktion.", 400);
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}
