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
  email?: string | null;
  aktiv?: boolean;
  suchbegriffe?: string[];
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
      .select("slug,name,rolle,profiltext,regeln,email,aktiv,suchbegriffe")
      .order("created_at", { ascending: true });
    if (error) return { profile: [], fehler: error.message };
    return {
      profile: ((data ?? []) as Record<string, unknown>[]).map((row) => ({
        slug: String(row.slug),
        name: String(row.name ?? row.slug),
        rolle: row.rolle === "admin" ? "admin" : "nutzer",
        email: typeof row.email === "string" ? row.email : null,
        aktiv: row.aktiv !== false,
        suchbegriffe: Array.isArray(row.suchbegriffe) ? (row.suchbegriffe as unknown[]).filter((x): x is string => typeof x === "string") : [],
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

/* ---------- Schritt 2.1: Profile anlegen und verwalten ---------- */

/** Kurzer, eindeutiger Schlüssel aus dem Namen: „Anna Müller“ → „anna-mueller“. */
export function slugAus(name: string): string {
  const basis = name
    .toLowerCase()
    .replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .normalize("NFKD").replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 30)
    .replace(/-+$/g, "");
  return basis || "profil";
}

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type NeuesProfil = { name: string; email?: string | null };

export async function erstelleProfil(
  db: Db,
  eingabe: NeuesProfil
): Promise<{ ok: true; slug: string } | { ok: false; fehler: string }> {
  const name = (eingabe.name ?? "").trim().slice(0, 80);
  const email = (eingabe.email ?? "").trim().toLowerCase().slice(0, 160) || null;
  if (name.length < 2) return { ok: false, fehler: "Bitte einen Namen angeben." };
  if (email && !EMAIL.test(email)) return { ok: false, fehler: "Die E-Mail-Adresse sieht nicht gültig aus." };

  const basis = slugAus(name);
  const { data: vorhanden, error: leseFehler } = await db.from("profiles").select("slug,email").limit(1000);
  if (leseFehler) return { ok: false, fehler: leseFehler.message };
  const zeilen = (vorhanden ?? []) as Array<{ slug: string; email: string | null }>;
  if (email && zeilen.some((z) => (z.email ?? "").toLowerCase() === email)) {
    return { ok: false, fehler: "Für diese E-Mail-Adresse gibt es schon ein Profil." };
  }
  const belegt = new Set(zeilen.map((z) => z.slug));
  let slug = basis;
  for (let n = 2; belegt.has(slug); n++) slug = `${basis}-${n}`;

  const { error } = await db.from("profiles").insert({ slug, name, email, rolle: "nutzer", aktiv: true });
  if (error) return { ok: false, fehler: error.message };
  return { ok: true, slug };
}

export async function setzeAktiv(
  db: Db,
  slug: string,
  aktiv: boolean
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  if (slug === STANDARD_SLUG) return { ok: false, fehler: "Dein eigenes Profil lässt sich nicht deaktivieren." };
  const { error } = await db
    .from("profiles")
    .update({ aktiv, updated_at: new Date().toISOString() })
    .eq("slug", slug)
    .neq("rolle", "admin");
  if (error) return { ok: false, fehler: error.message };
  return { ok: true };
}

/* ---------- Schritt 2.2: Suchprofil weiterer Personen ---------- */

export type ProfilVoll = Profil & { id: string | null; suchbegriffe: string[] };

export async function ladeProfilVoll(db: Db, slug: string): Promise<ProfilVoll | null> {
  try {
    const { data, error } = await db
      .from("profiles")
      .select("id,slug,name,rolle,profiltext,regeln,email,aktiv,suchbegriffe")
      .eq("slug", slug)
      .maybeSingle();
    if (error || !data) return null;
    return {
      id: (data.id as string) ?? null,
      slug: String(data.slug),
      name: String(data.name ?? slug),
      rolle: data.rolle === "admin" ? "admin" : "nutzer",
      email: (data.email as string) ?? null,
      aktiv: data.aktiv !== false,
      profiltext: leer(data.profiltext),
      regeln: leer(data.regeln),
      suchbegriffe: Array.isArray(data.suchbegriffe)
        ? (data.suchbegriffe as unknown[]).filter((s): s is string => typeof s === "string" && s.trim() !== "")
        : [],
      ausDatenbank: true,
    };
  } catch {
    return null;
  }
}

/** Suchbegriffe aus einer Eingabe „Erzieherin, Kita-Leitung; Pädagogin“ → bereinigte Liste. */
export function suchbegriffeAus(text: string): string[] {
  const gesehen = new Set<string>();
  return text
    .split(/[,;\n]+/)
    .map((s) => s.trim().replace(/[%*(),."]/g, " ").replace(/\s+/g, " ").trim())
    .filter((s) => s.length >= 2 && s.length <= 60)
    .filter((s) => (gesehen.has(s.toLowerCase()) ? false : (gesehen.add(s.toLowerCase()), true)))
    .slice(0, 25);
}

export async function aktualisiereSuchprofil(
  db: Db,
  slug: string,
  eingabe: { profiltext?: string | null; regeln?: string | null; suchbegriffe?: string | null }
): Promise<{ ok: true } | { ok: false; fehler: string }> {
  if (slug === STANDARD_SLUG) return { ok: false, fehler: "Dein eigenes Profil wird hier nicht bearbeitet — es nutzt die Texte aus dem Code." };
  const felder: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (eingabe.profiltext !== undefined) felder.profiltext = (eingabe.profiltext ?? "").trim().slice(0, 6000) || null;
  if (eingabe.regeln !== undefined) felder.regeln = (eingabe.regeln ?? "").trim().slice(0, 8000) || null;
  if (eingabe.suchbegriffe !== undefined) {
    const liste = suchbegriffeAus(eingabe.suchbegriffe ?? "");
    felder.suchbegriffe = liste.length ? liste : null;
  }
  const { error } = await db.from("profiles").update(felder).eq("slug", slug).neq("rolle", "admin");
  if (error) return { ok: false, fehler: error.message };
  return { ok: true };
}
