"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { Schritt } from "./LebenslaufClient";

type Stand = { verbunden: boolean; name: string | null; seit: string | null };

/** Phase 3 · „Mit Telegram verbinden“ — Link zum Bot, dann so lange nachfragen, bis „Start“ getippt wurde. */
export default function TelegramClient({ initial }: { initial: Stand }) {
  const [stand, setStand] = useState<Stand>(initial);
  const [link, setLink] = useState<string | null>(null);
  const [wartet, setWartet] = useState(false);
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);
  const takt = useRef<ReturnType<typeof setInterval> | null>(null);

  const api = async (aktion: string) => {
    const res = await fetch("/api/telegram", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ aktion }) });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
    return body;
  };

  const stoppen = () => {
    if (takt.current) clearInterval(takt.current);
    takt.current = null;
    setWartet(false);
  };
  useEffect(() => stoppen, []);

  const verbinden = async () => {
    setBusy(true);
    setMeldung(null);
    // Fenster sofort im Klick öffnen (sonst blockieren Browser das Pop-up), Adresse danach setzen.
    const fenster = window.open("", "_blank");
    try {
      const body = await api("start");
      setLink(body.link);
      if (fenster) fenster.location.href = body.link;
      setWartet(true);
      const ende = Date.now() + 5 * 60_000;
      takt.current = setInterval(async () => {
        if (Date.now() > ende) {
          stoppen();
          setMeldung({ text: "Noch keine Bestätigung angekommen. Einfach noch einmal verbinden.", fehler: true });
          return;
        }
        try {
          const r = await api("pruefen");
          if (r.verbunden) {
            stoppen();
            setStand({ verbunden: true, name: r.name, seit: r.seit });
            setLink(null);
            setMeldung({ text: "Verbunden — in Telegram kam gerade eine Bestätigung." });
          } else if (r.abgelaufen) {
            stoppen();
            setMeldung({ text: "Der Code ist abgelaufen. Bitte noch einmal verbinden.", fehler: true });
          }
        } catch (err) {
          stoppen();
          setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
        }
      }, 3000);
    } catch (err) {
      fenster?.close();
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  const einfach = async (aktion: "test" | "trennen") => {
    setBusy(true);
    setMeldung(null);
    try {
      await api(aktion);
      if (aktion === "trennen") setStand({ verbunden: false, name: null, seit: null });
      setMeldung({ text: aktion === "test" ? "Testnachricht gesendet." : "Getrennt — es kommen keine Nachrichten mehr." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  const seit = stand.seit ? new Date(stand.seit).toLocaleDateString("de-DE", { day: "2-digit", month: "2-digit", year: "numeric" }) : null;

  return (
    <section className="card-pad mt-6 text-sm">
      <div className="flex items-start gap-3">
        <Schritt nr={4} fertig={stand.verbunden} />
        <div className="min-w-0 flex-1">
          <h2 className="section-title">Morgens aufs Handy</h2>
          <p className="section-lead">
            Jeden Morgen eine kurze Telegram-Nachricht, wenn es neue Stellen zum Bewerben gibt. An Tagen ohne Treffer bleibt es still.
          </p>

          {stand.verbunden ? (
            <div className="mt-4">
              <p className="flex items-center gap-1.5 font-medium text-keep">
                <Icon name="circleCheck" size={16} /> Verbunden mit {stand.name}
                {seit && <span className="font-normal text-muted">· seit {seit}</span>}
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button type="button" onClick={() => void einfach("test")} disabled={busy} className="btn-secondary">
                  <Icon name="send" size={15} /> Testnachricht
                </button>
                <button type="button" onClick={() => void einfach("trennen")} disabled={busy} className="btn-ghost">
                  Trennen
                </button>
              </div>
            </div>
          ) : (
            <div className="mt-4">
              <button type="button" onClick={() => void verbinden()} disabled={busy || wartet} className="btn-primary">
                <Icon name="send" size={15} /> Mit Telegram verbinden
              </button>
              {wartet && (
                <div className="alert-info mt-3" role="status" aria-live="polite">
                  <Icon name="loader" size={18} className="mt-0.5 animate-spin text-brand" />
                  <div>
                    <p className="font-medium">Telegram hat sich geöffnet — dort unten auf „Start“ tippen.</p>
                    <p className="mt-0.5 text-muted">
                      Diese Seite merkt es automatisch. Nichts passiert?{" "}
                      {link && (
                        <a href={link} target="_blank" rel="noopener noreferrer" className="link">
                          Link noch einmal öffnen
                        </a>
                      )}
                    </p>
                  </div>
                </div>
              )}
              <p className="mt-3 text-xs text-muted">Du brauchst die Telegram-App auf dem Handy oder Computer. Trennen geht jederzeit.</p>
            </div>
          )}

          {meldung && <p className={`mt-3 ${meldung.fehler ? "alert-error" : "alert-success"}`}>{meldung.text}</p>}
        </div>
      </div>
    </section>
  );
}
