import type { BenchJob, DuplikatStufe, Quelle } from "./typen";

/**
 * Quellenübergreifende Duplikaterkennung für den Benchmark.
 *
 * Regeln (Signale kombiniert, nie der Titel allein):
 *   sicher          gleiche kanonische Stellen-URL (ohne Tracking-Zusätze; Startseiten und Google-Links zählen nicht)
 *                   · gleiche BA-Referenznummer in beiden Links
 *                   · gleiche Arbeitgeber-Domain + gleicher normalisierter Titel
 *                   · gleicher normalisierter Arbeitgeber + gleicher normalisierter Titel + passender Ort
 *   wahrscheinlich  Arbeitgeber sehr ähnlich (≥ 0,8; auch „CHECK24“ ↔ „CHECK24 InsurTech“) und Titel ähnlich (≥ 0,75) und Ort passt
 *                   · Arbeitgeber sehr ähnlich, Ort passt, ein Titel steckt ganz im anderen (+ max. 1 Wort,
 *                     z. B. „Koch“ ↔ „Koch / Köchin“; Risiko: „Product Owner“ ↔ „Senior Product Owner“)
 *                   · Arbeitgeber sehr ähnlich und Beschreibungen deutlich gleich (≥ 0,5)
 *   unklar          Arbeitgeber sehr ähnlich, Titel nur mäßig (0,5–0,75)
 *                   · Titel fast gleich (≥ 0,9), Arbeitgeber nur mäßig ähnlich (0,5–0,8)
 *   verschieden     alles andere — insbesondere gleicher Titel bei anderem/fehlendem Arbeitgeber
 *
 * Grenzen: Ohne Geodaten ist „Ort passt“ ein Textvergleich (Stadtname). Personalvermittler, die
 * dieselbe Stelle für verschiedene Kunden ausschreiben, sehen wie verschiedene Arbeitgeber aus.
 * Mehrere gleichnamige Stellen eines Arbeitgebers in einer Stadt werden als eine gezählt.
 */

const JOBBOERSEN = /(^|\.)(arbeitsagentur\.de|adzuna\.[a-z.]+|linkedin\.com|indeed\.[a-z.]+|stepstone\.[a-z.]+|xing\.com|glassdoor\.[a-z.]+|jooble\.[a-z.]+|kimeta\.de|jobware\.de|google\.[a-z.]+|monster\.[a-z.]+|stellenanzeigen\.de|meinestadt\.de|jobs\.de|talent\.com|jobrapido\.[a-z.]+|softgarden\.io|join\.com)$/i;

export function normTitel(t: string): string {
  return (t ?? "")
    .toLowerCase()
    .replace(/\((?:[mwdfx]\s*[\/|,]\s*){1,3}[mwdfx]\)/g, " ")
    .replace(/\b[mwd]\/[mwd]\/[mwd]\b/g, " ")
    .replace(/(\w)(?:\/|:|\*|_)innen\b/g, "$1")
    .replace(/(\w)(?:\/|:|\*|_)in\b/g, "$1")
    .replace(/(\w)innen\b/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

const RECHTSFORMEN = /\b(gmbh|ggmbh|mbh|ag|se|kg|kgaa|co|ohg|ug|e\s?v|ev|gbr|haftungsbeschränkt|inc|ltd|llc|holding|group|gruppe|deutschland|germany)\b/g;

export function normFirma(f: string): string {
  return (f ?? "")
    .toLowerCase()
    .replace(/&/g, " ")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(RECHTSFORMEN, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function kanonischeUrl(url: string | null): string | null {
  if (!url) return null;
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase().replace(/^www\./, "");
    const pfad = u.pathname.replace(/\/+$/, "");
    if (!pfad || pfad === "/") return null; // Startseiten sagen nichts
    if (/(^|\.)google\.[a-z.]+$/.test(host)) return null; // Google-Links unterscheiden sich nur in der Abfrage
    // Abfrage behalten (job?id=1 ≠ job?id=2), nur Tracking-Zusätze weglassen
    const behalten = [...u.searchParams.entries()]
      .filter(([k]) => !/^(utm_|gclid|fbclid|ref$|source$|src$|from$|trk|campaign|mc_)/i.test(k))
      .sort(([a], [b]) => a.localeCompare(b));
    const abfrage = behalten.length ? `?${new URLSearchParams(behalten).toString()}` : "";
    return `${host}${pfad}${abfrage}`.toLowerCase();
  } catch {
    return null;
  }
}

/** Domain des Arbeitgebers — nur, wenn der Link nicht auf eine Jobbörse zeigt. */
export function arbeitgeberDomain(url: string | null): string | null {
  if (!url) return null;
  try {
    const host = new URL(url).hostname.toLowerCase().replace(/^(www|jobs|karriere|career|careers)\./, "");
    if (JOBBOERSEN.test(host)) return null;
    const teile = host.split(".");
    return teile.slice(-2).join(".");
  } catch {
    return null;
  }
}

/** BA-Referenznummer aus einem Link (eigene BA-Links und Weiterleitungen darauf). */
export function baReferenz(job: Pick<BenchJob, "source" | "source_id" | "url">): string | null {
  if (job.source === "ba") return job.source_id;
  const m = (job.url ?? "").match(/arbeitsagentur\.de\/jobsuche\/jobdetail\/([^/?#]+)/i);
  return m ? decodeURIComponent(m[1]) : null;
}

export function stadt(ort: string): string {
  return (ort ?? "").split(/[,(/]/)[0].toLowerCase().replace(/\b\d{5}\b/g, "").replace(/\s+/g, " ").trim();
}

const woerter = (s: string) => new Set(s.split(" ").filter((w) => w.length > 0));

export function jaccard(a: string, b: string): number {
  if (!a || !b) return 0;
  if (a === b) return 1;
  const x = woerter(a);
  const y = woerter(b);
  if (!x.size || !y.size) return 0;
  let schnitt = 0;
  for (const w of x) if (y.has(w)) schnitt += 1;
  return schnitt / (x.size + y.size - schnitt);
}

function schindeln(text: string): Set<string> {
  const w = normTitel(text.slice(0, 2000)).split(" ");
  const s = new Set<string>();
  for (let i = 0; i + 2 < w.length; i++) s.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return s;
}

export function textAehnlichkeit(a: string | null, b: string | null): number | null {
  if (!a || !b || a.length < 200 || b.length < 200) return null;
  const x = schindeln(a);
  const y = schindeln(b);
  if (!x.size || !y.size) return null;
  let schnitt = 0;
  for (const s of x) if (y.has(s)) schnitt += 1;
  return schnitt / Math.min(x.size, y.size);
}

/**
 * Alle Ortsnamen einer Angabe: „Hammerbrook, Hamburg“ → hammerbrook, hamburg ·
 * „Hamburg-Altstadt, Hamburg“ → hamburg-altstadt, hamburg · „22880 Wedel“ → wedel.
 */
export function orte(ort: string): Set<string> {
  const teile = (ort ?? "")
    .toLowerCase()
    .replace(/\b\d{5}\b/g, " ")
    .replace(/\((kreis|landkreis)\)|\bkreis\b|\blandkreis\b/g, " ")
    .split(/[,(/)]/)
    .map((t) => t.replace(/\s+/g, " ").trim())
    .filter((t) => t && !/^(deutschland|germany)$/.test(t));
  const s = new Set<string>();
  for (const t of teile) {
    s.add(t);
    const vorne = t.split(/[-\s]/)[0];
    if (vorne.length >= 4) s.add(vorne);
  }
  return s;
}

export function ortPasst(a: BenchJob, b: BenchJob): boolean {
  const x = orte(a.location);
  const y = orte(b.location);
  if (!x.size || !y.size) return true; // fehlt einer: kein Gegenbeweis
  for (const o of x) if (y.has(o)) return true;
  return Boolean(a.remote || b.remote);
}

/**
 * Arbeitgeber-Ähnlichkeit: Wortüberschneidung — und „Jungheinrich“ ↔ „Jungheinrich Profishop“,
 * „CHECK24“ ↔ „CHECK24 InsurTech“ (alle Wörter des kürzeren Namens am Anfang des längeren) zählt als sehr ähnlich (0,85).
 */
export function firmenAehnlichkeit(fa: string, fb: string): number {
  const j = jaccard(fa, fb);
  const [k, l] = fa.length <= fb.length ? [fa, fb] : [fb, fa];
  if (k.length >= 4 && (l === k || l.startsWith(`${k} `))) return Math.max(j, 0.85);
  return j;
}

export function vergleiche(a: BenchJob, b: BenchJob): DuplikatStufe {
  const ua = kanonischeUrl(a.url);
  if (ua && ua === kanonischeUrl(b.url)) return "sicher";
  const ra = baReferenz(a);
  if (ra && ra === baReferenz(b)) return "sicher";

  const ta = normTitel(a.title);
  const tb = normTitel(b.title);
  const fa = normFirma(a.company);
  const fb = normFirma(b.company);
  const da = arbeitgeberDomain(a.url);
  if (da && da === arbeitgeberDomain(b.url) && ta && ta === tb) return "sicher";

  if (!fa || !fb) return "verschieden"; // ohne Arbeitgeber nie zusammenführen
  const firma = fa === fb ? 1 : firmenAehnlichkeit(fa, fb);
  const titel = jaccard(ta, tb);
  const ort = ortPasst(a, b);

  if (firma === 1 && ta === tb && ort) return "sicher";
  if (firma >= 0.8 && titel >= 0.75 && ort) return "wahrscheinlich";
  // „Koch“ ↔ „Koch / Köchin“: ein Titel steckt ganz im anderen, höchstens ein Wort mehr
  const wa = woerter(ta);
  const wb = woerter(tb);
  const [klein, gross] = wa.size <= wb.size ? [wa, wb] : [wb, wa];
  if (firma >= 0.8 && ort && klein.size > 0 && gross.size - klein.size <= 1 && [...klein].every((w) => gross.has(w))) return "wahrscheinlich";
  const text = textAehnlichkeit(a.description, b.description);
  if (firma >= 0.8 && text !== null && text >= 0.5) return "wahrscheinlich";
  if (firma >= 0.8 && titel >= 0.5) return "unklar";
  if (titel >= 0.9 && firma >= 0.5) return "unklar";
  return "verschieden";
}

/** Eine Gruppe = eine Stelle, ggf. aus mehreren Quellen. */
export type Gruppe = { jobs: BenchJob[]; quellen: Set<Quelle> };

/**
 * Fasst die Anzeigen eines Profils zu Stellen zusammen.
 * modus „streng“: nur sichere Duplikate · „weit“: sichere und wahrscheinliche.
 * Gleiche Quelle + gleiche ID werden vorab zusammengelegt.
 */
export function gruppiere(jobs: BenchJob[], modus: "streng" | "weit"): { gruppen: Gruppe[]; unklarePaare: number } {
  const eindeutig = new Map<string, BenchJob>();
  for (const j of jobs) if (!eindeutig.has(`${j.source}:${j.source_id}`)) eindeutig.set(`${j.source}:${j.source_id}`, j);
  const liste = [...eindeutig.values()];
  const eltern = liste.map((_, i) => i);
  const wurzel = (i: number): number => (eltern[i] === i ? i : (eltern[i] = wurzel(eltern[i])));
  let unklarePaare = 0;
  for (let i = 0; i < liste.length; i++) {
    for (let k = i + 1; k < liste.length; k++) {
      const stufe = vergleiche(liste[i], liste[k]);
      if (stufe === "unklar") unklarePaare += 1;
      if (stufe === "sicher" || (modus === "weit" && stufe === "wahrscheinlich")) eltern[wurzel(i)] = wurzel(k);
    }
  }
  const map = new Map<number, Gruppe>();
  liste.forEach((j, i) => {
    const r = wurzel(i);
    const g = map.get(r) ?? { jobs: [], quellen: new Set<Quelle>() };
    g.jobs.push(j);
    g.quellen.add(j.source);
    map.set(r, g);
  });
  return { gruppen: [...map.values()], unklarePaare };
}
