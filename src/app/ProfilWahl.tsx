"use client";

import { useRouter } from "next/navigation";
import Icon from "@/components/ui/Icon";
import Avatar from "@/components/ui/Avatar";

/**
 * Schritt 2.2 · Profil-Auswahl in der Navigation. Speichert die Wahl im Cookie
 * „ci-profil“ (ein Jahr, nur diese Seite). Erscheint erst, wenn es mehr als
 * ein aktives Profil gibt. Verhalten unverändert — nur neu gestaltet.
 */
export default function ProfilWahl({
  profile,
  aktuell,
}: {
  profile: Array<{ slug: string; name: string; fotoVersion?: string | null }>;
  aktuell: string;
}) {
  const router = useRouter();
  const waehlen = (slug: string) => {
    document.cookie = `ci-profil=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
    router.refresh();
  };
  const gewaehlt = profile.find((p) => p.slug === aktuell);
  const name = gewaehlt?.name ?? "";
  // Schritt 2.5: Foto des gewählten Profils als Avatar
  const foto = gewaehlt?.fotoVersion ? `/api/foto?profil=${encodeURIComponent(aktuell)}&v=${encodeURIComponent(gewaehlt.fotoVersion)}` : null;
  return (
    <label className="block rounded px-2.5 py-1.5">
      <span className="text-2xs font-medium uppercase tracking-[0.1em] text-muted/80">Profil</span>
      <span className="relative mt-1 flex items-center">
        <span className="pointer-events-none absolute left-2.5">
          <Avatar name={name} src={foto} groesse={20} />
        </span>
        <select
          value={aktuell}
          onChange={(e) => waehlen(e.target.value)}
          className="w-full appearance-none rounded border border-rule bg-surface py-1.5 pl-9 pr-8 text-sm text-ink shadow-card transition hover:border-ink/25 focus:border-brand focus:outline-none focus:ring-2 focus:ring-brand/20"
          aria-label="Profil wählen"
        >
          {profile.map((p) => (
            <option key={p.slug} value={p.slug}>
              {p.name}
            </option>
          ))}
        </select>
        <Icon name="chevronDown" size={14} className="pointer-events-none absolute right-2.5 text-muted" />
      </span>
    </label>
  );
}
