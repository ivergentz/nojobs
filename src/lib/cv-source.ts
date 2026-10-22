import fallback from "@/data/cv.json";

/**
 * Lebenslauf und Design-Assets kommen von der Bewerbungsseite ivergentz.de.
 *
 *   https://ivergentz.de/cv.json        — Inhalt (wird beim Build der Seite
 *                                          aus src/i18n/cv.js erzeugt)
 *   https://ivergentz.de/fonts/*.ttf     — Schriften für die PDFs
 *   https://ivergentz.de/images/portrait-cv.jpg — Foto
 *
 * Änderst du den Lebenslauf auf der Website, ziehen die Unterlagen hier beim
 * nächsten PDF automatisch nach. Ist die Seite nicht erreichbar, greift die
 * Kopie in src/data/cv.json — die Unterlagen funktionieren dann weiter, nur
 * eventuell mit älterem Stand.
 */

export const CV_BASE = (process.env.CV_SOURCE_URL || "https://ivergentz.de").replace(/\/+$/, "");

export type Lang = "de" | "en";

export type Cv = {
  role: string;
  formerName: string;
  tagline: string;
  contact: { location: string; email: string; phone: string; web: string };
  labels: Record<string, string>;
  competencies: Array<{ label: string; items: string }>;
  experience: Array<{ period: string; title: string; company: string; bullets: string[] }>;
  products: Array<{ name: string; url: string; status: string; bullets: string[] }>;
  education: Array<{ period: string; title: string; school: string }>;
  languages: Array<{ name: string; level: string }>;
};

type CvFile = { de: Cv; en: Cv };

const TIMEOUT_MS = 5_000;

function valid(data: unknown): data is CvFile {
  const file = data as Partial<CvFile> | null;
  return Boolean(
    file &&
      Array.isArray(file.de?.experience) &&
      Array.isArray(file.en?.experience) &&
      typeof file.de?.role === "string"
  );
}

export async function loadCv(lang: Lang): Promise<{ cv: Cv; quelle: "ivergentz.de" | "Fallback" }> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(`${CV_BASE}/cv.json`, { cache: "no-store", signal: abort.signal });
    if (res.ok) {
      const data = (await res.json()) as unknown;
      if (valid(data)) return { cv: data[lang], quelle: "ivergentz.de" };
    }
  } catch {
    /* Seite nicht erreichbar — Fallback */
  } finally {
    clearTimeout(timer);
  }
  return { cv: (fallback as unknown as CvFile)[lang], quelle: "Fallback" };
}

/** Tiefe Kopie, damit Anpassungen pro Bewerbung das Original nicht verändern. */
export function cloneCv(cv: Cv): Cv {
  return JSON.parse(JSON.stringify(cv)) as Cv;
}
