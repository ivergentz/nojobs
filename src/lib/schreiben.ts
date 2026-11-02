/**
 * Schritt 2.2 · Persönliche Felder schreiben (Label, Status, Notizen, Bewertung …).
 *
 *   dein Profil ("iver") → wie bisher in jobs; der Spiegel überträgt es nach matches
 *   weitere Profile      → direkt in matches (eigene Zeile pro Profil und Stelle)
 *
 * Für dich ändert sich damit nichts: dieselbe Abfrage wie vorher.
 */

type Db = { from: (tabelle: string) => any };

const idCache = new Map<string, string>();

export async function profilId(db: Db, slug: string): Promise<string | null> {
  if (idCache.has(slug)) return idCache.get(slug)!;
  const { data } = await db.from("profiles").select("id").eq("slug", slug).maybeSingle();
  const id = (data?.id as string | undefined) ?? null;
  if (id) idCache.set(slug, id);
  return id;
}

export async function schreibeFelder(
  db: Db,
  profil: string | null | undefined,
  uuid: string,
  felder: Record<string, unknown>
): Promise<{ error: { message: string } | null }> {
  if (!profil || profil === "iver") {
    const { error } = await db.from("jobs").update(felder).eq("uuid", uuid);
    return { error: error ?? null };
  }
  const id = await profilId(db, profil);
  if (!id) return { error: { message: `Profil „${profil}“ nicht gefunden` } };
  const { error } = await db
    .from("matches")
    .upsert({ profile_id: id, job_uuid: uuid, ...felder, gespiegelt_at: new Date().toISOString() }, { onConflict: "profile_id,job_uuid" });
  return { error: error ?? null };
}
