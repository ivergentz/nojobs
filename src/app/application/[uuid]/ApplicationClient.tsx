"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Fortschritt from "@/components/Fortschritt";
import PdfKnopf from "@/components/PdfKnopf";
import Icon from "@/components/ui/Icon";

type Draft = {
  lang: "de" | "en";
  role: string;
  recipient: string[];
  subject: string;
  headline: string;
  paragraphs: string[];
  signOff: string;
  salutation?: string;
  closing?: string;
  facts?: { salary?: string; notice?: string };
  cvOverrides: Record<string, unknown>;
  hinweise: string[];
};

/** Anschreiben + Lebenslauf: Claude liest Ausschreibung und Lebenslauf und schreibt beides. */
const ENTWURF_SCHRITTE = [
  { ab: 0, text: "Ausschreibung und Lebenslauf werden gelesen …" },
  { ab: 8, text: "Anschreiben wird geschrieben …" },
  { ab: 30, text: "Lebenslauf wird auf die Stelle zugeschnitten …" },
  { ab: 55, text: "Fast fertig …" },
];

export default function ApplicationClient({
  uuid,
  draft: initial,
  defaultLang,
  cvQuelle,
}: {
  uuid: string;
  draft: Draft | null;
  defaultLang: "de" | "en";
  cvQuelle: string;
}) {
  const router = useRouter();
  const [draft, setDraft] = useState<Draft | null>(initial);
  const [lang, setLang] = useState<"de" | "en">(initial?.lang ?? defaultLang);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState<string | null>(null);
  const [dirty, setDirty] = useState(false);

  const generate = async () => {
    setBusy(true);
    setFailed(null);
    try {
      const res = await fetch("/api/application/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, lang }),
      });
      const body = await res.json();
      if (!res.ok) {
        setFailed(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDraft(body as Draft);
      setDirty(false);
      // Seite neu laden lassen, damit der persönliche Link erscheint.
      router.refresh();
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy(true);
    try {
      const res = await fetch("/api/application/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ uuid, draft }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        setFailed(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setDirty(false);
      setFailed(null);
    } catch (error) {
      setFailed(error instanceof Error ? error.message : String(error));
    } finally {
      setBusy(false);
    }
  };

  const patch = (changes: Partial<Draft>) => {
    setDraft((prev) => (prev ? { ...prev, ...changes } : prev));
    setDirty(true);
  };

  if (!draft) {
    return (
      <section className="card-pad mt-6">
        <h2 className="section-title">Bewerbungsunterlagen</h2>
        <p className="section-lead max-w-lg">
          Claude liest die Ausschreibung und deinen Lebenslauf und schreibt ein Anschreiben sowie einen auf die Stelle zugeschnittenen
          Lebenslauf.
        </p>
        <div className="mt-5 flex flex-wrap items-center gap-3">
          <label className="sr-only" htmlFor="entwurf-sprache">
            Sprache
          </label>
          <select id="entwurf-sprache" value={lang} onChange={(event) => setLang(event.target.value as "de" | "en")} className="field mt-0 w-auto">
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
          </select>
          <button type="button" onClick={() => void generate()} disabled={busy} className="btn-primary">
            <Icon name="sparkles" size={15} />
            {busy ? "wird erstellt …" : "Entwurf erstellen"}
          </button>
        </div>
        <Fortschritt aktiv={busy} dauer={45} schritte={ENTWURF_SCHRITTE} />
        {failed && <p className="mt-4 text-sm text-drop">{failed}</p>}
        <p className="mt-5 max-w-lg text-sm leading-relaxed text-muted">
          Der Entwurf ist ein Entwurf. Lies ihn durch und ändere, was nicht nach dir klingt, bevor du die PDFs herunterlädst — im Gespräch
          musst du jeden Satz vertreten können.
        </p>
        <p className="mt-3 text-xs text-muted">Lebenslauf und Design: {cvQuelle}</p>
      </section>
    );
  }

  const woerter = [draft.headline, ...draft.paragraphs].join(" ").split(/\s+/).filter(Boolean).length;

  return (
    <div className="mt-6 space-y-5">
      {draft.hinweise?.length > 0 && (
        <section className="alert-info">
          <Icon name="sparkles" size={18} className="mt-0.5 text-brand" />
          <div>
            <h2 className="font-medium">Was ich betont habe</h2>
            <ul className="mt-1 list-disc space-y-1 pl-4 text-ink/80">
              {draft.hinweise.map((entry, index) => (
                <li key={index}>{entry}</li>
              ))}
            </ul>
          </div>
        </section>
      )}

      <Gruppe nr={1} titel="Empfänger und Betreff">
        <label className="block">
          <span className="field-label">Empfänger</span>
          <textarea
            value={draft.recipient.join("\n")}
            onChange={(event) => patch({ recipient: event.target.value.split("\n") })}
            rows={3}
            className="field"
          />
        </label>
        <label className="block">
          <span className="field-label">Betreff</span>
          <input value={draft.subject} onChange={(event) => patch({ subject: event.target.value })} className="field" />
        </label>
      </Gruppe>

      <Gruppe nr={2} titel="Anschreiben" hinweis={`${woerter} Wörter`}>
        <label className="block">
          <span className="field-label">Anrede</span>
          <input value={draft.salutation ?? ""} onChange={(event) => patch({ salutation: event.target.value })} className="field" />
        </label>
        <label className="block">
          <span className="field-label">Aufmacher</span>
          <span className="field-hint">Kursiv, direkt nach der Anrede</span>
          <input value={draft.headline} onChange={(event) => patch({ headline: event.target.value })} className="field" />
        </label>
        <div>
          <span className="field-label">Text</span>
          <span className="field-hint">**Einstieg.** am Absatzanfang erscheint im PDF fett in Versalien</span>
          <div className="mt-1.5 space-y-2.5">
            {draft.paragraphs.map((paragraph, index) => (
              <textarea
                key={index}
                aria-label={`Absatz ${index + 1}`}
                value={paragraph}
                onChange={(event) => {
                  const next = [...draft.paragraphs];
                  next[index] = event.target.value;
                  patch({ paragraphs: next });
                }}
                rows={Math.max(3, Math.ceil(paragraph.length / 90))}
                className="field mt-0 text-[0.9375rem] leading-relaxed"
              />
            ))}
          </div>
        </div>
      </Gruppe>

      <Gruppe nr={3} titel="Persönliche Angaben" hinweis="Leer lassen = im Anschreiben nicht nennen">
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="field-label">Gehaltsvorstellung</span>
            <input
              value={draft.facts?.salary ?? ""}
              onChange={(event) => patch({ facts: { ...draft.facts, salary: event.target.value } })}
              placeholder="z. B. 88.000 € brutto p. a. (fix)"
              className="field"
            />
          </label>
          <label className="block">
            <span className="field-label">Kündigungsfrist</span>
            <input value={draft.facts?.notice ?? ""} onChange={(event) => patch({ facts: { ...draft.facts, notice: event.target.value } })} className="field" />
          </label>
        </div>
      </Gruppe>

      <Gruppe nr={4} titel="Abschluss">
        <label className="block">
          <span className="field-label">Schlusssatz</span>
          <input value={draft.closing ?? ""} onChange={(event) => patch({ closing: event.target.value })} className="field" />
        </label>
        <label className="block">
          <span className="field-label">Grußformel</span>
          <input value={draft.signOff} onChange={(event) => patch({ signOff: event.target.value })} className="field" />
        </label>
      </Gruppe>

      {/* Dokumentaktionen — auf großen Bildschirmen am unteren Rand mitlaufend */}
      <div className="card z-10 p-3 sm:sticky sm:bottom-3 sm:shadow-raised">
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => void save()} disabled={busy || !dirty} className={dirty ? "btn-primary" : "btn-secondary"}>
            {dirty ? (
              "Änderungen sichern"
            ) : (
              <>
                <Icon name="check" size={15} className="text-keep" /> gesichert
              </>
            )}
          </button>
          <span aria-hidden className="mx-1 hidden h-6 w-px bg-rule sm:block" />
          <PdfKnopf href={`/api/application/pdf?uuid=${encodeURIComponent(uuid)}&doc=letter`} gesperrt={dirty} className="btn-secondary">
            <Icon name="download" size={15} />
            Anschreiben als PDF
          </PdfKnopf>
          <PdfKnopf href={`/api/application/pdf?uuid=${encodeURIComponent(uuid)}&doc=cv`} gesperrt={dirty} className="btn-secondary">
            <Icon name="download" size={15} />
            Lebenslauf als PDF
          </PdfKnopf>
          <button type="button" onClick={() => void generate()} disabled={busy} className="btn-ghost sm:ml-auto">
            <Icon name="refresh" size={15} />
            neu entwerfen
          </button>
        </div>
        {dirty && (
          <p className="mt-2 flex items-center gap-1.5 text-xs text-warn">
            <Icon name="alert" size={13} /> Ungesicherte Änderungen — das PDF würde noch die alte Fassung enthalten.
          </p>
        )}
      </div>

      <Fortschritt aktiv={busy && !dirty} dauer={45} schritte={ENTWURF_SCHRITTE} />

      {failed && <p className="text-sm text-drop">{failed}</p>}
      <p className="text-xs text-muted">Lebenslauf und Design: {cvQuelle}</p>
    </div>
  );
}

function Gruppe({ nr, titel, hinweis, children }: { nr: number; titel: string; hinweis?: string; children: React.ReactNode }) {
  return (
    <section className="card-pad">
      <div className="mb-4 flex items-baseline justify-between gap-3">
        <h2 className="flex items-center gap-2.5 text-[0.9375rem] font-semibold">
          <span className="grid h-6 w-6 place-items-center rounded-full bg-subtle text-xs font-semibold text-muted">{nr}</span>
          {titel}
        </h2>
        {hinweis && <span className="tnum text-xs text-muted">{hinweis}</span>}
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}
