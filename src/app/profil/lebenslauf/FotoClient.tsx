"use client";

import { useEffect, useRef, useState } from "react";
import Icon from "@/components/ui/Icon";

const RAHMEN_B = 240;
const RAHMEN_H = 300; // 4:5
const AUSGABE_B = 800;
const AUSGABE_H = 1000;

/**
 * Schritt 2.5 · Passfoto hochladen und im Browser auf 4:5 zuschneiden (verschieben + zoomen).
 * Hochgeladen wird nur der Ausschnitt als JPEG — das Original verlässt das Gerät nicht.
 */
export default function FotoClient({ initialUrl, slug }: { initialUrl: string | null; slug: string }) {
  const [url, setUrl] = useState<string | null>(initialUrl);
  const [bild, setBild] = useState<HTMLImageElement | null>(null);
  const [zoom, setZoom] = useState(1);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const [busy, setBusy] = useState(false);
  const [meldung, setMeldung] = useState<{ text: string; fehler?: boolean } | null>(null);
  const zieht = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const eingabe = useRef<HTMLInputElement>(null);

  // Grundmaßstab: Bild füllt den Rahmen vollständig („cover“)
  const basis = bild ? Math.max(RAHMEN_B / bild.naturalWidth, RAHMEN_H / bild.naturalHeight) : 1;
  const massstab = basis * zoom;
  const breite = bild ? bild.naturalWidth * massstab : 0;
  const hoehe = bild ? bild.naturalHeight * massstab : 0;

  // Position so begrenzen, dass nie ein leerer Rand im Rahmen entsteht
  const begrenze = (p: { x: number; y: number }, b = breite, h = hoehe) => ({
    x: Math.min(0, Math.max(RAHMEN_B - b, p.x)),
    y: Math.min(0, Math.max(RAHMEN_H - h, p.y)),
  });
  useEffect(() => setPos((p) => begrenze(p)), [zoom, bild]); // eslint-disable-line react-hooks/exhaustive-deps

  const waehlen = (datei: File) => {
    setMeldung(null);
    if (!/^image\/(jpeg|png|webp)$/.test(datei.type)) {
      setMeldung({ text: "Bitte ein JPG-, PNG- oder WebP-Bild wählen.", fehler: true });
      return;
    }
    if (datei.size > 15 * 1024 * 1024) {
      setMeldung({ text: "Das Bild ist größer als 15 MB.", fehler: true });
      return;
    }
    const img = new Image();
    img.onload = () => {
      const b = Math.max(RAHMEN_B / img.naturalWidth, RAHMEN_H / img.naturalHeight);
      setBild(img);
      setZoom(1);
      setPos({ x: (RAHMEN_B - img.naturalWidth * b) / 2, y: (RAHMEN_H - img.naturalHeight * b) / 2 });
    };
    img.onerror = () => setMeldung({ text: "Das Bild konnte nicht geöffnet werden.", fehler: true });
    img.src = URL.createObjectURL(datei);
  };

  const speichern = async () => {
    if (!bild) return;
    setBusy(true);
    setMeldung(null);
    try {
      const canvas = document.createElement("canvas");
      canvas.width = AUSGABE_B;
      canvas.height = AUSGABE_H;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("Zuschneiden wird von diesem Browser nicht unterstützt.");
      const f = AUSGABE_B / RAHMEN_B;
      ctx.fillStyle = "#fff";
      ctx.fillRect(0, 0, AUSGABE_B, AUSGABE_H);
      ctx.imageSmoothingQuality = "high";
      ctx.drawImage(bild, pos.x * f, pos.y * f, breite * f, hoehe * f);
      const blob: Blob | null = await new Promise((ok) => canvas.toBlob(ok, "image/jpeg", 0.88));
      if (!blob) throw new Error("Zuschneiden fehlgeschlagen.");
      const form = new FormData();
      form.append("datei", new File([blob], "foto.jpg", { type: "image/jpeg" }));
      const res = await fetch("/api/foto", { method: "POST", body: form });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setUrl(`/api/foto?profil=${encodeURIComponent(slug)}&v=${encodeURIComponent(body.foto.aktualisiert)}`);
      setBild(null);
      setMeldung({ text: "Foto gespeichert." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
      if (eingabe.current) eingabe.current.value = "";
    }
  };

  const entfernen = async () => {
    setBusy(true);
    setMeldung(null);
    try {
      const res = await fetch("/api/foto", { method: "DELETE" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error ?? `HTTP ${res.status}`);
      setUrl(null);
      setMeldung({ text: "Foto entfernt." });
    } catch (err) {
      setMeldung({ text: err instanceof Error ? err.message : String(err), fehler: true });
    } finally {
      setBusy(false);
    }
  };

  const tasten = (e: React.KeyboardEvent) => {
    const schritt = e.shiftKey ? 20 : 5;
    const d = { ArrowLeft: [schritt, 0], ArrowRight: [-schritt, 0], ArrowUp: [0, schritt], ArrowDown: [0, -schritt] }[e.key];
    if (!d) return;
    e.preventDefault();
    setPos((p) => begrenze({ x: p.x + d[0], y: p.y + d[1] }));
  };

  return (
    <section className="card-pad text-sm">
      <h2 className="section-title">Foto</h2>
      <p className="section-lead">
        Optional. Erscheint als dein Bild hier in der App und — wenn du willst — später in Lebenslauf und Anschreiben. Für Bewerbungen ins
        Ausland lässt man es meist weg.
      </p>

      <div className="mt-4 flex flex-col gap-5 sm:flex-row sm:items-start">
        {bild ? (
          <div className="shrink-0">
            <div
              className="relative cursor-grab touch-none overflow-hidden rounded-lg border border-rule bg-subtle active:cursor-grabbing"
              style={{ width: RAHMEN_B, height: RAHMEN_H }}
              tabIndex={0}
              role="img"
              aria-label="Bildausschnitt — mit der Maus oder den Pfeiltasten verschieben"
              onKeyDown={tasten}
              onPointerDown={(e) => {
                (e.target as HTMLElement).setPointerCapture(e.pointerId);
                zieht.current = { x: e.clientX, y: e.clientY, px: pos.x, py: pos.y };
              }}
              onPointerMove={(e) => {
                const z = zieht.current;
                if (z) setPos(begrenze({ x: z.px + e.clientX - z.x, y: z.py + e.clientY - z.y }));
              }}
              onPointerUp={() => (zieht.current = null)}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={bild.src} alt="" draggable={false} className="pointer-events-none absolute max-w-none select-none" style={{ left: pos.x, top: pos.y, width: breite, height: hoehe }} />
            </div>
            <label className="mt-3 flex items-center gap-2" style={{ width: RAHMEN_B }}>
              <Icon name="minus" size={14} className="text-muted" />
              <input type="range" min={1} max={3} step={0.01} value={zoom} onChange={(e) => setZoom(Number(e.target.value))} className="w-full" aria-label="Zoom" />
              <Icon name="plus" size={14} className="text-muted" />
            </label>
          </div>
        ) : url ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={url} alt="Dein Foto" width={160} height={200} className="h-[200px] w-[160px] shrink-0 rounded-lg border border-rule object-cover" />
        ) : (
          <div className="grid h-[200px] w-[160px] shrink-0 place-items-center rounded-lg border border-dashed border-rule bg-subtle/60 text-muted">
            <Icon name="user" size={36} />
          </div>
        )}

        <div className="min-w-0 space-y-3">
          {bild ? (
            <>
              <p className="text-muted">Ausschnitt verschieben und zoomen. Am besten Kopf und Schultern, Blick in die Kamera.</p>
              <div className="flex flex-wrap gap-2">
                <button type="button" onClick={() => void speichern()} disabled={busy} className="btn-primary">
                  {busy ? "Speichert …" : "Ausschnitt speichern"}
                </button>
                <button type="button" onClick={() => setBild(null)} disabled={busy} className="btn-ghost">
                  Abbrechen
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-wrap gap-2">
              <label className={`btn-secondary cursor-pointer has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-brand/60 ${busy ? "pointer-events-none opacity-45" : ""}`}>
                <Icon name="upload" size={15} />
                {url ? "Anderes Foto" : "Foto hochladen"}
                <input
                  ref={eingabe}
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  className="sr-only"
                  onChange={(e) => {
                    const f = e.target.files?.[0];
                    if (f) waehlen(f);
                  }}
                />
              </label>
              {url && (
                <button type="button" onClick={() => void entfernen()} disabled={busy} className="btn-ghost hover:text-drop">
                  Entfernen
                </button>
              )}
            </div>
          )}
          <p className="text-xs text-muted">JPG, PNG oder WebP. Gespeichert wird nur der Ausschnitt, in einem privaten Speicher.</p>
          {meldung && <p className={meldung.fehler ? "alert-error" : "alert-success"}>{meldung.text}</p>}
        </div>
      </div>
    </section>
  );
}
