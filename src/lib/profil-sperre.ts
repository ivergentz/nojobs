/**
 * Für Anmeldungen weiterer Personen (Proxy): ist das Profil noch nutzbar — nicht deaktiviert, nicht gelöscht?
 * Bewusst klein (nur Supabase), damit der Proxy schlank bleibt. Dein Admin-Profil fragt hier nie an.
 */
type Db = { from: (t: string) => any };

/** Für Anmeldungen: ist das Profil (noch) nutzbar? Kurz zwischengespeichert, damit nicht jede Anfrage die Datenbank fragt. */
const cache = new Map<string, { ok: boolean; bis: number }>();
export async function profilNutzbar(db: Db, slug: string): Promise<boolean> {
  const c = cache.get(slug);
  if (c && c.bis > Date.now()) return c.ok;
  try {
    const { data, error } = await db.from("profiles").select("aktiv,rolle").eq("slug", slug).maybeSingle();
    if (error) return true; // Datenbank-Problem: nicht aussperren, die Seiten zeigen dann den Fehler
    const ok = Boolean(data) && data.aktiv !== false;
    cache.set(slug, { ok, bis: Date.now() + Number(process.env.PROFIL_SPERRE_CACHE_MS ?? 30_000) });
    return ok;
  } catch {
    return true;
  }
}
