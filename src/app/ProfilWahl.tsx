"use client";

import { useRouter } from "next/navigation";

/**
 * Schritt 2.2 · Profil-Auswahl in der Navigation. Speichert die Wahl im Cookie
 * „ci-profil“ (ein Jahr, nur diese Seite). Erscheint erst, wenn es mehr als
 * ein aktives Profil gibt.
 */
export default function ProfilWahl({ profile, aktuell }: { profile: Array<{ slug: string; name: string }>; aktuell: string }) {
  const router = useRouter();
  const waehlen = (slug: string) => {
    document.cookie = `ci-profil=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  return (
    <label className="flex shrink-0 items-center gap-2 text-muted">
      <span className="sr-only">Profil</span>
      <select
        value={aktuell}
        onChange={(e) => waehlen(e.target.value)}
        className="rounded border border-rule bg-transparent px-2 py-0.5 text-sm text-ink"
        aria-label="Profil wählen"
      >
        {profile.map((p) => (
          <option key={p.slug} value={p.slug}>
            {p.name}
          </option>
        ))}
      </select>
    </label>
  );
}
