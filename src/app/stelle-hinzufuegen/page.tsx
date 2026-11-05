import StelleHinzufuegenClient from "./StelleHinzufuegenClient";

export const metadata = { title: "Stelle hinzufügen · nojobs" };

/** Eine Stelle, die nojobs nicht selbst gefunden hat, per Link oder Text übernehmen — mit Bewertung und allen Funktionen. */
export default function StelleHinzufuegenPage() {
  return (
    <main className="page max-w-3xl">
      <header className="mb-2">
        <p className="eyebrow">Meine Jobs</p>
        <h1 className="page-title mt-1.5">Stelle hinzufügen</h1>
        <p className="mt-2 max-w-xl text-sm leading-relaxed text-muted">
          Du hast woanders eine passende Stelle gefunden? Füge den Link ein. nojobs liest die Anzeige, bewertet sie wie jede andere und legt sie
          unter <span className="font-medium text-ink">Vorgemerkt</span> ab — mit Unterlagen, Gesprächsvorbereitung und allem, was dazugehört.
        </p>
      </header>
      <StelleHinzufuegenClient />
      <section className="mt-6 text-xs leading-relaxed text-muted">
        <p className="font-medium text-ink/80">Gut zu wissen</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-5">
          <li>Am besten der Link direkt zur Anzeige beim Unternehmen. Bei LinkedIn: „Auf Unternehmenswebsite bewerben“ öffnen und diesen Link nehmen.</li>
          <li>Manche Seiten laden ihren Inhalt erst im Browser. Dann bittet nojobs dich, den Text der Anzeige einzufügen (markieren, kopieren, einfügen).</li>
          <li>Gibt es die Stelle schon in nojobs, öffnet sich die vorhandene — doppelt wird nichts angelegt.</li>
          <li>Bis zu 20 Stellen pro Tag.</li>
        </ul>
      </section>
    </main>
  );
}
