/**
 * Profil einer weiteren Person löschen (nur du, in der Steuerung).
 *
 * Gelöscht werden: Lebenslauf-Datei und Foto (Speicher), ausgelesener Lebenslauf (profile_cv),
 * alle persönlichen Stellen-Daten (matches: Bewertungen, Urteile, Status, Unterlagen, Vorbereitung),
 * Einstellungen (Fragebogen, Suchprofil, Telegram, Einwilligung …), Name und E-Mail.
 *
 * Übrig bleibt nur ein leerer Platzhalter mit dem Kürzel („gelöscht“, deaktiviert, ohne E-Mail):
 * So kann das Kürzel nie neu vergeben werden — eine alte Anmeldung der Person führt damit nie
 * in ein fremdes, neues Profil. Die Kostenzeilen (nur Beträge, kein Inhalt) bleiben für die Abrechnung.
 */

import { BUCKET } from "./lebenslauf";
import { FOTO_BUCKET } from "./foto";
import { STANDARD_SLUG } from "./profil";

type Db = any;

export type LoeschErgebnis = { ok: true; dateien: number; stellen: number } | { ok: false; fehler: string };

async function ordnerLeeren(db: Db, bucket: string, ordner: string): Promise<number> {
  const { data, error } = await db.storage.from(bucket).list(ordner, { limit: 1000 });
  if (error) {
    if (/not.?found|does not exist/i.test(error.message ?? "")) return 0; // Bucket fehlt → nichts zu löschen
    throw new Error(`Speicher ${bucket}: ${error.message}`);
  }
  const pfade = (Array.isArray(data) ? (data as Array<{ name: string }>) : []).filter((f) => f.name && f.name !== ".emptyFolderPlaceholder").map((f) => `${ordner}/${f.name}`);
  if (!pfade.length) return 0;
  const { error: weg } = await db.storage.from(bucket).remove(pfade);
  if (weg) throw new Error(`Speicher ${bucket}: ${weg.message}`);
  return pfade.length;
}

export async function loescheProfil(db: Db, slug: string, bestaetigung: string): Promise<LoeschErgebnis> {
  if (!slug || slug === STANDARD_SLUG) return { ok: false, fehler: "Dein eigenes Profil lässt sich nicht löschen." };
  const { data: p, error } = await db.from("profiles").select("id,slug,name,rolle,einstellungen").eq("slug", slug).maybeSingle();
  if (error) return { ok: false, fehler: error.message };
  if (!p) return { ok: false, fehler: "Profil nicht gefunden." };
  if (p.rolle === "admin") return { ok: false, fehler: "Admin-Profile lassen sich nicht löschen." };
  if ((p.einstellungen as Record<string, unknown> | null)?.geloescht_at) return { ok: false, fehler: "Dieses Profil ist schon gelöscht." };
  if (bestaetigung.trim() !== String(p.name).trim()) return { ok: false, fehler: `Zur Bestätigung bitte genau den Namen eintippen: ${p.name}` };

  try {
    // 1. Zuerst sperren — ab jetzt keine Anmeldung, keine Läufe, keine Seiten mehr für die Person.
    const { error: sperre } = await db.from("profiles").update({ aktiv: false, email: null }).eq("slug", slug).neq("rolle", "admin");
    if (sperre) return { ok: false, fehler: sperre.message };

    // 2. Dateien
    const dateien = (await ordnerLeeren(db, BUCKET, slug)) + (await ordnerLeeren(db, FOTO_BUCKET, slug));

    // 3. Daten
    const { error: cvFehler } = await db.from("profile_cv").delete().eq("profile_id", p.id);
    if (cvFehler && !/does not exist|schema cache/i.test(cvFehler.message)) return { ok: false, fehler: `Lebenslauf: ${cvFehler.message}` };
    const { count, error: mFehler } = await db.from("matches").delete({ count: "exact" }).eq("profile_id", p.id);
    if (mFehler && !/does not exist|schema cache/i.test(mFehler.message)) return { ok: false, fehler: `Stellen-Daten: ${mFehler.message}` };

    // 4. Platzhalter: nur das Kürzel bleibt
    const { error: rest } = await db
      .from("profiles")
      .update({ name: "Gelöscht", email: null, aktiv: false, profiltext: null, regeln: null, suchbegriffe: null, einstellungen: { geloescht_at: new Date().toISOString() }, updated_at: new Date().toISOString() })
      .eq("slug", slug)
      .neq("rolle", "admin");
    if (rest) return { ok: false, fehler: rest.message };
    return { ok: true, dateien, stellen: count ?? 0 };
  } catch (err) {
    return { ok: false, fehler: err instanceof Error ? err.message : String(err) };
  }
}

