/**
 * Schritt 2.7 · Import pro Profil (Arbeitsagentur) — der eigentliche Ablauf.
 * Genutzt vom nächtlichen Import (/api/import-profile) und vom Startlauf (2.8).
 * Neue Stellen bekommen import_profil = Profil-Schlüssel und erscheinen nie in deiner Inbox.
 */
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchBaDetail, searchBaAll, type BaHit } from "./ba";
import { gehaltDe, normalizeDe, titelAusgeschlossen } from "./normalize-de";
import type { ProfilVoll } from "./profil";

const DETAIL_CONCURRENCY = 6;
const MAX_NEU_PRO_LAUF = 120;

export type ImportStats = { profile: number; suchen: number; treffer: number; neu: number; bekannt: number; gespeichert: number; offen: number };

export async function importiereProfile(
  db: SupabaseClient,
  bereit: ProfilVoll[],
  optionen: { tage: number; budget: number; startedAt: number }
): Promise<{ stats: ImportStats; fehler: string[] }> {
  const { tage, budget, startedAt } = optionen;
  const stats = { profile: bereit.length, suchen: 0, treffer: 0, neu: 0, bekannt: 0, gespeichert: 0, offen: 0 };
  const fehler: string[] = [];

  for (const profil of bereit) {
    // 1. Suchen
    const kandidaten = new Map<string, { hit: BaHit; begriff: string }>();
    await Promise.all(
      profil.suchbegriffe.slice(0, 15).map(async (begriff) => {
        try {
          const { hits } = await searchBaAll({ was: begriff, tage, maxSeiten: 2, wo: profil.suchort.ort as string, umkreis: profil.suchort.umkreis });
          stats.suchen += 1;
          stats.treffer += hits.length;
          for (const hit of hits) {
            if (!hit.referenznummer || kandidaten.has(hit.referenznummer) || titelAusgeschlossen(hit)) continue;
            kandidaten.set(hit.referenznummer, { hit, begriff });
          }
        } catch (err) {
          fehler.push(`${profil.name}: ${err instanceof Error ? err.message : String(err)}`);
        }
      })
    );

    // 2. Schon vorhanden? (egal für wen importiert — eine Stelle gibt es nur einmal)
    const uuids = Array.from(kandidaten.keys()).map((ref) => `de-${ref}`);
    const bekannt = new Set<string>();
    for (let i = 0; i < uuids.length; i += 200) {
      const { data, error } = await db.from("jobs").select("uuid").in("uuid", uuids.slice(i, i + 200)).not("description", "is", null);
      if (error) throw new Error(`Bestand lesen: ${error.message}`);
      for (const row of data ?? []) bekannt.add(row.uuid as string);
    }
    stats.bekannt += bekannt.size;
    const neu = Array.from(kandidaten.values())
      .filter(({ hit }) => !bekannt.has(`de-${hit.referenznummer}`))
      .sort((a, b) => String(b.hit.datumErsteVeroeffentlichung ?? "").localeCompare(String(a.hit.datumErsteVeroeffentlichung ?? "")))
      .slice(0, MAX_NEU_PRO_LAUF);
    stats.neu += neu.length;

    // 3. Details holen und speichern, solange Zeit ist
    let verarbeitet = 0;
    for (let i = 0; i < neu.length; i += DETAIL_CONCURRENCY) {
      if (Date.now() - startedAt > budget) break;
      const block = neu.slice(i, i + DETAIL_CONCURRENCY);
      const rows = await Promise.all(
        block.map(async ({ hit, begriff }) => {
          const detail = await fetchBaDetail(hit.referenznummer as string);
          const gehalt = gehaltDe(hit);
          return {
            ...normalizeDe(hit, detail, `profil:${profil.slug}:${begriff}`),
            salary_min_nok: gehalt.min,
            salary_max_nok: gehalt.max,
            salary_note: gehalt.note,
            import_profil: profil.slug,
          };
        })
      );
      // ignoreDuplicates: hat deine Suche die Stelle inzwischen selbst geholt, bleibt sie deine.
      const { error } = await db.from("jobs").upsert(rows, { onConflict: "uuid", ignoreDuplicates: true });
      if (error) throw new Error(`Jobs schreiben: ${error.message}`);
      stats.gespeichert += rows.length;
      verarbeitet += block.length;
    }
    stats.offen += neu.length - verarbeitet;
  }

  return { stats, fehler };
}
