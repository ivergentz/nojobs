"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";
import { Schritt } from "./LebenslaufClient";

type Stand = { verbunden: boolean; name: string | null; seit: string | null };

/** Phase 3 · „Mit Telegram verbinden“ — Link zum Bot, dann so lange nachfragen, bis „Start“ getippt wurde. */
export default function TelegramClient({ initial }: { initial: Stand }) {
  const [stand, setStand] = useState<Stand>(initial);
  const [link, setLink] = useState<{ app: string; web: string; qr: string } | null>(null);
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
    // Handy: Telegram direkt öffnen (Fenster sofort im Klick, sonst blockiert der Browser).
    // Computer: QR-Code zeigen — dort ist die App oft nicht installiert.
    const handy = window.matchMedia("(pointer: coarse)").matches;
    const fenster = handy ? window.open("", "_blank") : null;
    try {
      const body = await api("start");
      setLink({ app: body.link, web: body.web, qr: body.qr });
      if (fenster) fenster.location.href = body.link;
      setWartet(true);
      const ende = Date.now() + 15 * 60_000;
      takt.current = setInterval(async () => {
        if (Date.now() > ende) {
          stoppen();
          setLink(null);
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
            setLink(null);
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
              {wartet && link && (
                <div className="mt-4 rounded-lg border border-brand/20 bg-brand-soft/50 p-4" role="status" aria-live="polite">
                  <div className="flex flex-col gap-4 sm:flex-row sm:items-start">
                    <div
                      className="mx-auto shrink-0 overflow-hidden rounded-lg border border-rule bg-white p-1 sm:mx-0 [&>svg]:h-40 [&>svg]:w-40"
                      dangerouslySetInnerHTML={{ __html: link.qr }}
                    />
                    <div className="min-w-0">
                      <p className="font-medium">Mit dem Handy abscannen</p>
                      <p className="mt-0.5 text-muted">
                        Kamera aufs Bild halten, Telegram öffnet sich — dort unten auf <span className="font-medium text-ink">„Start“</span> tippen.
                      </p>
                      <p className="mt-3 text-muted">Oder direkt hier:</p>
                      <div className="mt-1.5 flex flex-wrap gap-2">
                        <a href={link.app} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                          In der Telegram-App öffnen
                        </a>
                        <a href={link.web} target="_blank" rel="noopener noreferrer" className="btn-secondary btn-sm">
                          Telegram Web (Browser)
                        </a>
                      </div>
                      <p className="mt-3 flex items-center gap-1.5 text-xs text-muted">
                        <Icon name="loader" size={13} className="animate-spin" /> Wartet auf „Start“ — diese Seite merkt es automatisch.
                      </p>
                    </div>
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
