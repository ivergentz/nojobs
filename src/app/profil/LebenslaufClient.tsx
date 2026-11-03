"use client";

import { useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import Fortschritt from "@/components/Fortschritt";
import Icon from "@/components/ui/Icon";
import SuchprofilClient, { type SuchprofilStand } from "./SuchprofilClient";
import LayoutClient, { type LayoutStand } from "./LayoutClient";
import { ReiterInhalt, ReiterLeiste, useReiter, useReiterId } from "@/components/ui/Reiter";
import { REITER_ZU, zuordnen } from "@/lib/pruefung-zuordnen";
import { EINWILLIGUNG_PUNKTE, EINWILLIGUNG_SATZ, type Einwilligung } from "@/lib/einwilligung";

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
  einwilligung,
}: {
  initial: CvStand | null;
  suchprofil: SuchprofilStand;
  unterlagen?: { initial: LayoutStand; hatFoto: boolean };
  telegram?: ReactNode;
  telegramVerbunden?: boolean;
  /** Einwilligung zur Speicherung (null = noch nicht erteilt). undefined = nicht abfragen. */
  einwilligung?: Einwilligung | null;
}) {
  const [zustimmung, setZustimmung] = useState<Einwilligung | null>(einwilligung ?? null);
  const [haken, setHaken] = useState(false);
  const braucht = einwilligung !== undefined && !zustimmung;
  const [stand, setStand] = useState<CvStand | null>(initial);
  const ausgelesen = stand?.status === "ausgelesen";
  // Stand des Suchprofils live aus dem Suchprofil-Bereich (Übernehmen ohne Neuladen)
  const [sp, setSp] = useState<{ vorschlag: SuchprofilStand["vorschlag"]; bestaetigt_at: string | null; antworten: boolean }>({
    vorschlag: suchprofil.vorschlag,
    bestaetigt_at: suchprofil.bestaetigt_at,
    antworten: Boolean(suchprofil.antworten),
  });
  const bestaetigt = Boolean(sp.bestaetigt_at);
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
      if (haken) form.append("einwilligung", "ja");
      const res = await fetch("/api/lebenslauf", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        setFehler(body.error ?? `HTTP ${res.status}`);
        return;
      }
      setStand(body.lebenslauf as CvStand);
      if (braucht) setZustimmung({ version: "", at: new Date().toISOString() });
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  const cv = stand?.status === "ausgelesen" ? stand.lebenslauf : null;
  const bestaetigen = async () => {
    setBusy(true);
    setFehler(null);
    try {
      const res = await fetch("/api/einwilligung", { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setZustimmung(body.einwilligung);
    } catch (err) {
      setFehler(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };
  const einwilligungsKasten = braucht ? (
    <div className="mt-4 rounded-lg border border-warn/30 bg-warn-soft/50 p-4">
      <p className="font-medium">Bevor du deinen Lebenslauf hochlädst</p>
      <ul className="mt-2 space-y-1.5">
        {EINWILLIGUNG_PUNKTE.map((t) => (
          <li key={t} className="flex gap-2">
            <Icon name="info" size={15} className="mt-[2px] shrink-0 text-warn" />
            <span>{t}</span>
          </li>
        ))}
      </ul>
      <label className="mt-3 flex cursor-pointer gap-2.5 font-medium">
        <input type="checkbox" className="mt-0.5 h-4 w-4 shrink-0" checked={haken} onChange={(e) => setHaken(e.target.checked)} />
        {EINWILLIGUNG_SATZ}
      </label>
      {stand && (
        <button type="button" className="btn-primary btn-sm mt-3" disabled={!haken || busy} onClick={() => void bestaetigen()}>
          Bestätigen
        </button>
      )}
    </div>
  ) : null;

  const panel = "flex flex-col gap-6 [&>*]:!mt-0";
  const zuReiter = (key: string) => {
    waehlen(key);
    document.getElementById(`${idBasis}-tab-${key}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };
  const eingerichtet = ausgelesen && bestaetigt;

  return (
    <div className="text-sm">
      {eingerichtet ? (
        <ProfilUebersicht
          lebenslauf={{ bearbeitet, offen: offenePunkte, datei: stand?.datei_name ?? null }}
          suchprofil={sp.vorschlag}
          bestaetigtAt={sp.bestaetigt_at}
          unterlagen={unterlagen?.initial ?? null}
          telegram={telegramVerbunden}
          zuReiter={zuReiter}
        />
      ) : (
        <Einrichtung
          schritte={[
            { titel: "Lebenslauf hochladen", fertig: ausgelesen, reiter: "lebenslauf" },
            { titel: "Lebenslauf prüfen und bearbeiten", fertig: Boolean(bearbeitet) || (ausgelesen && offenePunkte === 0), reiter: "lebenslauf", link: ausgelesen ? "/profil/lebenslauf" : undefined, empfohlen: true },
            { titel: "Berufliche Wünsche festlegen", fertig: sp.antworten || Boolean(sp.vorschlag), reiter: "suchprofil" },
            { titel: "Suchprofil bestätigen", fertig: bestaetigt, reiter: "suchprofil" },
          ]}
          zuReiter={zuReiter}
        />
      )}

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
        {einwilligungsKasten}
        <div className="mt-4 flex flex-wrap items-center gap-2">
        {stand?.status === "ausgelesen" && !busy && (
          <Link href="/profil/lebenslauf" className="btn-primary">
            <Icon name="file" size={15} /> Lebenslauf bearbeiten
            {offenePunkte > 0 && <span className="tnum rounded-full bg-white/20 px-1.5 text-2xs">{offenePunkte} offen</span>}
          </Link>
        )}
        <label aria-disabled={braucht && !haken} className={`${stand ? "btn-secondary" : "btn-primary"} ${busy || (braucht && !haken) ? "pointer-events-none opacity-45" : "cursor-pointer"} has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 has-[:focus-visible]:ring-offset-2`}>
          <Icon name="upload" size={15} />
          {stand ? "Neuen Lebenslauf hochladen" : "Lebenslauf hochladen"}
          <input
            ref={eingabe}
            type="file"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            disabled={busy || (braucht && !haken)}
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
        {zustimmung && einwilligung !== undefined && (
          <details className="disclosure mt-3">
            <summary>
              <Icon name="chevronRight" size={14} className="chevron" />
              Einwilligung erteilt{zustimmung.at ? ` am ${new Date(zustimmung.at).toLocaleDateString("de-DE")}` : ""} — was mit deinen Daten passiert
            </summary>
            <ul className="mt-2 list-disc space-y-1 pl-5 text-muted">
              {EINWILLIGUNG_PUNKTE.map((t) => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </details>
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
        onStand={(neu) => setSp(neu)}
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

type EinrichtungsSchritt = { titel: string; fertig: boolean; reiter: string; link?: string; empfohlen?: boolean };

/** Profil noch nicht fertig: geführte Einrichtung — Orientierung, keine Sperre. */
function Einrichtung({ schritte, zuReiter }: { schritte: EinrichtungsSchritt[]; zuReiter: (key: string) => void }) {
  // Nächster Schritt: der erste offene Pflichtschritt; „prüfen“ ist empfohlen, hält aber nicht auf
  const naechster = schritte.findIndex((s) => !s.fertig && !s.empfohlen);
  const erledigt = schritte.filter((s) => s.fertig).length;
  const n = naechster >= 0 ? schritte[naechster] : null;
  return (
    <section className="card-pad mb-5" aria-labelledby="einrichtung-titel">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="einrichtung-titel" className="section-title">
          Dein Profil einrichten
        </h2>
        <span className="tnum text-xs text-muted">
          {erledigt} von {schritte.length} erledigt
        </span>
      </div>
      <p className="section-lead">Danach findet nojobs jede Nacht passende Stellen für dich.</p>
      <ol className="mt-4 grid gap-2 sm:grid-cols-4">
        {schritte.map((s, i) => {
          const aktuell = i === naechster;
          return (
            <li
              key={s.titel}
              className={`flex items-start gap-2.5 rounded-lg border p-3 ${aktuell ? "border-brand bg-brand-soft/40" : s.fertig ? "border-keep/25 bg-keep-soft/30" : "border-rule"}`}
              aria-current={aktuell ? "step" : undefined}
            >
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-xs font-semibold ${
                  s.fertig ? "bg-keep text-white" : aktuell ? "bg-brand text-white" : "bg-subtle text-muted"
                }`}
              >
                {s.fertig ? <Icon name="check" size={13} /> : i + 1}
              </span>
              <span className="min-w-0">
                <span className={`block leading-snug ${aktuell ? "font-semibold" : s.fertig ? "text-ink/80" : "text-muted"}`}>{s.titel}</span>
                <span className="text-2xs text-muted">{s.fertig ? "erledigt" : aktuell ? "jetzt" : s.empfohlen ? "empfohlen" : "offen"}</span>
              </span>
            </li>
          );
        })}
      </ol>
      {n && (
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {n.link ? (
            <Link href={n.link} className="btn-primary">
              {n.titel} <Icon name="chevronRight" size={14} />
            </Link>
          ) : (
            <button type="button" className="btn-primary" onClick={() => zuReiter(n.reiter)}>
              {n.titel} <Icon name="chevronRight" size={14} />
            </button>
          )}
          {schritte[1] && !schritte[1].fertig && schritte[0].fertig && schritte[1].link && (
            <Link href={schritte[1].link} className="btn-secondary">
              Lebenslauf prüfen
            </Link>
          )}
        </div>
      )}
    </section>
  );
}

const LAYOUT_NAME: Record<string, string> = { editorial: "Editorial", klassisch: "Klassisch", seitenleiste: "Seitenleiste", zeitleiste: "Zeitleiste", minimal: "Minimal (ATS)" };
const FARB_NAME: Record<string, string> = { petrol: "Petrol", bordeaux: "Bordeaux", nachtblau: "Nachtblau", wald: "Wald", graphit: "Graphit" };

/** Profil eingerichtet: Übersicht in vier Karten — alles aus vorhandenen Daten. */
function ProfilUebersicht({
  lebenslauf,
  suchprofil,
  bestaetigtAt,
  unterlagen,
  telegram,
  zuReiter,
}: {
  lebenslauf: { bearbeitet: string | null; offen: number; datei: string | null };
  suchprofil: SuchprofilStand["vorschlag"];
  bestaetigtAt: string | null;
  unterlagen: LayoutStand | null;
  telegram: boolean;
  zuReiter: (key: string) => void;
}) {
  const tag = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("de-DE") : null);
  const Karte = ({ titel, icon, reiter, children, link }: { titel: string; icon: "file" | "search" | "sparkles" | "send"; reiter: string; children: ReactNode; link?: string }) => (
    <li className="card-pad flex flex-col">
      <p className="flex items-center gap-2 font-semibold">
        <span className="grid h-7 w-7 place-items-center rounded-full bg-brand-soft text-brand-strong">
          <Icon name={icon} size={14} />
        </span>
        {titel}
      </p>
      <div className="mt-2 flex-1 text-muted">{children}</div>
      <div className="mt-3 flex flex-wrap gap-2">
        {link && (
          <Link href={link} className="btn-secondary btn-sm">
            Bearbeiten
          </Link>
        )}
        <button type="button" className={link ? "btn-ghost btn-sm" : "btn-secondary btn-sm"} onClick={() => zuReiter(reiter)}>
          {link ? "Details" : "Bearbeiten"}
        </button>
      </div>
    </li>
  );
  return (
    <ul className="mb-5 grid gap-3 sm:grid-cols-2" aria-label="Dein Profil auf einen Blick">
      <Karte titel="Mein Lebenslauf" icon="file" reiter="lebenslauf" link="/profil/lebenslauf">
        <p>{lebenslauf.datei ? `Hochgeladen: ${lebenslauf.datei}` : "Hochgeladen"}</p>
        <p>{lebenslauf.bearbeitet ? `Zuletzt bearbeitet am ${tag(lebenslauf.bearbeitet)}` : "Noch nicht bearbeitet"}</p>
        {lebenslauf.offen > 0 && <p className="text-warn">{lebenslauf.offen} Verbesserungsvorschläge offen</p>}
      </Karte>
      <Karte titel="Meine Jobwünsche" icon="search" reiter="suchprofil">
        {suchprofil?.suchbegriffe?.length ? (
          <p className="flex flex-wrap gap-1">
            {suchprofil.suchbegriffe.slice(0, 6).map((b) => (
              <span key={b} className="badge-neutral font-normal">
                {b}
              </span>
            ))}
            {suchprofil.suchbegriffe.length > 6 && <span className="text-xs">+{suchprofil.suchbegriffe.length - 6}</span>}
          </p>
        ) : null}
        {suchprofil?.ort && (
          <p className="mt-1">
            {suchprofil.ort} · {suchprofil.umkreis} km Umkreis
          </p>
        )}
        {bestaetigtAt && <p className="text-keep">Aktiv seit {tag(bestaetigtAt)}</p>}
      </Karte>
      <Karte titel="Meine Unterlagen" icon="sparkles" reiter="unterlagen">
        {unterlagen ? (
          <p>
            Layout {LAYOUT_NAME[unterlagen.layout] ?? unterlagen.layout} · {FARB_NAME[unterlagen.akzent] ?? unterlagen.akzent} ·{" "}
            {unterlagen.layout === "minimal" ? "ohne Foto" : unterlagen.mitFoto ? "mit Foto" : "ohne Foto"}
          </p>
        ) : (
          <p>Noch nicht gewählt</p>
        )}
      </Karte>
      <Karte titel="Benachrichtigungen" icon="send" reiter="benachrichtigung">
        <p>{telegram ? "Telegram verbunden — neue Treffer kommen morgens aufs Handy." : "Telegram nicht verbunden."}</p>
      </Karte>
    </ul>
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
