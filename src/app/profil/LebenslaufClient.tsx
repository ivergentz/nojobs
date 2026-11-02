"use client";

import { useRef, useState } from "react";
import Fortschritt from "@/components/Fortschritt";
import SuchprofilClient, { type SuchprofilStand } from "./SuchprofilClient";

/** Stand des Lebenslaufs, wie er in profile_cv steht. */
export type CvStand = {
  datei_name: string | null;
  status: "hochgeladen" | "ausgelesen" | "fehler";
  fehler: string | null;
  updated_at: string | null;
  lebenslauf: {
    person?: { name?: string; ort?: string };
    kurzprofil?: string;
    stationen?: Array<{ zeitraum: string; titel: string; arbeitgeber: string; ort: string; stichpunkte: string[] }>;
    ausbildung?: Array<{ zeitraum: string; abschluss: string; einrichtung: string }>;
    kenntnisse?: string[];
    sprachen?: Array<{ sprache: string; niveau: string }>;
  } | null;
  richtungen: Array<{ titel: string; begruendung: string; suchbegriffe: string[] }> | null;
  pruefung: Array<{ stufe: "rot" | "gelb" | "hinweis"; punkt: string; vorschlag: string }> | null;
};

const STUFE: Record<string, { text: string; farbe: string }> = {
  rot: { text: "Wichtig", farbe: "text-drop" },
  gelb: { text: "Verbessern", farbe: "text-[#9a6b00]" },
  hinweis: { text: "Hinweis", farbe: "text-muted" },
};

export default function LebenslaufClient({ initial, suchprofil }: { initial: CvStand | null; suchprofil: SuchprofilStand }) {
  const [stand, setStand] = useState<CvStand | null>(initial);
  const [busy, setBusy] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  const hochladen = async (datei: File) => {
    setBusy(true);
    setFehler(null);
    try {
      const form = new FormData();
      form.append("datei", datei);
      const res = await fetch("/api/lebenslauf", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFehler(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setStand(body.lebenslauf as CvStand);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  const cv = stand?.status === "ausgelesen" ? stand.lebenslauf : null;

  return (
    <div className="mt-8 space-y-10 text-sm">
      <section>
        <h2 className="font-semibold">Lebenslauf</h2>
        <p className="mt-1 text-muted">
          {stand?.datei_name
            ? `Hochgeladen: ${stand.datei_name}${stand.status === "fehler" ? " — konnte nicht ausgelesen werden" : ""}`
            : "PDF oder Word (.docx), höchstens 10 MB."}
        </p>
        <label className={`mt-3 inline-block rounded border border-ink px-4 py-2 ${busy ? "pointer-events-none opacity-40" : "cursor-pointer"}`}>
          {stand ? "Neuen Lebenslauf hochladen" : "Lebenslauf hochladen"}
          <input
            ref={eingabe}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            disabled={busy}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void hochladen(f);
            }}
          />
        </label>
        <Fortschritt
          aktiv={busy}
          dauer={40}
          schritte={[
            { ab: 0, text: "Datei wird sicher gespeichert …" },
            { ab: 3, text: "Lebenslauf wird gelesen …" },
            { ab: 20, text: "Richtungen werden abgeleitet …" },
            { ab: 32, text: "Prüfbericht wird erstellt …" },
          ]}
          hinweis="Seite bitte offen lassen — das dauert etwa eine halbe Minute."
        />
        {fehler && <p className="mt-3 text-drop">{fehler}</p>}
        {stand?.status === "fehler" && stand.fehler && !fehler && <p className="mt-3 text-drop">{stand.fehler}</p>}
      </section>

      {stand?.richtungen && stand.richtungen.length > 0 && (
        <section>
          <h2 className="font-semibold">Wohin könnte es gehen?</h2>
          <p className="mt-1 text-muted">Vorschläge aus deinem Lebenslauf. Darunter entscheidest du selbst — auch für eine ganz andere Richtung.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {stand.richtungen.map((r) => (
              <li key={r.titel} className="rounded border border-rule p-4">
                <p className="font-semibold">{r.titel}</p>
                <p className="mt-1 text-muted">{r.begruendung}</p>
                {r.suchbegriffe.length > 0 && <p className="mt-2 text-xs text-muted">Sucht nach: {r.suchbegriffe.join(" · ")}</p>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <SuchprofilClient
        richtungen={(stand?.richtungen ?? []).map((r) => r.titel)}
        ortAusLebenslauf={stand?.lebenslauf?.person?.ort ?? ""}
        initial={suchprofil}
      />

      {stand?.pruefung && stand.pruefung.length > 0 && (
        <section>
          <h2 className="font-semibold">Was sich am Lebenslauf verbessern lässt</h2>
          <ul className="mt-3 space-y-2">
            {stand.pruefung.map((p, i) => (
              <li key={i} className="border-t border-rule/60 pt-2">
                <span className={`mr-2 text-xs font-semibold uppercase ${STUFE[p.stufe]?.farbe ?? "text-muted"}`}>{STUFE[p.stufe]?.text ?? p.stufe}</span>
                {p.punkt}
                {p.vorschlag && <p className="mt-0.5 text-muted">→ {p.vorschlag}</p>}
              </li>
            ))}
          </ul>
          <p className="mt-2 text-xs text-muted">Den Lebenslauf selbst bearbeiten kommt in einem späteren Schritt.</p>
        </section>
      )}

      {cv && (
        <section>
          <h2 className="font-semibold">So haben wir deinen Lebenslauf gelesen</h2>
          {cv.kurzprofil && <p className="mt-2 max-w-xl leading-relaxed">{cv.kurzprofil}</p>}
          {cv.stationen && cv.stationen.length > 0 && (
            <ul className="mt-4 space-y-3">
              {cv.stationen.map((s, i) => (
                <li key={i} className="border-t border-rule/60 pt-2">
                  <p>
                    <span className="font-semibold">{s.titel}</span>
                    {s.arbeitgeber ? ` · ${s.arbeitgeber}` : ""}
                    {s.ort ? <span className="text-muted"> · {s.ort}</span> : null}
                  </p>
                  {s.zeitraum && <p className="text-xs text-muted">{s.zeitraum}</p>}
                  {s.stichpunkte.length > 0 && (
                    <ul className="mt-1 list-disc space-y-0.5 pl-5 text-muted">
                      {s.stichpunkte.map((p, j) => (
                        <li key={j}>{p}</li>
                      ))}
                    </ul>
                  )}
                </li>
              ))}
            </ul>
          )}
          {cv.ausbildung && cv.ausbildung.length > 0 && (
            <div className="mt-4">
              <p className="font-semibold">Ausbildung</p>
              <ul className="mt-1 space-y-1.5">
                {cv.ausbildung.map((a, i) => (
                  <li key={i}>
                    {a.abschluss}
                    {a.einrichtung ? <span className="text-muted"> · {a.einrichtung}</span> : null}
                    {a.zeitraum && <span className="block text-xs text-muted">{a.zeitraum}</span>}
                  </li>
                ))}
              </ul>
            </div>
          )}
          {cv.kenntnisse && cv.kenntnisse.length > 0 && (
            <p className="mt-2 text-muted">
              <span className="font-semibold text-ink">Kenntnisse: </span>
              {cv.kenntnisse.join(" · ")}
            </p>
          )}
          {cv.sprachen && cv.sprachen.length > 0 && (
            <p className="mt-2 text-muted">
              <span className="font-semibold text-ink">Sprachen: </span>
              {cv.sprachen.map((s) => `${s.sprache}${s.niveau ? ` (${s.niveau})` : ""}`).join(" · ")}
            </p>
          )}
        </section>
      )}
    </div>
  );
}
