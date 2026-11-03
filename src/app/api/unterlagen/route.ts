import { NextResponse } from "next/server";
import { renderToBuffer } from "@react-pdf/renderer";
import { supabaseAdmin } from "@/lib/supabase";
import { istStandard, profilAusRequest } from "@/lib/aktuelles-profil";
import { ladeEinstellungen, ladeProfilVoll } from "@/lib/profil";
import { profilId, schreibeFelder } from "@/lib/schreiben";
import { lesen } from "@/lib/lesen";
import { basisUrl } from "@/lib/sitzung";
import { briefDokument, cvDokument, optionenAus, registriereSchriften } from "@/lib/pdf/layouts";
import { cvAusLebenslauf, fotoDatenUrl, layoutWahlAus, SCHRIFT_ORDNER } from "@/lib/unterlagen";
import { bereinigeEntwurf, briefAusEntwurf, cvFuerStelle, entwurfFuerProfil, type ProfilEntwurf } from "@/lib/unterlagen-entwurf";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const DEIN_PROFIL = "Dein Profil nutzt die Unterlagen-Seite mit deiner Website — hier ist nichts zu tun.";
const fehler = (meldung: string, status: number) => NextResponse.json({ error: meldung }, { status });

/**
 * Phase 4.3 · Unterlagen weiterer Profile.
 *   POST { uuid, aktion: "erstellen" }           → Anschreiben + Lebenslauf-Anpassung entwerfen (ca. 20–40 s)
 *   POST { uuid, aktion: "speichern", entwurf }  → bearbeitete Fassung sichern
 *   GET  ?uuid=…&doc=cv|brief                    → PDF im gewählten Layout
 * Dein Profil ist gesperrt — für dich gilt weiter /api/application/*.
 */
async function grundlage(db: ReturnType<typeof supabaseAdmin>, profil: string) {
  const [person, id, einstellungen] = await Promise.all([ladeProfilVoll(db, profil), profilId(db, profil), ladeEinstellungen(db, profil)]);
  if (!person || !id) return { fehler: fehler("Profil nicht gefunden.", 404) } as const;
  const { data, error } = await db.from("profile_cv").select("status,lebenslauf").eq("profile_id", id).maybeSingle();
  if (error) return { fehler: fehler(error.message, 500) } as const;
  if (data?.status !== "ausgelesen" || !data.lebenslauf) return { fehler: fehler("Lade zuerst deinen Lebenslauf hoch (Mein Profil).", 400) } as const;
  return { person, einstellungen, lebenslauf: data.lebenslauf as Record<string, any> } as const;
}

async function stelle(db: ReturnType<typeof supabaseAdmin>, profil: string, uuid: string) {
  return lesen(db, profil).select("uuid,title,employer_name,municipal,county,country,description,application_draft").eq("uuid", uuid).maybeSingle();
}

export async function POST(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  const body = (await request.json().catch(() => null)) as { uuid?: unknown; aktion?: unknown; entwurf?: unknown } | null;
  const uuid = typeof body?.uuid === "string" ? body.uuid : "";
  if (!uuid) return fehler("uuid fehlt", 400);
  try {
    const db = supabaseAdmin();
    const g = await grundlage(db, profil);
    if ("fehler" in g) return g.fehler;
    const { data: job, error } = await stelle(db, profil, uuid);
    if (error) return fehler(error.message, 500);
    if (!job) return fehler("Stelle nicht gefunden", 404);
    const stationen = Array.isArray(g.lebenslauf.stationen) ? g.lebenslauf.stationen.length : 0;
    const vorher = (job.application_draft as Partial<ProfilEntwurf> | null)?.art === "profil" ? (job.application_draft as ProfilEntwurf) : null;

    let entwurf: ProfilEntwurf;
    if (body?.aktion === "erstellen") {
      entwurf = await entwurfFuerProfil({
        name: g.person.name,
        lebenslauf: g.lebenslauf,
        profiltext: g.person.profiltext,
        stelle: {
          title: (job.title as string) ?? "",
          employer: (job.employer_name as string) ?? "",
          place: [job.municipal, job.county].filter(Boolean).join(", ") || ((job.country as string) ?? ""),
          description: (job.description as string) ?? "",
        },
        kosten: { anlass: "knopf", jobUuid: uuid, profil },
      });
      if (vorher?.layout) entwurf.layout = vorher.layout; // eigene Layout-Wahl für die Stelle bleibt
    } else if (body?.aktion === "speichern" && body.entwurf && typeof body.entwurf === "object") {
      entwurf = bereinigeEntwurf({ ...(body.entwurf as Record<string, unknown>), layoutVorschlag: vorher?.layoutVorschlag ?? (body.entwurf as Record<string, unknown>).layoutVorschlag ?? null, erstellt: vorher?.erstellt }, stationen);
    } else {
      return fehler("Unbekannte Aktion.", 400);
    }
    const { error: schreibFehler } = await schreibeFelder(db, profil, uuid, { application_draft: entwurf, application_drafted_at: new Date().toISOString() });
    if (schreibFehler) return fehler(`Nicht gespeichert: ${schreibFehler.message}`, 500);
    return NextResponse.json({ entwurf });
  } catch (err) {
    return fehler(err instanceof Error ? err.message : String(err), 500);
  }
}

const dateiname = (t: string) =>
  t
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9]+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 40) || "Bewerbung";

export async function GET(request: Request) {
  const profil = profilAusRequest(request);
  if (istStandard(profil)) return fehler(DEIN_PROFIL, 400);
  const url = new URL(request.url);
  const uuid = url.searchParams.get("uuid") ?? "";
  const doc = url.searchParams.get("doc") === "cv" ? "cv" : "brief";
  if (!uuid) return fehler("uuid fehlt", 400);
  try {
    const db = supabaseAdmin();
    const g = await grundlage(db, profil);
    if ("fehler" in g) return g.fehler;
    const { data: job, error } = await stelle(db, profil, uuid);
    if (error) return fehler(error.message, 500);
    const e = job?.application_draft as ProfilEntwurf | null;
    if (!job || e?.art !== "profil") return fehler("Noch keine Unterlagen — erst „Unterlagen erstellen“.", 404);

    const standard = layoutWahlAus(g.einstellungen);
    const wahl = optionenAus({ layout: e.layout ?? standard.layout, akzent: standard.akzentId, mitFoto: standard.o.mitFoto });
    const foto = wahl.o.mitFoto ? await fotoDatenUrl(db, g.einstellungen) : null;
    const cv = cvFuerStelle(cvAusLebenslauf(g.lebenslauf, g.person.name, foto), e);
    registriereSchriften(`${basisUrl(request)}${SCHRIFT_ORDNER}`);
    const dokument = doc === "cv" ? cvDokument(wahl.layout, cv, wahl.o) : briefDokument(wahl.layout, cv, briefAusEntwurf(e, cv.kontakt.ort), wahl.o);
    const pdf = await renderToBuffer(dokument as never);
    const name = `${doc === "cv" ? "Lebenslauf" : "Anschreiben"}_${dateiname(g.person.name)}_${dateiname((job.employer_name as string) ?? "")}.pdf`;
    return new NextResponse(new Uint8Array(pdf), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="${name}"`, "cache-control": "no-store" },
    });
  } catch (err) {
    return fehler(`PDF fehlgeschlagen: ${err instanceof Error ? err.message : String(err)}`, 500);
  }
}
