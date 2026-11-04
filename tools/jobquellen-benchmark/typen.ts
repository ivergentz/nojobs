/**
 * Jobquellen-Benchmark · gemeinsames, temporäres Format.
 * Nur für den Benchmark — hat nichts mit dem Datenbankschema von nojobs zu tun.
 */

export type Quelle = "ba" | "google" | "adzuna";
export const QUELLEN: Quelle[] = ["ba", "google", "adzuna"];
export const QUELLEN_NAME: Record<Quelle, string> = { ba: "Arbeitsagentur", google: "Google Jobs", adzuna: "Adzuna" };

export type BenchJob = {
  source: Quelle;
  source_id: string;
  title: string;
  company: string;
  location: string;
  remote: boolean | null;
  salary: string | null;
  description: string | null;
  published_at: string | null;
  url: string | null;
  /** Pseudonym des Profils (P1, P2 …) — nie Name oder Slug */
  profile_id: string;
  /** Mit welchem Suchbegriff gefunden */
  suchbegriff: string;
  /** Google: über welche Plattform (StepStone, LinkedIn …) */
  via: string | null;
  /** Google: Link direkt beim Arbeitgeber vorhanden? */
  arbeitgeber_link: boolean | null;
};

export type BenchProfil = {
  /** Pseudonym: P1, P2 … */
  id: string;
  rolle: "admin" | "nutzer";
  suchbegriffe: string[];
  ort: string | null;
  umkreis: number;
  /** aus dem Fragebogen, soweit vorhanden */
  arbeitsort: Array<"vor-ort" | "hybrid" | "remote">;
  nogos: string[];
  herkunft: "datenbank" | "datei" | "fixture";
};

export type Abruf = {
  quelle: Quelle;
  profil: string;
  suchbegriff: string;
  ok: boolean;
  anzeigen: number;
  fehler: string | null;
  /** zählt gegen ein Kontingent (SerpApi, Adzuna); BA-Details zählen nicht */
  kontingent: boolean;
  art: "suche" | "detail";
};

export type QuellenStatus = {
  quelle: Quelle;
  getestet: boolean;
  grund: string;
  /** z. B. SerpApi-Kontostand vor dem Lauf */
  kontingent: string | null;
};

export type Relevanz = "relevant" | "unklar" | "unpassend";
export type DuplikatStufe = "sicher" | "wahrscheinlich" | "unklar" | "verschieden";
