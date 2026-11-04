import AdminClient from "./AdminClient";
import ProfileUebersicht from "./ProfileUebersicht";
import AbgleichUebersicht from "./AbgleichUebersicht";
import AufbewahrungUebersicht from "./AufbewahrungUebersicht";
import Suchpflege from "./Suchpflege";
import { Suspense } from "react";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="page">
      <header className="mb-2">
        <p className="eyebrow">Steuerung</p>
        <h1 className="page-title mt-1.5">Läufe</h1>
        <p className="page-lead">
          Automatisch: Import 04:00 UTC, Bewertung und Telegram 06:00 UTC (deutsche Zeit je nach
          Sommer-/Winterzeit 1–2 Stunden später). Von Hand: erst
          Import, dann Bewerten. Jeder Aufruf arbeitet nur sein Zeitbudget ab, die Schleife läuft
          hier im Browser weiter — Seite dabei offen lassen.
        </p>
      </header>

      <AdminClient />
      <Suspense fallback={<p className="card-pad mt-5 text-sm text-muted">Suchpflege wird geladen …</p>}>
        <Suchpflege />
      </Suspense>
      <ProfileUebersicht />
      <AbgleichUebersicht />
      <AufbewahrungUebersicht />
    </main>
  );
}
