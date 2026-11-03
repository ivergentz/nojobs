import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, ladeProfilVoll, speichereEinstellungen } from "@/lib/profil";
import { profilId } from "@/lib/schreiben";
import { basisUrl } from "@/lib/sitzung";
import { AKZENTE, briefDokument, cvDokument, LAYOUTS, optionenAus, registriereSchriften } from "@/lib/pdf/layouts";
import { beispielBrief, cvAusLebenslauf, fotoDatenUrl, layoutWahlAus, SCHRIFT_ORDNER } from "@/lib/unterlagen";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const DEIN_PROFIL = "Dein Profil nutzt das Design deiner Website — hier ist nichts einzustellen.";
const fehler = (meldung: string, status: number) => NextResponse.json({ error: meldung }, { status });

/**
 * Phase 4.2 · Layout der Unterlagen.
 *   GET                              → gespeicherte Wahl
 *   GET ?vorschau=cv|brief&layout=…&akzent=…&foto=0|1 → PDF mit deinen eigenen Daten (nur zum Ansehen)
 *   POST { layout, akzent, mitFoto } → Wahl speichern
 * Dein Profil ist gesperrt.
 */
export async function GET(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  const url = new URL(request.url);
  const art = url.searchParams.get("vorschau");
  try {
    const db = supabaseAdmin();
    const einstellungen = await ladeEinstellungen(db, profil);
    const gespeichert = layoutWahlAus(einstellungen);
    if (!art) return NextResponse.json({ layout: gespeichert.layout, akzent: gespeichert.akzentId, mitFoto: gespeichert.o.mitFoto });
    if (art !== "cv" && art !== "brief") return fehler("Unbekannte Vorschau.", 400);

    // Werte aus der Adresse (noch nicht gespeicherte Auswahl), sonst die gespeicherten.
    const p = url.searchParams;
    const wahl = optionenAus({
      layout: p.get("layout") ?? gespeichert.layout,
      akzent: p.get("akzent") ?? gespeichert.akzentId,
      mitFoto: p.has("foto") ? p.get("foto") === "1" : gespeichert.o.mitFoto,
    });

    const [person, id] = await Promise.all([ladeProfilVoll(db, profil), profilId(db, profil)]);
    if (!id) return fehler("Profil nicht gefunden.", 404);
    const { data, error } = await db.from("profile_cv").select("status,lebenslauf").eq("profile_id", id).maybeSingle();
    if (error) return fehler(error.message, 500);
    if (data?.status !== "ausgelesen" || !data.lebenslauf) return fehler("Lade zuerst deinen Lebenslauf hoch — die Vorschau nutzt deine eigenen Daten.", 400);

    const foto = wahl.o.mitFoto ? await fotoDatenUrl(db, einstellungen) : null;
    const cv = cvAusLebenslauf(data.lebenslauf, person?.name ?? profil, foto);
    registriereSchriften(`${basisUrl(request)}${SCHRIFT_ORDNER}`);
    const dokument = art === "cv" ? cvDokument(wahl.layout, cv, wahl.o) : briefDokument(wahl.layout, cv, beispielBrief(cv), wahl.o);
    const pdf = await renderToBuffer(dokument as never);
    const name = `${art === "cv" ? "Lebenslauf" : "Anschreiben"}-Vorschau-${wahl.layout}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `inline; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}

export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  const body = (await request.json().catch(() => null)) as { layout?: unknown; akzent?: unknown; mitFoto?: unknown } | null;
  if (!body || !LAYOUTS.some((l) => l.id === body.layout) || typeof body.akzent !== "string" || !Object.hasOwn(AKZENTE, body.akzent)) {
    return fehler("Bitte ein Layout und eine Farbe wählen.", 400);
  }
  const wahl = optionenAus(body);
  try {
    const db = supabaseAdmin();
    const ok = await speichereEinstellungen(db, profil, { unterlagen: { layout: wahl.layout, akzent: wahl.akzentId, mitFoto: body.mitFoto !== false } });
    if (!ok.ok) return fehler(ok.fehler, 500);
    return NextResponse.json({ layout: wahl.layout, akzent: wahl.akzentId, mitFoto: wahl.o.mitFoto });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}
