"use client";

import { useState } from "react";
import Icon from "@/components/ui/Icon";
import { plattformLinks } from "@/lib/plattform-suchen";

/** Fertige Suchen auf großen Jobbörsen — dort als Job-Alarm speichern, gute Treffer hier hinzufügen. */
export default function PlattformSuchen({ begriffe, ort, umkreisKm }: { begriffe: string[]; ort: string | null; umkreisKm: number }) {
  const [begriff, setBegriff] = useState(begriffe[0] ?? "");
  const [eigener, setEigener] = useState("");
  const aktiv = (eigener.trim() || begriff).trim();
  const links = aktiv ? plattformLinks({ begriff: aktiv, ort, umkreisKm, ohneArbeitsagentur: true }) : [];

  return (
    <section className="card-pad mt-6 text-sm" id="plattformen">
      <h2 className="section-title">Suchaufträge auf großen Jobbörsen</h2>
      <p className="section-lead">
        nojobs durchsucht LinkedIn, StepStone und Co. nicht selbst. Lass dir dort neue Stellen per Mail schicken — gute Treffer fügst du oben per
        Link ein und bekommst Bewertung und Unterlagen wie gewohnt. Die Arbeitsagentur fehlt hier, weil nojobs sie für dich ohnehin jede Nacht
        durchsucht.
      </p>
      <ol className="mt-3 list-decimal space-y-0.5 pl-5 text-muted">
        <li>Suchbegriff wählen — die Links nutzen {ort ? `${ort} und ${umkreisKm} km Umkreis` : "deine Suche ohne Ort"}.</li>
        <li>Suche öffnen, anmelden und dort den Job-Alarm einschalten (täglich oder wöchentlich).</li>
        <li>Kommt eine passende Stelle per Mail: den Link hier oben einfügen.</li>
      </ol>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        {begriffe.length > 0 && (
          <label className="block">
            <span className="field-label">Suchbegriff</span>
            <select className="field mt-1 w-auto" value={begriff} onChange={(e) => { setBegriff(e.target.value); setEigener(""); }}>
              {begriffe.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="block">
          <span className="field-label">{begriffe.length ? "oder eigener Begriff" : "Suchbegriff"}</span>
          <input className="field mt-1 w-56" value={eigener} onChange={(e) => setEigener(e.target.value)} placeholder="z. B. Head of Product" />
        </label>
      </div>
      {links.length > 0 && (
        <ul className="mt-4 divide-y divide-rule/60 rounded-lg border border-rule">
          {links.map((p) => (
            <li key={p.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 px-3 py-2.5" data-plattform={p.id}>
              <div className="min-w-0">
                <p className="font-medium">{p.name}</p>
                <p className="text-xs text-muted">{p.alarm}</p>
              </div>
              <a href={p.url} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm shrink-0">
                Suche öffnen <Icon name="external" size={13} />
              </a>
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-muted">Die Links öffnen die Suche der Plattform. Bezeichnungen der Knöpfe können sich dort ändern.</p>
    </section>
  );
}
