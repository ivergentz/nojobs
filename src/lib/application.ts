import { DEFAULT_MODEL } from "./evaluate";
import { cloneCv, loadCv, type Cv, type Lang } from "./cv-source";

/**
 * Erzeugt einen Bewerbungsentwurf zu einer Stelle.
 *
 * Grundlage ist der Lebenslauf von ivergentz.de (siehe cv-source.ts) — also
 * immer der Stand, den auch die Website zeigt.
 *
 * Bewusst ein ENTWURF: Das Ergebnis landet in der Datenbank und wird auf der
 * Bewerbungsseite bearbeitet, bevor ein PDF entsteht.
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
  lang: Lang;
  role: string;
  recipient: string[];
  subject: string;
  headline: string;
  paragraphs: string[];
  signOff: string;
  salutation?: string;
  closing?: string;
  facts?: { salary?: string; notice?: string };
  cvOverrides: CvOverrides;
  hinweise: string[];
};

function profileFor(cv: Cv) {
  return JSON.stringify(
    {
      role: cv.role,
      tagline: cv.tagline,
      competencies: cv.competencies,
      experience: cv.experience,
      products: cv.products.map((p) => ({ name: p.name, status: p.status, bullets: p.bullets })),
      education: cv.education,
      languages: cv.languages,
    },
    null,
    1
  );
}

const RULES = `Du entwirfst Bewerbungsunterlagen für Iver Bohnes (geb. Gentz, daher die Domain ivergentz.de).

HARTE REGELN:
- Nichts erfinden. Jede Aussage muss sich auf den gelieferten Lebenslauf zurückführen lassen.
- Keine Jahreszahlen, Firmennamen oder Kennzahlen ergänzen, die nicht im Lebenslauf stehen.
- Seniorität nicht aufblasen: rund drei Jahre in Produktrollen plus eigenes SaaS-Portfolio. Kein Head of Product.
- Iver denkt Produkte ganzheitlich: Prototyp, MVP, laufende Verbesserung UND Vermarktung (Ads, Social, Cold Outreach). Nie so formulieren, als würde er nach dem Prototyp aufhören.
- Keine Floskeln. Kein "mit großem Interesse habe ich Ihre Stellenanzeige gelesen", kein "dynamisches Umfeld", kein "Teamplayer".
- Wenn eine Anforderung nicht erfüllt ist, wird sie nicht überspielt. Entweder weglassen oder offen benennen und mit dem Nächstbesten kontern.
- Gehalt und Kündigungsfrist NICHT in den Text schreiben — die stehen separat in einer Faktenzeile.

ANSCHREIBEN:
- headline: der Aufmacher direkt nach der Anrede, ein bis zwei Sätze, höchstens 35 Wörter. Greift auf, was die Firma laut Ausschreibung wirklich sucht, und sagt, warum Iver genau das gerade tut.
- paragraphs: drei bis vier Absätze, zusammen höchstens 280 Wörter. Jeder Absatz beginnt mit einem kurzen fett markierten Einstieg in der Form **Einstieg in wenigen Wörtern.** gefolgt vom Text.
  - Absatz 1: der stärkste Beleg aus Ivers Profil für genau diese Rolle (meist VBG: KI-Posteingang, MVP selbst gebaut, Kennzahlen).
  - Absatz 2: der zweitstärkste Beleg (meist eigene Produkte: bauen und vermarkten, Claude API, Kostenkontrolle).
  - Absatz 3: Business Cases, KPIs, Stakeholder (Bosch, Emmora, Marketing) — oder ein offener Punkt ehrlich adressiert.
  - Absatz 4 optional, OHNE fetten Einstieg: Bezug auf Arbeitsweise oder Plan der Firma, ein bis zwei Sätze.
- closing: ein kurzer Schlusssatz, z. B. "Ich freue mich auf ein persönliches Gespräch."
- salutation: "Sehr geehrte Damen und Herren," bzw. "Dear Hiring Team," — nur einen Namen verwenden, wenn er in der Ausschreibung steht.
- subject: die Stellenbezeichnung aus der Ausschreibung, höchstens 8 Wörter, z. B. "AI Program Manager (m/w/d)".
- recipient: ein bis drei Zeilen, Firmenname und Ort. Nur was in der Ausschreibung steht.
- Sprache: die vorgegebene Sprache der Unterlagen verwenden. Ist die Ausschreibung komplett englisch und die Vorgabe deutsch, trotzdem deutsch schreiben und in hinweise empfehlen, auf Englisch umzustellen.

LEBENSLAUF-ANPASSUNG (cvOverrides):
- role: Rollenbezeichnung oben im CV, auf die Stelle zugeschnitten. Höchstens 6 Wörter.
- tagline: der Profiltext, auf die Stelle zugeschnitten. Höchstens 60 Wörter. Auf denselben Fakten wie das Original.
- productOrder: die Produktnamen in der Reihenfolge, die für diese Stelle am meisten überzeugt.
- bulletRewrites: HÖCHSTENS DREI Einträge umformulieren, mit section und name (bei experience der Titel, bei products der Name). Nur Betonung verschieben, keine neuen Fakten.

hinweise: HÖCHSTENS DREI Sätze auf Deutsch an Iver — was du warum betont hast, und welche Lücke er im Gespräch erklären können muss.

LÄNGEN SIND VERBINDLICH. Beginne die Antwort direkt mit der geschweiften Klammer, ohne Vorrede.

Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown-Fences:
{"lang":"de"|"en","role":string,"recipient":string[],"subject":string,"salutation":string,"headline":string,"paragraphs":string[],"closing":string,"signOff":string,"cvOverrides":{"role":string,"tagline":string,"productOrder":string[],"bulletRewrites":[{"section":"products"|"experience","name":string,"bullets":string[]}]},"hinweise":string[]}`;

export async function draftApplication(input: {
  lang: Lang;
  title: string;
  employer: string;
  place: string;
  description: string;
}): Promise<ApplicationDraft> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt.");

  const { cv } = await loadCv(input.lang);

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
        model: process.env.DRAFT_MODEL || DEFAULT_MODEL,
        max_tokens: 8000,
        system: `${RULES}\n\nIVERS LEBENSLAUF (${input.lang}, Stand ivergentz.de):\n${profileFor(cv)}`,
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
    const bloecke = (data.content ?? []).map((block) => block.type).join(", ") || "keine";
    throw new Error(
      `Kein JSON. stop_reason: ${data.stop_reason ?? "?"}, Blocktypen: ${bloecke}, ` +
        `Textlänge: ${raw.length}. Anfang: ${raw.slice(0, 300) || "(leer)"}`
    );
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
  const de = input.lang === "de";

  return {
    lang: input.lang,
    role: parsed.role ?? cv.role,
    recipient: list(parsed.recipient),
    subject: parsed.subject ?? "",
    salutation: parsed.salutation ?? (de ? "Sehr geehrte Damen und Herren," : "Dear Hiring Team,"),
    headline: parsed.headline ?? "",
    paragraphs: list(parsed.paragraphs),
    closing: parsed.closing ?? (de ? "Ich freue mich auf ein persönliches Gespräch." : "I look forward to hearing from you."),
    signOff: parsed.signOff ?? (de ? "Mit freundlichen Grüßen" : "Kind regards"),
    facts: { salary: "", notice: de ? "3 Monate" : "3 months" },
    cvOverrides: (parsed.cvOverrides ?? {}) as CvOverrides,
    hinweise: list(parsed.hinweise),
  };
}

/** Wendet die Anpassungen auf den Lebenslauf an. Reine Umsortierung und Textersatz. */
export function applyOverrides(cv: Cv, overrides: CvOverrides): Cv {
  const base = cloneCv(cv);

  if (overrides.role) base.role = overrides.role;
  if (overrides.tagline) base.tagline = overrides.tagline;

  if (overrides.productOrder?.length) {
    const order = overrides.productOrder;
    base.products.sort((a, b) => {
      const ai = order.indexOf(a.name);
      const bi = order.indexOf(b.name);
      return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
    });
  }

  for (const rewrite of overrides.bulletRewrites ?? []) {
    if (!rewrite?.bullets?.length) continue;
    if (rewrite.section === "products") {
      const entry = base.products.find((item) => item.name === rewrite.name);
      if (entry) entry.bullets = rewrite.bullets;
    } else {
      const entry = base.experience.find(
        (item) => item.title === rewrite.name || item.company === rewrite.name
      );
      if (entry) entry.bullets = rewrite.bullets;
    }
  }

  return base;
}
