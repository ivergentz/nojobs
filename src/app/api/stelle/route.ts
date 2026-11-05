import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase";
import { lesen } from "@/lib/lesen";
import { profilAusRequest, istStandard } from "@/lib/aktuelles-profil";
import { schreibeFelder } from "@/lib/schreiben";
import { runEvaluation } from "@/lib/run-evaluate";
import { dublettenKey } from "@/lib/sources/text";
import { BrauchtText, bereinigeUrl, liesStelle, manuellUuid } from "@/lib/stelle-einlesen";
import { logFehler } from "@/lib/fehlerlog";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const PRO_TAG = 20;

/**
 * Stelle hinzufügen (alle Profile, immer nur fürs eigene — das Profil kommt aus der Sitzung).
 *   POST { url?, text? } → { uuid, vorhanden?, fit } oder { brauchtText: true, error }
 * Liest die Anzeige ein, legt sie an (Quelle „manuell“), merkt sie vor und bewertet sie sofort.
 */
export async function POST(request: Request) {
  const body = (await request.json().catch(() => ({}))) as { url?: unknown; text?: unknown };
  const url = typeof body.url === "string" && body.url.trim() ? body.url.trim().slice(0, 2000) : null;
  const text = typeof body.text === "string" ? body.text.slice(0, 60_000) : null;
  if (!url && !(text && text.trim().length >= 200)) {
    return NextResponse.json({ error: "Bitte einen Link einfügen — oder den Text der Anzeige (mindestens ein paar Sätze).", brauchtText: !url }, { status: 400 });
  }
  const slug = profilAusRequest(request);
  const eigenes = istStandard(slug);
  const db = supabaseAdmin();

  // Tageslimit (Kostenschutz)
  const heute = new Date();
  heute.setUTCHours(0, 0, 0, 0);
  let zaehlung = db.from("jobs").select("uuid", { count: "exact", head: true }).eq("source", "manuell").gte("imported_at", heute.toISOString());
  zaehlung = eigenes ? zaehlung.is("import_profil", null) : zaehlung.eq("import_profil", slug);
  const { count } = await zaehlung;
  if ((count ?? 0) >= PRO_TAG) return NextResponse.json({ error: `Heute sind schon ${PRO_TAG} Stellen hinzugefügt — morgen geht es weiter.` }, { status: 429 });

  // Gibt es die Stelle schon (gleicher Link)?
  const sauber = url ? bereinigeUrl(url) : null;
  if (sauber) {
    const { data: gleich } = await db.from("jobs").select("uuid").or(`application_url.eq.${JSON.stringify(sauber)},source_url.eq.${JSON.stringify(sauber)}`).limit(1);
    if (gleich?.[0]) return NextResponse.json(await vorhanden(db, slug, gleich[0].uuid as string));
  }

  let stelle;
  try {
    stelle = await liesStelle({ url, text }, { profil: slug });
  } catch (err) {
    const meldung = err instanceof Error ? err.message : String(err);
    if (err instanceof BrauchtText) return NextResponse.json({ error: meldung, brauchtText: true }, { status: 422 });
    await logFehler(db, [{ quelle: "Stelle hinzufügen", detail: sauber ?? "Text", meldung }]);
    return NextResponse.json({ error: meldung }, { status: 502 });
  }

  // Gleiche Firma + gleicher Titel in den letzten 45 Tagen → vorhandene Stelle nehmen
  if (stelle.company) {
    const seit = new Date(Date.now() - 45 * 864e5).toISOString();
    const { data: aehnlich } = await db.from("jobs").select("uuid,employer_name,title").ilike("title", stelle.title.replace(/[%_]/g, "")).gte("imported_at", seit).limit(20);
    const k = dublettenKey(stelle.company, stelle.title);
    const treffer = (aehnlich ?? []).find((r) => dublettenKey(String(r.employer_name ?? ""), String(r.title ?? "")) === k);
    if (treffer) return NextResponse.json(await vorhanden(db, slug, treffer.uuid as string));
  }

  const uuid = manuellUuid(stelle);
  const jetzt = new Date().toISOString();
  const { error } = await db.from("jobs").upsert(
    {
      uuid,
      source: "manuell",
      status: "ACTIVE",
      title: stelle.title,
      employer_name: stelle.company || null,
      municipal: stelle.location || null,
      country: "Deutschland",
      published: stelle.published ?? jetzt,
      application_url: stelle.url,
      source_url: stelle.url,
      description: stelle.description,
      match_term: eigenes ? "manuell" : `profil:${slug}:manuell`,
      raw: { hinzugefuegt_von: slug, weg: stelle.weg, remote: stelle.remote },
      imported_at: jetzt,
      ...(eigenes ? {} : { import_profil: slug }),
    },
    { onConflict: "uuid" }
  );
  if (error) return NextResponse.json({ error: `Speichern: ${error.message}` }, { status: 500 });
  return NextResponse.json(await vorhanden(db, slug, uuid, stelle.weg));
}

/** Vormerken (bleibt sichtbar, egal wie die Bewertung ausfällt) und — falls noch nicht geschehen — bewerten. */
async function vorhanden(db: ReturnType<typeof supabaseAdmin>, slug: string, uuid: string, weg?: string) {
  const eigenes = istStandard(slug);
  const { data: alt } = await lesen(db, eigenes ? undefined : slug).select("app_status,evaluated_at").eq("uuid", uuid).maybeSingle();
  if (!alt?.app_status || alt.app_status === "neu") await schreibeFelder(db, eigenes ? null : slug, uuid, { app_status: "interessant", app_status_at: new Date().toISOString() });
  let bewertungsfehler: string | null = null;
  if (!alt?.evaluated_at) {
    try {
      const r = await runEvaluation(db as any, { budgetMs: 60_000, limit: 1, anlass: "stelle-hinzufuegen", uuids: [uuid], ...(eigenes ? {} : { profil: slug }) });
      if (r.failed) bewertungsfehler = r.fehlerbeispiele[0] ?? "Bewertung fehlgeschlagen";
    } catch (err) {
      bewertungsfehler = err instanceof Error ? err.message : String(err);
    }
  }
  const { data: neu } = await lesen(db, eigenes ? undefined : slug).select("eval_fit").eq("uuid", uuid).maybeSingle();
  return { ok: true, uuid, vorhanden: !weg, weg: weg ?? null, fit: (neu?.eval_fit as string | null) ?? null, bewertungsfehler };
}
