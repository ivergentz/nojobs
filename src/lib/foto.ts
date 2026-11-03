/**
 * Schritt 2.5 · Passfoto weiterer Profile.
 * Zugeschnitten im Browser (4:5), gespeichert im privaten Speicher „fotos“,
 * Verweis in profiles.einstellungen.foto. Dient als Avatar und später (Phase 4) in den Unterlagen.
 */

export const FOTO_BUCKET = "fotos";
export const FOTO_MAX_BYTES = 3 * 1024 * 1024;

export type FotoVerweis = { pfad: string; typ: string; aktualisiert: string };

export function fotoAus(einstellungen: Record<string, unknown> | null | undefined): FotoVerweis | null {
  const f = (einstellungen ?? {}).foto as FotoVerweis | null | undefined;
  return f && typeof f.pfad === "string" && f.pfad ? f : null;
}

/** Bildtyp am Inhalt erkennen — nicht an Name oder Angabe des Browsers. */
export function bildtyp(kopf: Buffer): "image/jpeg" | "image/png" | "image/webp" | null {
  if (kopf.length >= 3 && kopf[0] === 0xff && kopf[1] === 0xd8 && kopf[2] === 0xff) return "image/jpeg";
  if (kopf.length >= 8 && kopf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (kopf.length >= 12 && kopf.subarray(0, 4).toString("latin1") === "RIFF" && kopf.subarray(8, 12).toString("latin1") === "WEBP") return "image/webp";
  return null;
}

/** Adresse fürs <img>: mit Versionsstempel, damit ein neues Foto sofort erscheint. */
export function fotoUrl(slug: string, foto: FotoVerweis | null): string | null {
  return foto ? `/api/foto?profil=${encodeURIComponent(slug)}&v=${encodeURIComponent(foto.aktualisiert)}` : null;
}
