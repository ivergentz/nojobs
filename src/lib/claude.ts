/**
 * Strukturierte Antworten von Claude über Tool Use.
 *
 * Vorher sollte das Modell JSON als Freitext schreiben, das wir dann mit
 * JSON.parse gelesen haben. Das bricht, sobald im Text ein unmaskiertes
 * Anführungszeichen steht — etwa "KI vorführt" im Anschreiben. Fehlerbild:
 * "Expected ',' or '}' after property value in JSON at position …".
 *
 * Mit einem erzwungenen Tool-Aufruf liefert die API die Felder als fertig
 * geparstes Objekt. Kein Parsen von Freitext mehr.
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

export async function callClaudeTool<T>(options: {
  model: string;
  system: string;
  user: string;
  toolName: string;
  toolDescription: string;
  schema: Record<string, unknown>;
  maxTokens: number;
  timeoutMs: number;
}): Promise<T> {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("ANTHROPIC_API_KEY fehlt in den Umgebungsvariablen.");

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), options.timeoutMs);

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
        model: options.model,
        max_tokens: options.maxTokens,
        system: options.system,
        tools: [
          {
            name: options.toolName,
            description: options.toolDescription,
            input_schema: options.schema,
          },
        ],
        tool_choice: { type: "tool", name: options.toolName },
        messages: [{ role: "user", content: options.user }],
      }),
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof Error && error.name === "AbortError") {
      throw new Error(`Zeitüberschreitung nach ${Math.round(options.timeoutMs / 1000)}s`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    throw new Error(`Anthropic API: HTTP ${res.status} — ${(await res.text()).slice(0, 300)}`);
  }

  const data = (await res.json()) as {
    content?: Array<{ type: string; name?: string; input?: unknown }>;
    stop_reason?: string;
  };

  const block = (data.content ?? []).find(
    (entry) => entry.type === "tool_use" && entry.name === options.toolName
  );

  if (!block || typeof block.input !== "object" || block.input === null) {
    throw new Error(
      `Keine strukturierte Antwort (stop_reason: ${data.stop_reason ?? "?"}).` +
        (data.stop_reason === "max_tokens" ? " Antwort war zu lang." : "")
    );
  }

  return block.input as T;
}
