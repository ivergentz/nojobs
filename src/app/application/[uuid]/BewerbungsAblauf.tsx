import Icon from "@/components/ui/Icon";

/**
 * Orientierung auf der Unterlagen-Seite: die vier Schritte einer Bewerbung — reine Anzeige aus
 * vorhandenen Daten (Entwurf da? Status beworben?). nojobs verschickt selbst nichts.
 */
export default function BewerbungsAblauf({ entwurf, beworben }: { entwurf: boolean; beworben: boolean }) {
  const schritte: Array<{ titel: string; text: string; fertig: boolean }> = [
    { titel: "Unterlagen erstellen", text: "Anschreiben und Lebenslauf passend zur Anzeige.", fertig: entwurf },
    { titel: "Prüfen und anpassen", text: "Lesen, ändern, speichern — du entscheidest, was rausgeht.", fertig: false },
    { titel: "Beim Arbeitgeber bewerben", text: "PDFs laden und über „Ausschreibung öffnen“ selbst absenden.", fertig: beworben },
    { titel: "„Beworben“ klicken", text: "Erst danach — dann landet die Stelle unter Meine Bewerbungen.", fertig: beworben },
  ];
  const naechster = beworben ? -1 : entwurf ? 1 : 0;
  return (
    <section className="card-pad mt-6 text-sm" aria-labelledby="ablauf-titel">
      <h2 id="ablauf-titel" className="section-title">
        So läuft deine Bewerbung
      </h2>
      <ol className="mt-3 grid gap-2 sm:grid-cols-4">
        {schritte.map((s, i) => {
          const fertig = s.fertig || (i === 1 && (beworben || false));
          const aktuell = i === naechster;
          return (
            <li key={s.titel} className={`rounded-lg border p-3 ${aktuell ? "border-brand bg-brand-soft/40" : fertig ? "border-keep/25 bg-keep-soft/30" : "border-rule"}`} aria-current={aktuell ? "step" : undefined}>
              <p className="flex items-center gap-2 font-medium">
                <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full text-2xs font-semibold ${fertig ? "bg-keep text-white" : aktuell ? "bg-brand text-white" : "bg-subtle text-muted"}`}>
                  {fertig ? <Icon name="check" size={12} /> : i + 1}
                </span>
                {s.titel}
              </p>
              <p className="mt-1 text-xs leading-snug text-muted">{s.text}</p>
            </li>
          );
        })}
      </ol>
      <p className="mt-3 flex items-start gap-2 text-xs text-muted">
        <Icon name="info" size={14} className="mt-[1px] shrink-0" />
        nojobs verschickt nichts von selbst. Die Bewerbung schickst du über das Bewerbungsformular oder die E-Mail-Adresse des Arbeitgebers ab.
      </p>
    </section>
  );
}
