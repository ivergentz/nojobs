/**
 * Suchpflege: Welche Suchbegriffe liefern Stellen, die am Ende „Bewerben“ oder „Anschauen“ werden?
 * Einmal im Monat schlägt nojobs vor, Begriffe abzustellen oder hinzuzufügen — nur der Betreiber
 * sieht das und entscheidet. Nichts ändert sich ohne seine Bestätigung.
 *
 * Gespeichert wird pro Profil in profiles.einstellungen.suchpflege (keine Schemaänderung).
 *   - Dein Profil: Abweichungen von den Listen im Code (SUCHBEGRIFFE, GOOGLE_SUCHEN).
 *     Ohne Eintrag gilt exakt die Liste aus dem Code — der Import verhält sich wie bisher.
 *   - Weitere Profile: Änderungen gehen direkt in profiles.suchbegriffe.
 */

import { SUCHBEGRIFFE } from "./normalize-de";
import { GOOGLE_SUCHEN } from "./sources/aggregatoren";
import { BEWORBEN_STATUS } from "./firma";

export const FENSTER_TAGE = 60;
export const RHYTHMUS_TAGE = 30;
export const ABLEHNUNG_GILT_TAGE = 90;
/** Google kostet Kontingent: nie mehr Suchen als heute (7 × 30 ≈ 210 von 250 im Monat). */
export const GOOGLE_MAX = GOOGLE_SUCHEN.length;
export const PROFIL_BEGRIFFE_MAX = 15;
const BA_NEU_MAX = 10;
const MIN_BEGRIFFE = 3;

export type Art = "ba" | "google" | "profil";
export type Aktion = "aus" | "neu";
export type Vorschlag = { art: Art; aktion: Aktion; begriff: string; grund: string };

export type Suchpflege = {
  ba_aus?: string[];
  ba_neu?: string[];
  google_aus?: string[];
  google_neu?: string[];
  entschieden_am?: string;
  /** Schlüssel art:aktion:begriff → Datum der Ablehnung */
  abgelehnt?: Record<string, string>;
  verlauf?: Array<{ am: string; angenommen: string[]; abgelehnt: string[] }>;
};

const liste = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string" && x.trim().length > 0).map((x) => x.trim()) : []);
const klein = (s: string) => s.toLocaleLowerCase("de-DE");

export function pflegeAus(einstellungen: unknown): Suchpflege {
  const roh = (einstellungen && typeof einstellungen === "object" ? (einstellungen as Record<string, unknown>).suchpflege : null) as Record<string, unknown> | null;
  if (!roh || typeof roh !== "object") return {};
  const abgelehnt: Record<string, string> = {};
  if (roh.abgelehnt && typeof roh.abgelehnt === "object") for (const [k, v] of Object.entries(roh.abgelehnt as Record<string, unknown>)) if (typeof v === "string") abgelehnt[k] = v;
  return {
    ba_aus: liste(roh.ba_aus),
    ba_neu: liste(roh.ba_neu),
    google_aus: liste(roh.google_aus),
    google_neu: liste(roh.google_neu),
    entschieden_am: typeof roh.entschieden_am === "string" ? roh.entschieden_am : undefined,
    abgelehnt,
    verlauf: Array.isArray(roh.verlauf) ? (roh.verlauf as Suchpflege["verlauf"]) : [],
  };
}

/** BA-Suchbegriffe für dein Profil. Ohne Pflege-Eintrag: genau SUCHBEGRIFFE. */
export function aktiveBaBegriffe(p: Suchpflege = {}): string[] {
  const aus = new Set((p.ba_aus ?? []).map(klein));
  const basis = SUCHBEGRIFFE.filter((b) => !aus.has(klein(b)));
  const da = new Set(basis.map(klein));
  const neu = (p.ba_neu ?? []).filter((b) => !aus.has(klein(b)) && !da.has(klein(b))).slice(0, BA_NEU_MAX);
  return [...basis, ...neu];
}

/** Google-Suchen für dein Profil. Ohne Pflege-Eintrag: genau GOOGLE_SUCHEN. Nie mehr als GOOGLE_MAX. */
export function aktiveGoogleSuchen(p: Suchpflege = {}): Array<{ q: string; location: string }> {
  const aus = new Set((p.google_aus ?? []).map(klein));
  const basis = GOOGLE_SUCHEN.filter((s) => !aus.has(klein(s.q)));
  const da = new Set(basis.map((s) => klein(s.q)));
  const neu = (p.google_neu ?? []).filter((q) => !aus.has(klein(q)) && !da.has(klein(q))).map((q) => ({ q, location: "Hamburg, Germany" }));
  return [...basis, ...neu].slice(0, GOOGLE_MAX);
}

/* -------------------------------------------------------------- Leistung */

export type Zeile = {
  source: string | null;
  match_term: string | null;
  suche: string | null;
  title: string | null;
  eval_fit: string | null;
  label: string | null;
  app_status: string | null;
  imported_at: string | null;
};

export type Leistung = {
  art: Art | "info";
  begriff: string;
  stellen: number;
  bewertet: number;
  bewerben: number;
  anschauen: number;
  aussortiert: number;
  positiv: number;
  gemerkt: number;
  /** ältester Eintrag in diesem Topf — wie lange schon gemessen wird */
  seit: string | null;
};

const INFO_QUELLEN: Record<string, string> = { arbeitnow: "Arbeitnow (ohne Suchbegriff)", ats: "Karriereseiten (ohne Suchbegriff)", manuell: "Manuell hinzugefügt" };

/** Ordnet eine Stelle dem Suchbegriff zu, über den sie kam. */
export function zuordnen(z: Zeile, profil: { slug: string; rolle: "admin" | "nutzer"; begriffe: string[] }): { art: Leistung["art"]; begriff: string } | null {
  const mt = z.match_term ?? "";
  if (profil.rolle === "nutzer") {
    const praefix = `profil:${profil.slug}:`;
    if (mt.startsWith(praefix)) return { art: "profil", begriff: mt.slice(praefix.length) };
    const titel = klein(z.title ?? "");
    const b = profil.begriffe.find((x) => titel.includes(klein(x)));
    return b ? { art: "profil", begriff: b } : null;
  }
  if (z.source === "google") return { art: z.suche ? "google" : "info", begriff: z.suche ?? "Google (vor der Aufzeichnung)" };
  if (z.source === "ba") {
    const begriff = mt.includes(":") ? mt.slice(mt.indexOf(":") + 1) : "";
    return begriff ? { art: "ba", begriff } : null;
  }
  if (z.source && INFO_QUELLEN[z.source]) return { art: "info", begriff: INFO_QUELLEN[z.source] };
  return null;
}

const gemerktOderBeworben = (s: string | null) => s === "interessant" || (s !== null && BEWORBEN_STATUS.includes(s));

export function werteAus(zeilen: Zeile[], profil: { slug: string; rolle: "admin" | "nutzer"; begriffe: string[]; googleSuchen?: string[] }): Leistung[] {
  const toepfe = new Map<string, Leistung>();
  const topf = (art: Leistung["art"], begriff: string) => {
    const k = `${art}:${klein(begriff)}`;
    let t = toepfe.get(k);
    if (!t) {
      t = { art, begriff, stellen: 0, bewertet: 0, bewerben: 0, anschauen: 0, aussortiert: 0, positiv: 0, gemerkt: 0, seit: null };
      toepfe.set(k, t);
    }
    return t;
  };
  // Aktive Begriffe auch dann zeigen, wenn sie nichts geliefert haben
  for (const b of profil.begriffe) topf(profil.rolle === "admin" ? "ba" : "profil", b);
  for (const q of profil.googleSuchen ?? []) topf("google", q);
  for (const z of zeilen) {
    const ziel = zuordnen(z, profil);
    if (!ziel) continue;
    const t = topf(ziel.art, ziel.begriff);
    t.stellen += 1;
    if (z.imported_at && (!t.seit || z.imported_at < t.seit)) t.seit = z.imported_at;
    if (z.eval_fit) {
      t.bewertet += 1;
      if (z.eval_fit === "must_apply") t.bewerben += 1;
      else if (z.eval_fit === "worth_reading") t.anschauen += 1;
      else t.aussortiert += 1;
    }
    if (z.label === "must_apply" || z.label === "worth_reading") t.positiv += 1;
    if (gemerktOderBeworben(z.app_status)) t.gemerkt += 1;
  }
  const rang = (l: Leistung) => l.bewerben * 3 + l.anschauen + l.positiv * 2 + l.gemerkt * 3;
  return [...toepfe.values()].sort((a, b) => (a.art === "info" ? 1 : 0) - (b.art === "info" ? 1 : 0) || rang(b) - rang(a) || b.stellen - a.stellen);
}

/* ---------------------------------------------------------- Vorschläge */

const STOPP = new Set(
  "m w d f x all alle gender genders divers und oder der die das den dem des für fur im in an am mit von vom zur zum bei als auf aus ab bis sowie senior junior lead head leitung leiter leiterin teamleitung mitarbeiter mitarbeiterin mitarbeitende team stelle job jobs hamburg remote homeoffice home office hybrid deutschland germany teilzeit vollzeit befristet unbefristet ab sofort neu gesucht bereich abteilung gmbh de en and or of the for to with".split(" ")
);

function woerter(titel: string): string[] {
  return klein(titel)
    .replace(/\((?:[mwdfx]\s*[\/|,]\s*){1,3}[mwdfx]\)/g, " ")
    .replace(/(\w)(?:\/|:|\*|_)(?:innen|in)\b/g, "$1")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w.length >= 3 && !STOPP.has(w));
}

export type GuteStelle = { title: string; abgedeckt: boolean };

/** Wörter und Wortfolgen (bis 3 Wörter), die in guten Stellen oft vorkommen, aber von keinem Begriff gesucht werden. */
export function neueBegriffe(gute: GuteStelle[], aktive: string[], min = 2, max = 3): Array<{ begriff: string; anzahl: number }> {
  const aktiv = aktive.map(klein);
  const zaehler = new Map<string, { anzahl: number; original: string }>();
  for (const g of gute) {
    if (g.abgedeckt) continue;
    const w = woerter(g.title);
    const kandidaten = new Set<string>();
    for (let i = 0; i < w.length; i++) {
      if (w[i].length >= 6) kandidaten.add(w[i]);
      if (i + 1 < w.length) kandidaten.add(`${w[i]} ${w[i + 1]}`);
      if (i + 2 < w.length) kandidaten.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
    }
    for (const k of kandidaten) {
      if (aktiv.some((a) => a.includes(k) || k.includes(a))) continue;
      const e = zaehler.get(k) ?? { anzahl: 0, original: k };
      e.anzahl += 1;
      zaehler.set(k, e);
    }
  }
  const sortiert = [...zaehler.entries()].filter(([, v]) => v.anzahl >= min).sort((a, b) => b[1].anzahl - a[1].anzahl || b[0].length - a[0].length);
  // Bei gleicher Häufigkeit gewinnt die längere Wortfolge (spezifischer), Überlappungen fallen weg
  const ergebnis: Array<{ begriff: string; anzahl: number }> = [];
  for (const [k, v] of sortiert) {
    if (ergebnis.some((e) => e.begriff.includes(k) || k.includes(e.begriff))) continue;
    ergebnis.push({ begriff: k.replace(/\b\p{L}/gu, (c) => c.toLocaleUpperCase("de-DE")), anzahl: v.anzahl });
    if (ergebnis.length >= max) break;
  }
  return ergebnis;
}

export function istAbgelehnt(p: Suchpflege, v: Pick<Vorschlag, "art" | "aktion" | "begriff">, jetzt = Date.now()): boolean {
  const am = p.abgelehnt?.[schluessel(v)];
  return Boolean(am && jetzt - new Date(am).getTime() < ABLEHNUNG_GILT_TAGE * 864e5);
}

export const schluessel = (v: Pick<Vorschlag, "art" | "aktion" | "begriff">) => `${v.art}:${v.aktion}:${klein(v.begriff)}`;

const tageSeit = (iso: string | null, jetzt: number) => (iso ? (jetzt - new Date(iso).getTime()) / 864e5 : 0);

/**
 * Regeln (bewusst vorsichtig):
 *   abstellen  ≥ 10 bewertete Stellen in 60 Tagen, keine davon Bewerben/Anschauen, nichts positiv gelabelt, nichts gemerkt
 *              · oder: keine einzige Stelle, obwohl seit mindestens 30 Tagen gemessen wird
 *              · nie so viele, dass weniger als 3 Begriffe übrig bleiben
 *   hinzufügen Wortpaar/Wort aus mindestens 2 guten Stellen, die kein aktiver Begriff abdeckt
 *              · Google nur, wenn dafür ein Platz frei wird (Kontingent)
 */
export function schlageVor(
  leistung: Leistung[],
  profil: { rolle: "admin" | "nutzer"; begriffe: string[]; googleSuchen: string[] },
  gute: GuteStelle[],
  pflege: Suchpflege,
  messbeginn: string | null,
  jetzt = Date.now()
): Vorschlag[] {
  const v: Vorschlag[] = [];
  const lange = tageSeit(messbeginn, jetzt) >= 30;
  const abstellbar = (art: Art, aktive: string[]) => {
    const kandidaten = leistung
      .filter((l) => l.art === art && aktive.some((a) => klein(a) === klein(l.begriff)))
      .filter((l) => {
        const nichts = l.bewerben + l.anschauen + l.positiv + l.gemerkt === 0;
        if (l.bewertet >= 10 && nichts) return true;
        if (l.stellen === 0 && (art === "google" ? tageSeit(l.seit ?? googleBeginn(leistung), jetzt) >= 30 : lange)) return true;
        return false;
      })
      .sort((a, b) => b.bewertet - a.bewertet);
    const erlaubt = Math.max(0, aktive.length - MIN_BEGRIFFE);
    return kandidaten.slice(0, erlaubt).map<Vorschlag>((l) => ({
      art,
      aktion: "aus",
      begriff: l.begriff,
      grund: l.stellen === 0 ? `hat in ${FENSTER_TAGE} Tagen keine Stelle geliefert` : `${l.bewertet} Stellen bewertet, keine davon „Bewerben“ oder „Anschauen“`,
    }));
  };

  if (profil.rolle === "admin") {
    v.push(...abstellbar("ba", profil.begriffe));
    const googleAus = abstellbar("google", profil.googleSuchen);
    v.push(...googleAus);
    const neu = neueBegriffe(gute, [...profil.begriffe, ...profil.googleSuchen]);
    for (const n of neu) v.push({ art: "ba", aktion: "neu", begriff: n.begriff, grund: `steckt in ${n.anzahl} guten Stellen, die kein Suchbegriff findet` });
    const frei = GOOGLE_MAX - profil.googleSuchen.length + googleAus.length;
    for (const n of neu.slice(0, Math.max(0, frei))) v.push({ art: "google", aktion: "neu", begriff: n.begriff, grund: `als Ersatz: steckt in ${n.anzahl} guten Stellen` });
  } else {
    v.push(...abstellbar("profil", profil.begriffe));
    const platz = PROFIL_BEGRIFFE_MAX - profil.begriffe.length + v.length;
    for (const n of neueBegriffe(gute, profil.begriffe).slice(0, Math.max(0, platz)))
      v.push({ art: "profil", aktion: "neu", begriff: n.begriff, grund: `steckt in ${n.anzahl} guten Stellen, die kein Suchbegriff findet` });
  }
  return v.filter((x) => !istAbgelehnt(pflege, x, jetzt));
}

function googleBeginn(leistung: Leistung[]): string | null {
  const seit = leistung.filter((l) => l.art === "google" && l.seit).map((l) => l.seit as string).sort();
  return seit[0] ?? null;
}

export function faellig(p: Suchpflege, jetzt = Date.now()): boolean {
  return !p.entschieden_am || jetzt - new Date(p.entschieden_am).getTime() >= RHYTHMUS_TAGE * 864e5;
}

/* --------------------------------------------------------- Übernehmen */

export type Entscheidung = { annehmen: Array<Pick<Vorschlag, "art" | "aktion" | "begriff">>; ablehnen: Array<Pick<Vorschlag, "art" | "aktion" | "begriff">> };

/**
 * Wendet bestätigte Vorschläge an. Rein — schreibt nichts, gibt die neuen Werte zurück.
 * Dein Profil: nur die Abweichungslisten. Weitere Profile: die neue Suchbegriff-Liste.
 */
export function wendeAn(
  rolle: "admin" | "nutzer",
  pflege: Suchpflege,
  suchbegriffe: string[],
  e: Entscheidung,
  jetzt = new Date()
): { pflege: Suchpflege; suchbegriffe: string[]; angenommen: string[]; fehler: string[] } {
  const p: Suchpflege = { ...pflege, ba_aus: [...(pflege.ba_aus ?? [])], ba_neu: [...(pflege.ba_neu ?? [])], google_aus: [...(pflege.google_aus ?? [])], google_neu: [...(pflege.google_neu ?? [])], abgelehnt: { ...(pflege.abgelehnt ?? {}) } };
  let begriffe = [...suchbegriffe];
  const angenommen: string[] = [];
  const fehler: string[] = [];
  const ohne = (l: string[], b: string) => l.filter((x) => klein(x) !== klein(b));
  const hat = (l: string[], b: string) => l.some((x) => klein(x) === klein(b));

  for (const a of e.annehmen) {
    const b = a.begriff.trim().slice(0, 60);
    if (!b) continue;
    if (rolle === "admin" && a.art === "ba") {
      if (a.aktion === "aus") {
        if (hat(p.ba_neu!, b)) p.ba_neu = ohne(p.ba_neu!, b);
        else if (hat(SUCHBEGRIFFE, b) && !hat(p.ba_aus!, b)) p.ba_aus!.push(b);
      } else if (!hat(aktiveBaBegriffe(p), b)) {
        p.ba_aus = ohne(p.ba_aus!, b);
        if (!hat(SUCHBEGRIFFE, b)) {
          if (p.ba_neu!.length >= BA_NEU_MAX) { fehler.push(`„${b}“: höchstens ${BA_NEU_MAX} eigene BA-Begriffe`); continue; }
          p.ba_neu!.push(b);
        }
      }
    } else if (rolle === "admin" && a.art === "google") {
      if (a.aktion === "neu") continue; // kommt unten, nach allen Abgängen
      if (hat(p.google_neu!, b)) p.google_neu = ohne(p.google_neu!, b);
      else if (GOOGLE_SUCHEN.some((s) => klein(s.q) === klein(b)) && !hat(p.google_aus!, b)) p.google_aus!.push(b);
    } else if (rolle === "nutzer" && a.art === "profil") {
      if (a.aktion === "aus") begriffe = ohne(begriffe, b);
      else if (!hat(begriffe, b)) {
        if (begriffe.length >= PROFIL_BEGRIFFE_MAX) { fehler.push(`„${b}“: höchstens ${PROFIL_BEGRIFFE_MAX} Suchbegriffe`); continue; }
        begriffe.push(b);
      }
    } else {
      fehler.push(`„${b}“: passt nicht zu diesem Profil`);
      continue;
    }
    angenommen.push(schluessel({ ...a, begriff: b }));
  }
  // Google-Zugänge erst nach den Abgängen — so zählt ein frei gewordener Platz.
  for (const a of e.annehmen.filter((x) => rolle === "admin" && x.art === "google" && x.aktion === "neu")) {
    const b = a.begriff.trim().slice(0, 60);
    if (!b || aktiveGoogleSuchen(p).some((s) => klein(s.q) === klein(b))) continue;
    if (aktiveGoogleSuchen(p).length >= GOOGLE_MAX) {
      fehler.push(`„${b}“: kein Google-Platz frei (höchstens ${GOOGLE_MAX} Suchen pro Tag)`);
      continue;
    }
    if (GOOGLE_SUCHEN.some((s) => klein(s.q) === klein(b))) p.google_aus = ohne(p.google_aus!, b);
    else p.google_neu!.push(b);
    angenommen.push(schluessel({ ...a, begriff: b }));
  }
  if (rolle === "admin" && aktiveBaBegriffe(p).length < MIN_BEGRIFFE) fehler.push("Es müssen mindestens 3 BA-Begriffe bleiben.");
  if (rolle === "nutzer" && begriffe.length < 1) fehler.push("Es muss mindestens ein Suchbegriff bleiben.");

  const ablehnen = e.ablehnen.map((x) => schluessel(x));
  for (const k of ablehnen) p.abgelehnt![k] = jetzt.toISOString();
  p.entschieden_am = jetzt.toISOString();
  p.verlauf = [{ am: jetzt.toISOString(), angenommen, abgelehnt: ablehnen }, ...(pflege.verlauf ?? [])].slice(0, 20);
  return { pflege: p, suchbegriffe: begriffe, angenommen, fehler };
}

/* ------------------------------------------------------------ Lesen */

type Db = { from: (tabelle: string) => any };

/** Pflege-Stand eines Profils. Bei jedem Fehler: leer — der Import nutzt dann die Listen aus dem Code. */
export async function ladePflege(db: Db, slug: string): Promise<Suchpflege> {
  try {
    const { data, error } = await db.from("profiles").select("einstellungen").eq("slug", slug).maybeSingle();
    if (error || !data) return {};
    return pflegeAus(data.einstellungen);
  } catch {
    return {};
  }
}
