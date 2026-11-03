"use client";

import { useRouter } from "next/navigation";

/** Band oben in der Ansicht eines anderen Profils: zurück zum eigenen Profil (gleicher Cookie wie die Profilauswahl). */
export default function ZurueckZuMir({ slug }: { slug: string }) {
  const router = useRouter();
  return (
    <button
      type="button"
      className="shrink-0 rounded border border-brand/30 bg-surface px-2 py-0.5 text-xs font-medium text-brand-strong transition hover:border-brand"
      onClick={() => {
        document.cookie = `ci-profil=${encodeURIComponent(slug)}; path=/; max-age=31536000; samesite=lax`;
        router.refresh();
      }}
    >
      Zurück zu meinem Profil
    </button>
  );
}
