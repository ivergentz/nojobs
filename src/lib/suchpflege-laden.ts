import { lesen } from "./lesen";
import { kandidatenFilter, STANDARD_SLUG } from "./profil";

export type PflegeProfil = { slug: string; name: string; suchbegriffe?: string[]; einstellungen?: unknown };
import { AKTIVE_QUELLEN } from "./quellen";
import {
  aktiveBaBegriffe,
  aktiveGoogleSuchen,
  faellig,
  FENSTER_TAGE,
  pflegeAus,
  schlageVor,
  werteAus,
  type Leistung,
  type Suchpflege,
  type Vorschlag,
  type Zeile,
} from "./suchpflege";

type Db = { from: (tabelle: string) => any };

export type PflegeStand = {
  slug: string;
  name: string;
  rolle: "admin" | "nutzer";
  leistung: Leistung[];
  vorschlaege: Vorschlag[];
  faellig: boolean;
  entschiedenAm: string | null;
  eigeneAenderungen: number;
  zeilen: number;
  fehler: string | null;
};

const SPALTEN = "uuid,source,match_term,suche:raw->>suche,title,eval_fit,label,app_status,imported_at";

/** Stellen der letzten 60 Tage — dein Profil aus jobs_sicht, weitere Profile ihre Kandidaten aus jobs_profil. Nur lesend. */
async function ladeZeilen(db: Db, profil: PflegeProfil, begriffe: string[]): Promise<Zeile[]> {
  const seit = new Date(Date.now() - FENSTER_TAGE * 864e5).toISOString();
  const zeilen: Zeile[] = [];
  for (let seite = 0; seite < 10; seite++) {
    let q = (profil.slug === STANDARD_SLUG ? lesen(db) : lesen(db, profil.slug)).select(SPALTEN).gte("imported_at", seit).in("source", AKTIVE_QUELLEN);
    if (profil.slug !== STANDARD_SLUG) {
      if (!begriffe.length) return [];
      q = q.or(kandidatenFilter(begriffe, profil.slug));
    }
    const { data, error } = await q.order("uuid", { ascending: true }).range(seite * 1000, seite * 1000 + 999);
    if (error) throw new Error(error.message);
    const teil = (data ?? []) as Zeile[];
    zeilen.push(...teil);
    if (teil.length < 1000) break;
  }
  return zeilen;
}

export async function ladePflegeStand(db: Db, profil: PflegeProfil): Promise<PflegeStand> {
  const admin = profil.slug === STANDARD_SLUG;
  const pflege: Suchpflege = pflegeAus(profil.einstellungen);
  const begriffe = admin ? aktiveBaBegriffe(pflege) : (profil.suchbegriffe ?? []);
  const google = admin ? aktiveGoogleSuchen(pflege).map((s) => s.q) : [];
  const basis = {
    slug: profil.slug,
    name: profil.name,
    rolle: admin ? ("admin" as const) : ("nutzer" as const),
    faellig: faellig(pflege),
    entschiedenAm: pflege.entschieden_am ?? null,
    eigeneAenderungen: (pflege.ba_aus?.length ?? 0) + (pflege.ba_neu?.length ?? 0) + (pflege.google_aus?.length ?? 0) + (pflege.google_neu?.length ?? 0),
  };
  try {
    const zeilen = await ladeZeilen(db, profil, begriffe);
    const ctx = { slug: profil.slug, rolle: basis.rolle, begriffe, googleSuchen: google };
    const leistung = werteAus(zeilen, ctx);
    const aktiv = [...begriffe, ...google].map((b) => b.toLocaleLowerCase("de-DE"));
    const gute = zeilen
      .filter((z) => z.eval_fit === "must_apply" || z.label === "must_apply" || z.label === "worth_reading" || z.app_status === "interessant" || ["beworben", "interview", "absage"].includes(z.app_status ?? ""))
      // Weitere Profile: Kandidaten sind ohnehin über die Begriffe ausgewählt — dort zählen alle guten Titel.
      .map((z) => ({ title: z.title ?? "", abgedeckt: admin && aktiv.some((a) => (z.title ?? "").toLocaleLowerCase("de-DE").includes(a)) }));
    const messbeginn = zeilen.reduce<string | null>((m, z) => (z.imported_at && (!m || z.imported_at < m) ? z.imported_at : m), null);
    const vorschlaege = schlageVor(leistung, ctx, gute, pflege, messbeginn);
    return { ...basis, leistung, vorschlaege, zeilen: zeilen.length, fehler: null };
  } catch (err) {
    return { ...basis, leistung: [], vorschlaege: [], zeilen: 0, fehler: err instanceof Error ? err.message : String(err) };
  }
}
