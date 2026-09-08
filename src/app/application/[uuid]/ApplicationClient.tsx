"use client";

import { useState } from "react";

type Draft = {
  lang: "de" | "en";
  role: string;
  recipient: string[];
  subject: string;
  headline: string;
  paragraphs: string[];
  signOff: string;
  cvOverrides: Record<string, unknown>;
  hinweise: string[];
};

export default function ApplicationClient({
  uuid,
  draft: initial,
  defaultLang,
}: {
  uuid: string;
  draft: Draft | null;
  defaultLang: "de" | "en";
}) {
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
      <div className="mt-10">
        <div className="flex items-center gap-3">
          <select
            value={lang}
            onChange={(event) => setLang(event.target.value as "de" | "en")}
            className="rounded border border-rule bg-transparent px-3 py-2 text-sm"
          >
            <option value="de">Deutsch</option>
            <option value="en">Englisch</option>
          </select>
          <button
            type="button"
            onClick={() => void generate()}
            disabled={busy}
            className="rounded border border-keep px-4 py-2 text-sm text-keep disabled:opacity-40"
          >
            {busy ? "wird erstellt …" : "Entwurf erstellen"}
          </button>
        </div>
        {failed && <p className="mt-4 text-sm text-drop">{failed}</p>}
        <p className="mt-6 max-w-lg text-sm leading-relaxed text-muted">
          Der Entwurf ist ein Entwurf. Lies ihn durch und ändere, was nicht nach dir klingt, bevor
          du die PDFs herunterlädst — im Gespräch musst du jeden Satz vertreten können.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-10 space-y-8">
      {draft.hinweise?.length > 0 && (
        <section className="border-l-2 border-rule pl-4">
          <h2 className="text-sm font-semibold">Was ich betont habe</h2>
          <ul className="mt-2 space-y-1 text-sm leading-relaxed text-muted">
            {draft.hinweise.map((entry, index) => (
              <li key={index}>{entry}</li>
            ))}
          </ul>
        </section>
      )}

      <label className="block">
        <span className="text-sm text-muted">Empfänger</span>
        <textarea
          value={draft.recipient.join("\n")}
          onChange={(event) => patch({ recipient: event.target.value.split("\n") })}
          rows={3}
          className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-sm text-muted">Betreff</span>
        <input
          value={draft.subject}
          onChange={(event) => patch({ subject: event.target.value })}
          className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <label className="block">
        <span className="text-sm text-muted">Aufmacher</span>
        <input
          value={draft.headline}
          onChange={(event) => patch({ headline: event.target.value })}
          className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <div>
        <span className="text-sm text-muted">Anschreiben</span>
        <div className="mt-2 space-y-3">
          {draft.paragraphs.map((paragraph, index) => (
            <textarea
              key={index}
              value={paragraph}
              onChange={(event) => {
                const next = [...draft.paragraphs];
                next[index] = event.target.value;
                patch({ paragraphs: next });
              }}
              rows={Math.max(3, Math.ceil(paragraph.length / 90))}
              className="w-full rounded border border-rule bg-transparent px-3 py-2 text-sm leading-relaxed"
            />
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          {draft.paragraphs.join(" ").split(/\s+/).filter(Boolean).length} Wörter
        </p>
      </div>

      <label className="block">
        <span className="text-sm text-muted">Grußformel</span>
        <input
          value={draft.signOff}
          onChange={(event) => patch({ signOff: event.target.value })}
          className="mt-2 w-full rounded border border-rule bg-transparent px-3 py-2 text-sm"
        />
      </label>

      <div className="sticky bottom-0 flex flex-wrap items-center gap-3 border-t border-rule bg-paper py-5">
        <button
          type="button"
          onClick={() => void save()}
          disabled={busy || !dirty}
          className="rounded border border-ink px-4 py-2 text-sm disabled:opacity-40"
        >
          {dirty ? "Änderungen sichern" : "gesichert"}
        </button>

        <a
          href={`/api/application/pdf?uuid=${encodeURIComponent(uuid)}&doc=letter`}
          className={`rounded border border-keep px-4 py-2 text-sm text-keep ${
            dirty ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Anschreiben als PDF
        </a>
        <a
          href={`/api/application/pdf?uuid=${encodeURIComponent(uuid)}&doc=cv`}
          className={`rounded border border-keep px-4 py-2 text-sm text-keep ${
            dirty ? "pointer-events-none opacity-40" : ""
          }`}
        >
          Lebenslauf als PDF
        </a>

        <button
          type="button"
          onClick={() => void generate()}
          disabled={busy}
          className="px-3 py-2 text-sm text-muted underline underline-offset-4 disabled:opacity-40"
        >
          neu entwerfen
        </button>
      </div>

      {dirty && (
        <p className="text-xs text-drop">
          Ungesicherte Änderungen — das PDF würde noch die alte Fassung enthalten.
        </p>
      )}
      {failed && <p className="text-sm text-drop">{failed}</p>}
    </div>
  );
}
