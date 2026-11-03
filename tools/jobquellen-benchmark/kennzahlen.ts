import { gruppiere, type Gruppe } from "./duplikate";
import { bewerte, ortBefund } from "./vorfilter";
import type { Abruf, BenchJob, BenchProfil, Quelle, Relevanz } from "./typen";
import { QUELLEN } from "./typen";

const RANG: Record<Relevanz, number> = { relevant: 2, unklar: 1, unpassend: 0 };

/** Beste Einstufung innerhalb einer Gruppe (eine passende Anzeige reicht). */
export function gruppenRelevanz(g: Gruppe, profil: BenchProfil): Relevanz {
  return g.jobs.map((j) => bewerte(j, profil)).reduce<Relevanz>((a, b) => (RANG[b] > RANG[a] ? b : a), "unpassend");
}

export type QuellenZahlen = {
  anfragen: number;
  anfragenFehler: number;
  detailAbrufe: number;
  anzeigen: number;
  /** Anzeigen ohne Mehrfachtreffer derselben ID (Basis für alle Anteile) */
  anzeigenEindeutig: number;
  eindeutig: number;
  ueberschneidungBa: number;
  zusaetzlich: number;
  zusaetzlichRelevant: number;
  zusaetzlichUnklar: number;
  mitBeschreibung: number;
  mitGehalt: number;
  mitRemoteInfo: number;
  ortPasst: number;
  hoechstens7Tage: number;
  mitDatum: number;
  medianAlterTage: number | null;
  direkterArbeitgeberLink: number;
  plattformen: Array<{ name: string; anzahl: number }>;
};

export type Inkrement = {
  nurGoogle: { alle: number; relevant: number; unklar: number };
  nurAdzuna: { alle: number; relevant: number; unklar: number };
  beideOhneBa: { alle: number; relevant: number; unklar: number };
  kombiniert: { alle: number; relevant: number; unklar: number };
};

export type ProfilErgebnis = {
  profil: string;
  modus: "streng" | "weit";
  stellen: number;
  unklarePaare: number;
  quellen: Record<Quelle, QuellenZahlen>;
  inkrement: Inkrement;
  /** neue relevante Stellen je Suchbegriff (welche Berufsgruppen profitieren) */
  jeBegriff: Array<{ begriff: string; google: number; adzuna: number }>;
};

const tageAlt = (iso: string | null, jetzt: number) => (iso ? (jetzt - new Date(iso).getTime()) / 864e5 : null);

function median(werte: number[]): number | null {
  if (!werte.length) return null;
  const s = [...werte].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

const zaehle = (gruppen: Gruppe[], profil: BenchProfil, pruef: (g: Gruppe) => boolean) => {
  const treffer = gruppen.filter(pruef);
  const rel = treffer.map((g) => gruppenRelevanz(g, profil));
  return { alle: treffer.length, relevant: rel.filter((r) => r === "relevant").length, unklar: rel.filter((r) => r === "unklar").length };
};

export function berechne(profil: BenchProfil, jobs: BenchJob[], abrufe: Abruf[], modus: "streng" | "weit", jetzt = Date.now()): ProfilErgebnis {
  const eigene = jobs.filter((j) => j.profile_id === profil.id);
  const { gruppen, unklarePaare } = gruppiere(eigene, modus);
  const quellen = {} as Record<Quelle, QuellenZahlen>;

  for (const q of QUELLEN) {
    const anzeigen = eigene.filter((j) => j.source === q);
    const eindeutigeAnzeigen = new Map(anzeigen.map((j) => [j.source_id, j]));
    const liste = [...eindeutigeAnzeigen.values()];
    const mit = gruppen.filter((g) => g.quellen.has(q));
    const zusaetzlich = q === "ba" ? [] : mit.filter((g) => !g.quellen.has("ba"));
    const relevanz = zusaetzlich.map((g) => gruppenRelevanz(g, profil));
    const alter = liste.map((j) => tageAlt(j.published_at, jetzt)).filter((t): t is number => t !== null);
    const plattformen = new Map<string, number>();
    for (const j of liste) if (j.via) plattformen.set(j.via, (plattformen.get(j.via) ?? 0) + 1);
    const eigeneAbrufe = abrufe.filter((a) => a.quelle === q && a.profil === profil.id);
    quellen[q] = {
      anfragen: eigeneAbrufe.filter((a) => a.art === "suche").length,
      anfragenFehler: eigeneAbrufe.filter((a) => a.art === "suche" && !a.ok).length,
      detailAbrufe: eigeneAbrufe.filter((a) => a.art === "detail").length,
      anzeigen: anzeigen.length,
      anzeigenEindeutig: liste.length,
      eindeutig: mit.length,
      ueberschneidungBa: q === "ba" ? mit.length : mit.filter((g) => g.quellen.has("ba")).length,
      zusaetzlich: zusaetzlich.length,
      zusaetzlichRelevant: relevanz.filter((r) => r === "relevant").length,
      zusaetzlichUnklar: relevanz.filter((r) => r === "unklar").length,
      mitBeschreibung: liste.filter((j) => (j.description ?? "").length >= 200).length,
      mitGehalt: liste.filter((j) => j.salary).length,
      mitRemoteInfo: liste.filter((j) => j.remote !== null).length,
      ortPasst: liste.filter((j) => ["passt", "remote"].includes(ortBefund(j, profil))).length,
      hoechstens7Tage: alter.filter((t) => t <= 7).length,
      mitDatum: alter.length,
      medianAlterTage: median(alter),
      direkterArbeitgeberLink: liste.filter((j) => j.arbeitgeber_link === true).length,
      plattformen: [...plattformen.entries()].map(([name, anzahl]) => ({ name, anzahl })).sort((a, b) => b.anzahl - a.anzahl).slice(0, 8),
    };
  }

  const ohneBa = (g: Gruppe) => !g.quellen.has("ba");
  const inkrement: Inkrement = {
    nurGoogle: zaehle(gruppen, profil, (g) => ohneBa(g) && g.quellen.has("google") && !g.quellen.has("adzuna")),
    nurAdzuna: zaehle(gruppen, profil, (g) => ohneBa(g) && g.quellen.has("adzuna") && !g.quellen.has("google")),
    beideOhneBa: zaehle(gruppen, profil, (g) => ohneBa(g) && g.quellen.has("adzuna") && g.quellen.has("google")),
    kombiniert: zaehle(gruppen, profil, (g) => ohneBa(g) && (g.quellen.has("adzuna") || g.quellen.has("google"))),
  };

  const begriffe = new Map<string, { google: number; adzuna: number }>();
  for (const g of gruppen) {
    if (!ohneBa(g) || gruppenRelevanz(g, profil) !== "relevant") continue;
    for (const q of ["google", "adzuna"] as const) {
      const j = g.jobs.find((x) => x.source === q);
      if (!j) continue;
      const e = begriffe.get(j.suchbegriff) ?? { google: 0, adzuna: 0 };
      e[q] += 1;
      begriffe.set(j.suchbegriff, e);
    }
  }

  return {
    profil: profil.id,
    modus,
    stellen: gruppen.length,
    unklarePaare,
    quellen,
    inkrement,
    jeBegriff: [...begriffe.entries()].map(([begriff, v]) => ({ begriff, ...v })).sort((a, b) => b.google + b.adzuna - (a.google + a.adzuna)),
  };
}

/** Neue, wahrscheinlich relevante Stellen je kontingentpflichtiger Anfrage. */
export function ertragProAnfrage(e: ProfilErgebnis, q: "google" | "adzuna"): number | null {
  const n = e.quellen[q].anfragen - e.quellen[q].anfragenFehler;
  return n > 0 ? e.quellen[q].zusaetzlichRelevant / n : null;
}
