import { supabaseAdmin } from "@/lib/supabase";
import { ladeProfile } from "@/lib/profil";

/**
 * Nur lesend: welche Profile gibt es, und woher kommen Profiltext und Regeln?
 * Vorbereitung für mehrere Personen — ändert an den Läufen nichts.
 */
export default async function ProfileUebersicht() {
  let ergebnis: Awaited<ReturnType<typeof ladeProfile>>;
  try {
    ergebnis = await ladeProfile(supabaseAdmin());
  } catch (err) {
    ergebnis = { profile: [], fehler: err instanceof Error ? err.message : String(err) };
  }
  const { profile, fehler } = ergebnis;

  return (
    <section className="mt-12 border-t border-rule pt-8 text-sm">
      <h2 className="font-semibold">Profile</h2>
      {fehler ? (
        <p className="mt-3 text-muted">
          Noch keine Profil-Tabelle — <code>supabase/profile.sql</code> im SQL Editor ausführen. Bis dahin
          bewertet alles wie gewohnt mit deinem Standardprofil.
        </p>
      ) : (
        <ul className="mt-3 space-y-1">
          {profile.map((p) => (
            <li key={p.slug} className="flex flex-wrap justify-between gap-x-6 border-t border-rule/60 py-1.5">
              <span>
                {p.name} <span className="text-muted">· {p.rolle === "admin" ? "Admin" : "Nutzer"}</span>
              </span>
              <span className="text-muted">
                Profiltext: {p.profiltext ? "eigener" : "Standard"} · Regeln: {p.regeln ? "eigene" : "Standard"}
              </span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
