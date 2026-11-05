import { supabaseAdmin } from "@/lib/supabase";
import { ladeProfile } from "@/lib/profil";
import { istPausiert, ladeAktivitaeten, PAUSE_TAGE, tageInaktiv, type Aktivitaet } from "@/lib/aktivitaet";
import { AktivSchalter, EinladenKnopf, LoeschenKnopf, NeuesProfilFormular, SuchprofilBearbeiten } from "./ProfilVerwaltung";

/**
 * Nur lesend: welche Profile gibt es, und woher kommen Profiltext und Regeln?
 * Vorbereitung für mehrere Personen — ändert an den Läufen nichts.
 */
export default async function ProfileUebersicht() {
  let ergebnis: Awaited<ReturnType<typeof ladeProfile>>;
  let aktivitaet = new Map<string, Aktivitaet>();
  try {
    [ergebnis, aktivitaet] = await Promise.all([ladeProfile(supabaseAdmin()), ladeAktivitaeten(supabaseAdmin())]);
  } catch (err) {
    ergebnis = { profile: [], fehler: err instanceof Error ? err.message : String(err) };
  }
  const { profile, fehler } = ergebnis;

  return (
    <section className="card-pad mt-5 text-sm">
      <h2 className="font-semibold">Profile</h2>
      {fehler ? (
        <p className="mt-3 text-muted">
          Noch keine Profil-Tabelle — <code>supabase/profile.sql</code> im SQL Editor ausführen. Bis dahin
          bewertet alles wie gewohnt mit deinem Standardprofil.
        </p>
      ) : (
        <>
          <ul className="mt-3 space-y-1">
            {profile.filter((p) => !p.geloescht).map((p) => (
              <li key={p.slug} className={`flex flex-wrap justify-between gap-x-6 border-t border-rule/60 py-1.5 ${p.aktiv === false ? "opacity-50" : ""}`}>
                <span>
                  {p.name} <span className="text-muted">· {p.rolle === "admin" ? "Admin" : "Nutzer"}</span>
                  {p.email ? <span className="text-muted"> · {p.email}</span> : null}
                  {p.aktiv === false ? <span className="text-muted"> · deaktiviert</span> : null}
                  {p.rolle !== "admin" && p.aktiv !== false ? <AktivStatus a={aktivitaet.get(p.slug)} /> : null}
                  {p.rolle !== "admin" && p.telegram ? <span className="text-keep"> · Telegram ✓</span> : null}
                  {p.rolle !== "admin" ? (
                    p.einwilligungAt ? (
                      <span className="text-keep"> · Einwilligung ✓ {new Date(p.einwilligungAt).toLocaleDateString("de-DE")}</span>
                    ) : (
                      <span className="text-warn"> · Einwilligung fehlt</span>
                    )
                  ) : null}
                </span>
                <span className="flex flex-wrap items-center gap-x-4 text-muted">
                  <span>
                    Profiltext: {p.profiltext ? "eigener" : "Standard"} · Regeln: {p.regeln ? "eigene" : "Standard"}
                  </span>
                  {p.rolle !== "admin" && <EinladenKnopf slug={p.slug} email={p.email ?? null} aktiv={p.aktiv !== false} />}
                  {p.rolle !== "admin" && <AktivSchalter slug={p.slug} aktiv={p.aktiv !== false} />}
                  {p.rolle !== "admin" && <LoeschenKnopf slug={p.slug} name={p.name} />}
                </span>
                {p.rolle !== "admin" && (
                  <div className="w-full">
                    <SuchprofilBearbeiten
                      slug={p.slug}
                      name={p.name}
                      profiltext={p.profiltext}
                      regeln={p.regeln}
                      suchbegriffe={p.suchbegriffe ?? []}
                      ort={p.suchort?.ort ?? null}
                      umkreis={p.suchort?.umkreis ?? 25}
                    />
                  </div>
                )}
              </li>
            ))}
          </ul>
          <NeuesProfilFormular />
          <p className="mt-2 text-xs text-muted">
            Für ein neues Profil: unter „Suchprofil“ Suchbegriffe, Ort und Profiltext eintragen, „Stellen suchen und bewerten“ — danach oben
            in der Navigation das Profil wählen. Ab dann bewertet auch der Morgenlauf für dieses Profil. Login folgt in 2.3.
          </p>
        </>
      )}
    </section>
  );
}

/** Zuletzt aktiv / pausiert (Pause nach 7 Tagen ohne Besuch: keine Bewertung, keine Morgennachricht). */
function AktivStatus({ a }: { a: Aktivitaet | undefined }) {
  const tage = tageInaktiv(a);
  if (tage === null) return <span className="text-muted"> · noch kein Besuch erfasst</span>;
  const datum = new Date(a!.zuletzt as string).toLocaleDateString("de-DE");
  if (istPausiert(a)) return <span className="text-warn" title={`Seit ${PAUSE_TAGE} Tagen kein Besuch: keine Bewertung, keine Morgennachricht.`}> · pausiert (zuletzt da am {datum})</span>;
  return <span className="text-muted"> · zuletzt aktiv {tage === 0 ? "heute" : `am ${datum}`}</span>;
}
