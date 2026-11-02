/**
 * Profile — wer sucht, mit welchem Profiltext und welchen Bewertungsregeln.
 *
 * Schritt 1.1 des Mehrpersonen-Umbaus: Es gibt nur Iver. Sind Profiltext oder
 * Regeln in der Datenbank leer (Standard), gelten die Texte aus evaluate.ts —
 * die Bewertung verhält sich dann exakt wie vorher. Fehlt die Tabelle
 * (supabase/profile.sql noch nicht ausgeführt) oder ist die Datenbank kurz
 * nicht erreichbar, wird ebenfalls mit Ivers Standardprofil weitergearbeitet.
 */

export type Profil = {
  slug: string;
  name: string;
  rolle: "admin" | "nutzer";
  /** null = Standard aus dem Code */
  profiltext: string | null;
  /** null = Standard aus dem Code */
  regeln: string | null;
  /** true, wenn aus der Datenbank gelesen; false = Rückfall auf den Standard */
  ausDatenbank: boolean;
};

export const STANDARD_SLUG = "iver";

export const STANDARD_PROFIL: Profil = {
  slug: STANDARD_SLUG,
  name: "Iver Bohnes",
  rolle: "admin",
  profiltext: null,
  regeln: null,
  ausDatenbank: false,
};

type Db = { from: (tabelle: string) => any };

const leer = (wert: unknown): string | null =>
  typeof wert === "string" && wert.trim() !== "" ? wert : null;

export async function ladeProfil(db: Db, slug: string = STANDARD_SLUG): Promise<Profil> {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("slug,name,rolle,profiltext,regeln")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return { ...STANDARD_PROFIL, slug };
    return {
      slug: String(data.slug),
      name: String(data.name ?? slug),
      rolle: data.rolle === "admin" ? "admin" : "nutzer",
      profiltext: leer(data.profiltext),
      regeln: leer(data.regeln),
      ausDatenbank: true,
    };
  } catch {
    return { ...STANDARD_PROFIL, slug };
  }
}

export async function ladeProfile(db: Db): Promise<{ profile: Profil[]; fehler: string | null }> {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("slug,name,rolle,profiltext,regeln")
      .order("created_at", { ascending: true });
    if (error) return { profile: [], fehler: error.message };
    return {
      profile: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        slug: String(row.slug),
        name: String(row.name ?? row.slug),
        rolle: row.rolle === "admin" ? "admin" : "nutzer",
        profiltext: leer(row.profiltext),
        regeln: leer(row.regeln),
        ausDatenbank: true,
      })),
      fehler: null,
    };
  } catch (err) {
    return { profile: [], fehler: err instanceof Error ? err.message : String(err) };
  }
}
