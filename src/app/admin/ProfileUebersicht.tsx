import { supabaseAdmin } from "@/lib/supabase";
import { ladeProfile } from "@/lib/profil";
import { AktivSchalter, NeuesProfilFormular, SuchprofilBearbeiten } from "./ProfilVerwaltung";

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
        <>
          <ul className="mt-3 space-y-1">
            {profile.map((p) => (
              <li key={p.slug} className={`flex flex-wrap justify-between gap-x-6 border-t border-rule/60 py-1.5 ${p.aktiv === false ? "opacity-50" : ""}`}>
                <span>
                  {p.name} <span className="text-muted">· {p.rolle === "admin" ? "Admin" : "Nutzer"}</span>
                  {p.email ? <span className="text-muted"> · {p.email}</span> : null}
                  {p.aktiv === false ? <span className="text-muted"> · deaktiviert</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-x-4 text-muted">
                  <span>
                    Profiltext: {p.profiltext ? "eigener" : "Standard"} · Regeln: {p.regeln ? "eigene" : "Standard"}
                  </span>
                  {p.rolle !== "admin" && <AktivSchalter slug={p.slug} aktiv={p.aktiv !== false} />}
                </span>
                {p.rolle !== "admin" && (
                  <div className="w-full">
                    <SuchprofilBearbeiten
                      slug={p.slug}
                      name={p.name}
                      profiltext={p.profiltext}
                      regeln={p.regeln}
                      suchbegriffe={p.suchbegriffe ?? []}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <NeuesProfilFormular />
          <p className="mt-2 text-xs text-muted">
            Für ein neues Profil: unter „Suchprofil“ Suchbegriffe und Profiltext eintragen, „Jetzt bewerten“ — danach oben
            in der Navigation das Profil wählen. Ab dann bewertet auch der Morgenlauf für dieses Profil. Login folgt in 2.3.
          </p>
        </>
      )}
    </section>
  );
}
