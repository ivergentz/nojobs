"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Fortschritt from "@/components/Fortschritt";
import Icon from "@/components/ui/Icon";
import SuchprofilClient, { type SuchprofilStand } from "./SuchprofilClient";
import LayoutClient, { type LayoutStand } from "./LayoutClient";
import { ReiterInhalt, ReiterLeiste, useReiter, useReiterId } from "@/components/ui/Reiter";
import { REITER_ZU, zuordnen } from "@/lib/pruefung-zuordnen";

const REITER_KEYS = ["lebenslauf", "suchprofil", "unterlagen", "benachrichtigung"];

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
    bearbeitet_at?: string | null;
  } | null;
  richtungen: Array<{ titel: string; begruendung: string; suchbegriffe: string[] }> | null;
  pruefung: Array<{ stufe: "rot" | "gelb" | "hinweis"; punkt: string; vorschlag: string; erledigt?: boolean; bereich?: string; eintrag?: number | null }> | null;
};

const STUFE: Record<string, { text: string; badge: string }> = {
  rot: { text: "Wichtig", badge: "badge-negative" },
  gelb: { text: "Verbessern", badge: "badge-warn" },
  hinweis: { text: "Hinweis", badge: "badge-neutral" },
};

/** Nummerierter Schritt mit Häkchen, sobald erledigt. */
export function Schritt({ nr, fertig }: { nr: number; fertig?: boolean }) {
  return (
    <span
      aria-hidden
      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-semibold ${fertig ? "bg-keep-soft text-keep" : "bg-brand-soft text-brand-strong"}`}
    >
      {fertig ? <Icon name="check" size={14} /> : nr}
    </span>
  );
}

/**
 * „Mein Profil“ in Reitern: Lebenslauf · Suchprofil · Unterlagen · Benachrichtigung.
 * Alle Bereiche bleiben geladen (nur ausgeblendet) — Funktionen und Abläufe wie vorher.
 */
export default function LebenslaufClient({
  initial,
  suchprofil,
  unterlagen,
  telegram,
  telegramVerbunden = false,
}: {
  initial: CvStand | null;
  suchprofil: SuchprofilStand;
  unterlagen?: { initial: LayoutStand; hatFoto: boolean };
  telegram?: ReactNode;
  telegramVerbunden?: boolean;
}) {
  const [stand, setStand] = useState<CvStand | null>(initial);
  const ausgelesen = stand?.status === "ausgelesen";
  const bestaetigt = Boolean(suchprofil.bestaetigt_at);
  // Startet beim ersten offenen Schritt
  const [reiter, waehlen] = useReiter(REITER_KEYS, initial?.status !== "ausgelesen" ? "lebenslauf" : bestaetigt ? "lebenslauf" : "suchprofil");
  const idBasis = useReiterId();
  const offenePunkte = (stand?.pruefung ?? []).filter((p) => !p.erledigt).length;
  // Lebenslauf nach dem Suchprofil bearbeitet? Dann Hinweis im Reiter Suchprofil.
  const bearbeitet = stand?.lebenslauf?.bearbeitet_at ?? null;
  const lebenslaufNeuer = Boolean(ausgelesen && bearbeitet && suchprofil.bestaetigt_at && bearbeitet > suchprofil.bestaetigt_at);
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

  const panel = "flex flex-col gap-6 [&>*]:!mt-0";
  return (
    <div className="text-sm">
      <ReiterLeiste
        label="Bereiche von Mein Profil"
        idBasis={idBasis}
        aktiv={reiter}
        onWahl={waehlen}
        eintraege={[
          { key: "lebenslauf", label: "Lebenslauf", fertig: ausgelesen, zahl: ausgelesen ? offenePunkte : null },
          { key: "suchprofil", label: "Suchprofil", fertig: bestaetigt },
          { key: "unterlagen", label: "Unterlagen" },
          { key: "benachrichtigung", label: "Telegram", fertig: telegramVerbunden },
        ]}
      />

      <div className="mt-5">
        <ReiterInhalt idBasis={idBasis} key_="lebenslauf" aktiv={reiter}>
          <div className={panel}>
      <section className="card-pad">
        <div className="flex items-start gap-3">
          <Schritt nr={1} fertig={stand?.status === "ausgelesen"} />
          <div className="min-w-0 flex-1">
        <h2 className="section-title">Lebenslauf</h2>
        <p className="section-lead">
          {stand?.datei_name
            ? `Hochgeladen: ${stand.datei_name}${stand.status === "fehler" ? " — konnte nicht ausgelesen werden" : ""}`
            : "PDF oder Word (.docx), höchstens 10 MB."}
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
        {stand?.status === "ausgelesen" && !busy && (
          <Link href="/profil/lebenslauf" className="btn-primary">
            <Icon name="file" size={15} /> Lebenslauf bearbeiten
            {offenePunkte > 0 && <span className="tnum rounded-full bg-white/20 px-1.5 text-2xs">{offenePunkte} offen</span>}
          </Link>
        )}
        <label className={`${stand ? "btn-secondary" : "btn-primary"} ${busy ? "pointer-events-none opacity-45" : "cursor-pointer"} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 has-[:focus-visible]:ring-offset-2`}>
          <Icon name="upload" size={15} />
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
        </div>
        {stand?.status === "ausgelesen" && !busy && (
          <p className="mt-2 text-xs text-muted">Felder korrigieren, Kontaktdaten und Foto ergänzen, Verbesserungen abhaken.</p>
        )}
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
        {fehler && <p className="alert-error mt-3">{fehler}</p>}
        {stand?.status === "fehler" && stand.fehler && !fehler && <p className="alert-error mt-3">{stand.fehler}</p>}
          </div>
        </div>
      </section>


            {ausgelesen && !bestaetigt && (
              <div className="alert-info flex flex-wrap items-center justify-between gap-3">
                <span>Lebenslauf ist gelesen. Nächster Schritt: dein Suchprofil.</span>
                <button type="button" className="btn-primary btn-sm" onClick={() => waehlen("suchprofil")}>
                  Weiter zum Suchprofil <Icon name="chevronRight" size={14} />
                </button>
              </div>
            )}
      {stand?.pruefung && stand.pruefung.length > 0 && (
        <section className="card-pad">
          <h2 className="section-title">Was sich am Lebenslauf verbessern lässt</h2>
          <ul className="mt-4 divide-y divide-rule/70">
            {stand.pruefung.map((p, i) => (
              <li key={i} className={`flex gap-3 py-3 first:pt-0 last:pb-0 ${p.erledigt ? "opacity-55" : ""}`}>
                <span className={`${STUFE[p.stufe]?.badge ?? "badge-neutral"} h-fit`}>{STUFE[p.stufe]?.text ?? p.stufe}</span>
                <div className="min-w-0">
                  <p className={p.erledigt ? "line-through decoration-muted/50" : ""}>
                    {p.punkt}
                    {p.erledigt && <span className="ml-2 text-xs text-keep no-underline">erledigt</span>}
                  </p>
                  {p.vorschlag && <p className="mt-0.5 text-muted">→ {p.vorschlag}</p>}
                  {!p.erledigt && (
                    <Link href={`/profil/lebenslauf#${REITER_ZU[zuordnen(p, stand.lebenslauf ?? {}).bereich]}`} className="link mt-1 inline-block text-xs">
                      Hier ändern →
                    </Link>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <Link href="/profil/lebenslauf" className="btn-primary mt-4">
            <Icon name="file" size={15} /> Lebenslauf bearbeiten
          </Link>
        </section>
      )}

      {cv && (
        <section className="card-pad">
          <h2 className="section-title">{bearbeitet ? "Dein Lebenslauf — bearbeitete Fassung" : "So haben wir deinen Lebenslauf gelesen"}</h2>
          {cv.kurzprofil && <p className="mt-2 max-w-xl leading-relaxed">{cv.kurzprofil}</p>}
          {cv.stationen && cv.stationen.length > 0 && (
            <ul className="mt-4 space-y-3">
              {cv.stationen.map((s, i) => (
                <li key={i} className="border-l-2 border-rule pl-3">
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
        </ReiterInhalt>

        <ReiterInhalt idBasis={idBasis} key_="suchprofil" aktiv={reiter}>
          <div className={panel}>
            {lebenslaufNeuer && (
              <div className="alert-warn" role="status">
                <p className="font-medium">Dein Lebenslauf wurde geändert, nachdem dein Suchprofil entstanden ist.</p>
                <p className="mt-0.5">
                  Damit die Änderungen auch in die Suche einfließen: unten bei „Was suchst du?“ auf „Neuen Vorschlag erstellen“ klicken, prüfen und
                  übernehmen. Deine Antworten bleiben erhalten.
                </p>
              </div>
            )}
      {stand?.richtungen && stand.richtungen.length > 0 && (
        <section className="card-pad">
          <h2 className="section-title">Wohin könnte es gehen?</h2>
          <p className="section-lead">Vorschläge aus deinem Lebenslauf. Darunter entscheidest du selbst — auch für eine ganz andere Richtung.</p>
          <ul className="mt-4 grid gap-3 sm:grid-cols-3">
            {stand.richtungen.map((r) => (
              <li key={r.titel} className="rounded-lg border border-rule bg-paper/60 p-4">
                <p className="font-semibold">{r.titel}</p>
                <p className="mt-1 text-muted">{r.begruendung}</p>
                {r.suchbegriffe.length > 0 && (
                  <p className="mt-3 flex flex-wrap gap-1">
                    {r.suchbegriffe.map((b) => (
                      <span key={b} className="badge-neutral font-normal">
                        {b}
                      </span>
                    ))}
                  </p>
                )}
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

          </div>
        </ReiterInhalt>

        <ReiterInhalt idBasis={idBasis} key_="unterlagen" aktiv={reiter}>
          <div className={panel}>
            {ausgelesen && unterlagen ? (
              <LayoutClient initial={unterlagen.initial} hatFoto={unterlagen.hatFoto} />
            ) : (
              <Leer text="Lade zuerst deinen Lebenslauf hoch — dann wählst du hier das Aussehen von Lebenslauf und Anschreiben." onWeiter={() => waehlen("lebenslauf")} weiter="Zum Lebenslauf" />
            )}
          </div>
        </ReiterInhalt>

        <ReiterInhalt idBasis={idBasis} key_="benachrichtigung" aktiv={reiter}>
          <div className={panel}>
            {telegram ?? <Leer text="Bestätige zuerst dein Suchprofil — dann kannst du dir neue Stellen morgens aufs Handy schicken lassen." onWeiter={() => waehlen("suchprofil")} weiter="Zum Suchprofil" />}
          </div>
        </ReiterInhalt>
      </div>
    </div>
  );
}

function Leer({ text, weiter, onWeiter }: { text: string; weiter: string; onWeiter: () => void }) {
  return (
    <section className="card-pad text-muted">
      <p>{text}</p>
      <button type="button" className="btn-secondary mt-3" onClick={onWeiter}>
        {weiter}
      </button>
    </section>
  );
}
