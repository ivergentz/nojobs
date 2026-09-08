import cvData from "@/data/cv.json";

/**
 * Erzeugt einen Bewerbungsentwurf zu einer Stelle.
 *
 * Bewusst ein ENTWURF: Das Ergebnis landet in der Datenbank und wird auf der
 * Bewerbungsseite bearbeitet, bevor ein PDF entsteht. Ein Anschreiben, das
 * Iver nicht selbst durchdacht hat, fällt im Gespräch auf.
 *
 * Der Lebenslauf wird nicht neu geschrieben, sondern nur umsortiert und in
 * einzelnen Bullets geschärft — erfundene Erfahrung wäre der schnellste Weg,
 * ein Interview zu verlieren.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";
const CALL_TIMEOUT_MS = 90_000;

export type CvOverrides = {
  role?: string;
  tagline?: string;
  productOrder?: string[];
  bulletRewrites?: Array<{ section: "products" | "experience"; name: string; bullets: string[] }>;
};

export type ApplicationDraft = {
  lang: "de" | "en";
  role: string;
  recipient: string[];
  subject: string;
  headline: string;
  paragraphs: string[];
  signOff: string;
  cvOverrides: CvOverrides;
  hinweise: string[];
};

function profileFor(lang: "de" | "en") {
  const cv = (cvData as Record<string, any>)[lang];
  return JSON.stringify(
    {
      role: cv.role,
      tagline: cv.tagline,
      products: cv.products.map((p: any) => ({ name: p.name, bullets: p.bullets, stack: p.stack })),
      experience: cv.experience.map((e: any) => ({
        title: e.title,
        company: e.company,
        period: e.period,
        bullets: e.bullets,
      })),
      skills: cv.skills,
      languages: cv.languages,
    },
    null,
    1
  );
}

const RULES = `Du entwirfst Bewerbungsunterlagen für Iver Bohnes.

HARTE REGELN:
- Nichts erfinden. Jede Aussage muss sich auf den gelieferten Lebenslauf zurückführen lassen.
- Keine Jahreszahlen, Firmennamen oder Kennzahlen ergänzen, die nicht im Lebenslauf stehen.
- Seniorität nicht aufblasen: Iver hat rund drei Jahre in Produktrollen plus sein eigenes SaaS-Portfolio. Er ist Mid-Level bis unteres Senior, kein Head of Product.
- Keine Floskeln. Kein "mit großem Interesse habe ich Ihre Stellenanzeige gelesen", kein "dynamisches Umfeld", kein "Teamplayer".
- Wenn eine Anforderung nicht erfüllt ist, wird sie nicht überspielt. Entweder weglassen oder offen benennen und mit dem Nächstbesten kontern.

ANSCHREIBEN:
- Drei bis vier Absätze, zusammen höchstens 300 Wörter.
- Absatz 1: warum diese Firma und diese Rolle, konkret aus der Ausschreibung. Kein Selbstlob.
- Absatz 2: der stärkste Beleg aus Ivers Profil für genau diese Rolle.
- Absatz 3: der zweitstärkste, oder ein offener Punkt ehrlich adressiert.
- Absatz 4 optional: Verfügbarkeit, Umzugsbereitschaft, Sprache.
- Sprache der Ausschreibung übernehmen. Schwedische oder norwegische Ausschreibung: englisch schreiben.
- headline: ein Satz, der als Aufmacher über dem Fließtext steht. Höchstens 12 Wörter. Darf leer sein.
- subject: Betreffzeile in Großbuchstaben-Optik, höchstens 8 Wörter, z. B. "BEWERBUNG ALS PRODUKTMANAGER" oder "APPLICATION — PRODUCT OWNER E-COMMERCE".
- recipient: ein bis drei Zeilen, Firmenname und Ort. Nur was in der Ausschreibung steht. Keine erfundenen Ansprechpartner.

LEBENSLAUF-ANPASSUNG (cvOverrides):
- role: Ivers Rollenbezeichnung oben im CV, auf die Stelle zugeschnitten. Höchstens 6 Wörter.
- tagline: der Einleitungssatz, auf die Stelle zugeschnitten. Höchstens 45 Wörter. Auf denselben Fakten wie das Original.
- productOrder: die Namen der drei Produkte in der Reihenfolge, die für diese Stelle am meisten überzeugt.
- bulletRewrites: höchstens vier Stichpunkte umformulieren, mit Angabe von section und name. Nur Betonung verschieben, keine neuen Fakten.

hinweise: zwei bis vier Sätze auf Deutsch an Iver — was du warum betont hast, und welche Lücke er im Gespräch erklären können muss.

Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown-Fences:
{"lang":"de"|"en","role":string,"recipient":string[],"subject":string,"headline":string,"paragraphs":string[],"signOff":string,"cvOverrides":{"role":string,"tagline":string,"productOrder":string[],"bulletRewrites":[{"section":"products"|"experience","name":string,"bullets":string[]}]},"hinweise":string[]}`;

export async function draftApplication(input: {
  lang: "de" | "en";
  title: string;
  employer: string;
  place: string;
  description: string;
}): Promise<ApplicationDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt.");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), CALL_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(ANTHROPIC_URL, {
      signal: abort.signal,
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: process.env.DRAFT_MODEL ?? "claude-sonnet-5",
        max_tokens: 3000,
        system: `${RULES}\n\nIVERS LEBENSLAUF (${input.lang}):\n${profileFor(input.lang)}`,
        messages: [
          {
            role: "user",
            content: [
              `Sprache der Unterlagen: ${input.lang}`,
              `Stelle: ${input.title}`,
              `Arbeitgeber: ${input.employer}`,
              `Ort: ${input.place}`,
              "",
              "Ausschreibung:",
              input.description.slice(0, 12000),
            ].join("\n"),
          },
        ],
      }),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error("Zeitüberschreitung beim Entwurf.");
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Anthropic API: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };
  const raw = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start === -1 || end <= start) {
    throw new Error(`Kein JSON (stop_reason: ${data.stop_reason ?? "?"}): ${raw.slice(0, 200)}`);
  }

  const candidate = raw.slice(start, end + 1);
  let parsed: Partial<ApplicationDraft>;
  try {
    parsed = JSON.parse(candidate) as Partial<ApplicationDraft>;
  } catch {
    parsed = JSON.parse(
      candidate.replace(/[\u0000-\u001f]/g, (char) => (char === "\n" ? "\\n" : ""))
    ) as Partial<ApplicationDraft>;
  }

  const list = (value: unknown): string[] =>
    Array.isArray(value) ? value.filter((entry): entry is string => typeof entry === "string") : [];

  return {
    lang: parsed.lang === "en" ? "en" : input.lang,
    role: parsed.role ?? (cvData as any)[input.lang].role,
    recipient: list(parsed.recipient),
    subject: parsed.subject ?? "",
    headline: parsed.headline ?? "",
    paragraphs: list(parsed.paragraphs),
    signOff:
      parsed.signOff ?? (input.lang === "de" ? "Mit freundlichen Grüßen" : "Kind regards"),
    cvOverrides: (parsed.cvOverrides ?? {}) as CvOverrides,
    hinweise: list(parsed.hinweise),
  };
}

/** Wendet die Anpassungen auf die CV-Daten an. Reine Umsortierung und Textersatz. */
export function applyOverrides(lang: "de" | "en", overrides: CvOverrides) {
  const base = JSON.parse(JSON.stringify((cvData as Record<string, any>)[lang]));

  if (overrides.role) base.role = overrides.role;
  if (overrides.tagline) base.tagline = overrides.tagline;

  if (overrides.productOrder?.length) {
    const order = overrides.productOrder;
    base.products.sort((a: any, b: any) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  for (const rewrite of overrides.bulletRewrites ?? []) {
    const collection = rewrite.section === "products" ? base.products : base.experience;
    const entry = collection.find(
      (item: any) => item.name === rewrite.name || item.title === rewrite.name
    );
    if (entry && rewrite.bullets?.length) entry.bullets = rewrite.bullets;
  }

  return base;
}
