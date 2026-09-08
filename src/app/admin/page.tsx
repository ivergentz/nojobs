import AdminClient from "./AdminClient";

export const dynamic = "force-dynamic";

export default function AdminPage() {
  return (
    <main className="mx-auto max-w-3xl px-6 py-12">
      <header className="border-b border-rule pb-6">
        <p className="text-sm text-muted">Career Inbox · Steuerung</p>
        <h1 className="mt-2 text-xl font-semibold tracking-tight">Läufe</h1>
        <p className="mt-3 max-w-lg text-sm leading-relaxed text-muted">
          Jeder Serverless-Aufruf arbeitet nur sein Zeitbudget ab. Die Schleife läuft hier im
          Browser weiter, bis fertig gemeldet wird — Seite dabei offen lassen.
        </p>
      </header>

      <AdminClient />
    </main>
  );
}
