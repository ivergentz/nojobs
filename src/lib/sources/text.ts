/** Kleine Helfer zum Aufbereiten fremder Stellentexte. */

const ENTITIES: Record<string, string> = {
  "&nbsp;": " ",
  "&amp;": "&",
  "&lt;": "<",
  "&gt;": ">",
  "&quot;": '"',
  "&#39;": "'",
  "&apos;": "'",
  "&auml;": "ä",
  "&ouml;": "ö",
  "&uuml;": "ü",
  "&Auml;": "Ä",
  "&Ouml;": "Ö",
  "&Uuml;": "Ü",
  "&szlig;": "ß",
  "&ndash;": "–",
  "&mdash;": "—",
  "&bdquo;": "„",
  "&ldquo;": "“",
  "&rdquo;": "”",
  "&euro;": "€",
  "&hellip;": "…",
};

export function decodeEntities(text: string): string {
  return text
    .replace(/&#(\d+);/g, (_, code) => String.fromCharCode(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCharCode(parseInt(code, 16)))
    .replace(/&[a-z]+;/gi, (entity) => ENTITIES[entity] ?? entity);
}

/** HTML → lesbarer Text mit Absätzen und Spiegelstrichen. */
export function htmlToText(html: string | null | undefined): string {
  if (!html) return "";
  // Greenhouse liefert das HTML selbst noch einmal maskiert (&lt;p&gt;).
  const source = /&lt;[a-z]/i.test(html) ? decodeEntities(html) : html;
  return decodeEntities(
    source
      .replace(/<(script|style)[\s\S]*?<\/\1>/gi, "")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<li[^>]*>/gi, "\n• ")
      .replace(/<\/(p|div|li|ul|ol|h[1-6])>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

export function clean(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
}

export function toIso(value: unknown): string | null {
  if (value === null || value === undefined || value === "") return null;
  const date =
    typeof value === "number"
      ? new Date(value < 1e12 ? value * 1000 : value) // Sekunden oder Millisekunden
      : new Date(String(value));
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

/** Fetch mit Timeout. */
export async function fetchWithTimeout(url: string, init: RequestInit = {}, ms = 12_000): Promise<Response> {
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), ms);
  try {
    return await fetch(url, { ...init, cache: "no-store", signal: abort.signal });
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Grobe Vorauswahl nach Titel. Firmen-Feeds enthalten alle Stellen — vom
 * Lager bis zur Buchhaltung. Ans Modell geht nur, was nach Produkt, KI oder
 * Digitalisierung klingt. Großzügig gehalten; das Feinurteil macht das Modell.
 */
const TITEL_PASST = [
  "product", "produkt", "owner", "ai ", " ai", "(ai", "ai-", "ki ", " ki", "ki-", "(ki",
  "künstliche intelligenz", "artificial intelligence", "machine learning", "genai",
  "gen ai", "llm", "agentic", "digital", "transformation", "program manager",
  "programm manager", "programmmanager", "innovation", "automation", "automatisierung",
  "solution", "platform", "plattform", "conversational", "chatbot", "growth",
];

const TITEL_RAUS = [
  "praktikum", "praktikant", "intern ", "internship", "werkstudent", "working student",
  "trainee", "ausbildung", "azubi", "duales studium", "abschlussarbeit", "thesis",
  "minijob", "aushilfe",
];

export function titelVerdict(title: string): { keep: true; matched: string } | { keep: false; reason: string } {
  const t = ` ${title.toLowerCase()} `;
  const raus = TITEL_RAUS.find((needle) => t.includes(needle));
  if (raus) return { keep: false, reason: `titel-ausschluss:${raus.trim()}` };
  const treffer = TITEL_PASST.find((needle) => t.includes(needle));
  if (!treffer) return { keep: false, reason: "titel-kein-treffer" };
  return { keep: true, matched: treffer.trim() };
}

/** Hamburg, remote oder ohne Ortsangabe — alles andere fällt raus. */
const HAMBURG = [
  "hamburg", "norderstedt", "pinneberg", "ahrensburg", "wedel", "quickborn", "lüneburg",
  "buxtehude", "reinbek", "henstedt",
];
const REMOTE = ["remote", "home office", "homeoffice", "mobiles arbeiten", "anywhere", "deutschlandweit", "germany (remote)"];

export function ortVerdict(
  ort: string,
  remoteFlag?: boolean | null
): { keep: true; art: "hamburg" | "remote" | "unklar" } | { keep: false; reason: string } {
  const o = ort.toLowerCase();
  if (HAMBURG.some((stadt) => o.includes(stadt))) return { keep: true, art: "hamburg" };
  if (remoteFlag === true || REMOTE.some((wort) => o.includes(wort))) return { keep: true, art: "remote" };
  if (!o.trim()) return { keep: true, art: "unklar" };
  return { keep: false, reason: "weder-hamburg-noch-remote" };
}

/** Schlüssel für Dubletten über Quellen hinweg: Firma + Titel, ohne (m/w/d) und Rechtsform. */
export function dublettenKey(firma: string, titel: string): string {
  return `${firma}|${titel}`
    .toLowerCase()
    .replace(/\((?:[mwdfx]\s*\/\s*){1,3}[mwdfx]\)|\(all genders?\)/g, "")
    .replace(/\b(gmbh|ag|se|kg|co|mbh|ug)\b/g, "")
    .replace(/[^a-z0-9äöüß|]+/g, "");
}
