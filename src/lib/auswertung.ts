/**
 * Auswertung pro Profil (nur für den Betreiber): Was ist in den letzten Wochen
 * bei einer Person angekommen und was hat sie damit gemacht?
 *
 * Reine Lesezugriffe über lesen() — dein Profil aus jobs_sicht, weitere Profile
 * aus jobs_profil (persönliche Spalten aus matches). Keine Schemaänderung.
 */

import { lesen } from "./lesen";
import { BEWORBEN_STATUS } from "./firma";

export const WOCHEN = 8;
const SEITE = 1000;
const MAX_SEITEN = 10;

export type AuswertungZeile = {
  eval_fit: string | null;
  evaluated_at: string | null;
  label: string | null;
  labeled_at: string | null;
  app_status: string | null;
  app_status_at: string | null;
  application_drafted_at: string | null;
};

export type Auswertung = {
  bewertet: number;
  bewerben: number;
  anschauen: number;
  ignorieren: number;
  gelabelt: number;
  gemerkt: number;
  beworben: number;
  unterlagen: number;
  /** Bewertete Stellen je Woche, neueste zuerst; Index 0 = laufende Woche */
  wochen: Array<{ start: string; anzahl: number }>;
  /** true, wenn mehr Zeilen da waren, als gelesen wurden */
  abgeschnitten: boolean;
};

/** Montag 00:00 UTC der Woche, in der t liegt. */
export function wochenStart(t: Date): Date {
  const d = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate()));
  const tag = (d.getUTCDay() + 6) % 7; // Mo = 0
  d.setUTCDate(d.getUTCDate() - tag);
  return d;
}

export function seitWann(jetzt: Date = new Date()): Date {
  const start = wochenStart(jetzt);
  start.setUTCDate(start.getUTCDate() - (WOCHEN - 1) * 7);
  return start;
}

const imFenster = (wert: string | null, ab: Date) => Boolean(wert) && new Date(wert as string).getTime() >= ab.getTime();

/** Zählt nur, was im Zeitfenster passiert ist (letzte WOCHEN Wochen inkl. laufender). */
export function fasseZusammen(zeilen: AuswertungZeile[], jetzt: Date = new Date(), abgeschnitten = false): Auswertung {
  const ab = seitWann(jetzt);
  const wochen = Array.from({ length: WOCHEN }, (_, i) => {
    const s = wochenStart(jetzt);
    s.setUTCDate(s.getUTCDate() - i * 7);
    return { start: s.toISOString().slice(0, 10), anzahl: 0 };
  });
  const a: Auswertung = { bewertet: 0, bewerben: 0, anschauen: 0, ignorieren: 0, gelabelt: 0, gemerkt: 0, beworben: 0, unterlagen: 0, wochen, abgeschnitten };
  for (const z of zeilen) {
    if (imFenster(z.evaluated_at, ab) && z.eval_fit) {
      a.bewertet += 1;
      if (z.eval_fit === "must_apply") a.bewerben += 1;
      else if (z.eval_fit === "worth_reading") a.anschauen += 1;
      else a.ignorieren += 1;
      const w = wochenStart(new Date(z.evaluated_at as string)).toISOString().slice(0, 10);
      const eintrag = wochen.find((x) => x.start === w);
      if (eintrag) eintrag.anzahl += 1;
    }
    if (imFenster(z.labeled_at, ab) && z.label) a.gelabelt += 1;
    if (imFenster(z.app_status_at, ab)) {
      if (z.app_status === "interessant") a.gemerkt += 1;
      else if (z.app_status && BEWORBEN_STATUS.includes(z.app_status)) a.beworben += 1;
    }
    if (imFenster(z.application_drafted_at, ab)) a.unterlagen += 1;
  }
  return a;
}

type Db = { from: (tabelle: string) => any };

/** Liest alle Zeilen eines Profils, an denen im Zeitfenster etwas passiert ist. */
export async function ladeAuswertung(db: Db, slug: string, jetzt: Date = new Date()): Promise<Auswertung> {
  const ab = seitWann(jetzt).toISOString();
  const filter = ["evaluated_at", "labeled_at", "app_status_at", "application_drafted_at"].map((s) => `${s}.gte.${ab}`).join(",");
  const zeilen: AuswertungZeile[] = [];
  let abgeschnitten = false;
  for (let seite = 0; seite < MAX_SEITEN; seite++) {
    const { data, error } = await lesen(db, slug)
      .select("uuid,eval_fit,evaluated_at,label,labeled_at,app_status,app_status_at,application_drafted_at")
      .or(filter)
      .order("uuid", { ascending: true })
      .range(seite * SEITE, seite * SEITE + SEITE - 1);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as AuswertungZeile[];
    zeilen.push(...teil);
    if (teil.length < SEITE) break;
    if (seite === MAX_SEITEN - 1) abgeschnitten = true;
  }
  return fasseZusammen(zeilen, jetzt, abgeschnitten);
}

/** Berufskategorien nur aus aktiven Stellen der aktiven Quellen (keine Altlasten aus NO/SE). */
export function zaehleKategorien(zeilen: Array<{ occupation_level1: string | null }>): Array<{ occupation_level1: string | null; jobs: number }> {
  const m = new Map<string | null, number>();
  for (const z of zeilen) {
    const k = z.occupation_level1?.trim() || null;
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()].map(([occupation_level1, jobs]) => ({ occupation_level1, jobs })).sort((a, b) => b.jobs - a.jobs);
}

/**
 * Suchbegriffe eines weiteren Profils: wie viele aktive Stellen enthält der Titel?
 * Gleiche Regel wie kandidatenFilter() in profil.ts, plus die eigens für das Profil importierten Stellen.
 */
export async function ladeBegriffe(
  db: Db,
  slug: string,
  suchbegriffe: string[],
  quellen: readonly string[]
): Promise<Array<{ begriff: string; jobs: number }>> {
  const zaehle = async (bauen: (q: any) => any) => {
    const { count, error } = await bauen(db.from("jobs").select("uuid", { count: "exact", head: true }).eq("status", "ACTIVE").in("source", quellen as string[]));
    return error ? 0 : (count ?? 0);
  };
  const begriffe = suchbegriffe.slice(0, 25);
  const zahlen = await Promise.all(begriffe.map((b) => zaehle((q) => q.ilike("title", `%${b.replace(/[%_]/g, "")}%`))));
  const liste = begriffe.map((begriff, i) => ({ begriff, jobs: zahlen[i] }));
  const importiert = await zaehle((q) => q.eq("import_profil", slug));
  if (importiert > 0) liste.push({ begriff: "eigens für dieses Profil gesucht", jobs: importiert });
  return liste.sort((a, b) => b.jobs - a.jobs);
}
