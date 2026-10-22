/**
 * Übersetzung und Gehaltsextraktion in einem Aufruf.
 *
 * Der NAV-Feed hat kein Gehaltsfeld — was da ist, steht im Fließtext. Da das
 * Modell den Text zum Übersetzen ohnehin liest, holt es das Gehalt gleich mit.
 *
 * Bewusst KEINE Bewertung der Stelle. Beim Kalibrieren soll das Urteil von
 * Iver kommen, nicht vom Modell.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export type Translation = {
  title_de: string;
  description_de: string;
  salary_min_nok: number | null;
  salary_max_nok: number | null;
  salary_note: string | null;
};

const SYSTEM_PROMPT = `Du übersetzt norwegische Stellenanzeigen ins Deutsche und liest Gehaltsangaben aus.

Regeln für die Übersetzung:
- Natürliches Deutsch, keine Wort-für-Wort-Übersetzung.
- Struktur und Absätze beibehalten. Aufzählungen bleiben Aufzählungen.
- Firmennamen, Produktnamen, Orts- und Behördennamen bleiben im Original.
- Gängige englische Fachbegriffe (Product Owner, Frontend, Stack) nicht eindeutschen.
- Marketingfloskeln nicht aufhübschen — wenn die Anzeige vage ist, bleibt sie vage.
- Keine Zusammenfassung, keine Kürzung, keine eigenen Kommentare.

Regeln für das Gehalt:
- Suche nach Jahresgehalt in NOK, Spannen ("kr 750 000 - 900 000"), oder Lønnstrinn.
- Bei Lønnstrinn: Wenn die Anzeige den Kronenbetrag nennt, nimm ihn. Sonst salary_min_nok und salary_max_nok auf null und schreib den Lønnstrinn in salary_note.
- Monatsgehälter auf das Jahr hochrechnen (× 12) und das in salary_note vermerken.
- Steht nichts da, sind alle drei Gehaltsfelder null. Nichts schätzen, nichts ableiten.
- salary_note ist kurz und deutsch, z. B. "Lønnstrinn 65-72" oder "nach Vereinbarung".

Antworte ausschließlich mit einem JSON-Objekt, ohne Markdown-Fences und ohne Vorrede:
{"title_de": string, "description_de": string, "salary_min_nok": number|null, "salary_max_nok": number|null, "salary_note": string|null}`;

export async function translateAd(input: {
  title: string;
  description: string;
}): Promise<Translation> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    throw new Error("ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen.");
  }

  const res = await fetch(ANTHROPIC_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: "claude-haiku-4-5-20251001",
      max_tokens: 4000,
      system: SYSTEM_PROMPT,
      messages: [
        {
          role: "user",
          content: `Titel: ${input.title}\n\nAnzeige:\n${input.description.slice(0, 20000)}`,
        },
      ],
    }),
    cache: "no-store",
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Anthropic API: HTTP ${res.status} — ${body.slice(0, 300)}`);
  }

  const data = (await res.json()) as { content?: Array<{ type: string; text?: string }> };
  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("")
    .trim();

  const cleaned = text
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/, "")
    .trim();

  let parsed: Partial<Translation>;
  try {
    parsed = JSON.parse(cleaned) as Partial<Translation>;
  } catch {
    throw new Error(`Antwort war kein JSON: ${cleaned.slice(0, 200)}`);
  }

  const toNumber = (value: unknown): number | null =>
    typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null;

  return {
    title_de: typeof parsed.title_de === "string" ? parsed.title_de : input.title,
    description_de:
      typeof parsed.description_de === "string" ? parsed.description_de : input.description,
    salary_min_nok: toNumber(parsed.salary_min_nok),
    salary_max_nok: toNumber(parsed.salary_max_nok),
    salary_note: typeof parsed.salary_note === "string" ? parsed.salary_note : null,
  };
}

/**
 * NOK → EUR über die EZB-Referenzkurse (Frankfurter, kein API-Key).
 * Fällt der Dienst aus, liefern wir keinen erfundenen Kurs, sondern null —
 * eine fehlende Umrechnung ist besser als eine falsche.
 */
export async function fetchNokToEur(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch("https://api.frankfurter.app/latest?base=NOK&symbols=EUR", {
      next: { revalidate: 3600 },
    });
    if (!res.ok) return null;

    const data = (await res.json()) as { date?: string; rates?: { EUR?: number } };
    const rate = data.rates?.EUR;
    if (typeof rate !== "number" || !Number.isFinite(rate)) return null;

    return { rate, date: data.date ?? "" };
  } catch {
    return null;
  }
}
