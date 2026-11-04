import { supabaseAdmin } from "@/lib/supabase";
import { ladePflegeStand, type PflegeStand } from "@/lib/suchpflege-laden";
import SuchpflegeClient from "./SuchpflegeClient";

/**
 * Suchpflege: Leistung der Suchbegriffe je Profil (60 Tage) und der monatliche Vorschlag.
 * Nur Anzeige — geändert wird erst, wenn du einen Vorschlag bestätigst.
 */
export default async function Suchpflege() {
  let staende: PflegeStand[] = [];
  let fehler: string | null = null;
  try {
    const db = supabaseAdmin();
    const { data, error } = await db.from("profiles").select("slug,name,rolle,aktiv,suchbegriffe,einstellungen").order("created_at", { ascending: true });
    if (error) throw new Error(error.message);
    const profile = ((data ?? []) as Array<Record<string, any>>)
      .filter((p) => p.aktiv !== false && !p.einstellungen?.geloescht_at)
      .map((p) => ({
        slug: String(p.slug),
        name: String(p.name ?? p.slug),
        rolle: p.rolle === "admin" ? ("admin" as const) : ("nutzer" as const),
        suchbegriffe: Array.isArray(p.suchbegriffe) ? p.suchbegriffe.filter((x: unknown) => typeof x === "string") : [],
        einstellungen: p.einstellungen,
      }));
    staende = await Promise.all(profile.map((p) => ladePflegeStand(db, p)));
  } catch (err) {
    fehler = err instanceof Error ? err.message : String(err);
  }
  return <SuchpflegeClient staende={staende} fehler={fehler} />;
}
