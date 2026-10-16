/**
 * Strukturierte Antworten von Claude über "Structured Outputs".
 *
 * Vorher sollte das Modell JSON als Freitext schreiben. Das bricht, sobald im
 * Text ein unmaskiertes Anführungszeichen steht ("Expected ',' or '}' after
 * property value …"). Ein erzwungener Tool-Aufruf scheidet aus — das aktuelle
 * Modell lehnt tool_choice "tool" ab (HTTP 400).
 *
 * Mit output_config.format = json_schema garantiert die API, dass die Antwort
 * gültiges JSON nach dem Schema ist. Kein Beta-Header nötig.
 * Doku: https://platform.claude.com/docs/en/build-with-claude/structured-outputs
 */

const ANTHROPIC_URL = "https://api.anthropic.com/v1/messages";

export const DEFAULT_MODEL = "claude-sonnet-5-5";

/** Setzt additionalProperties: false auf jedes Objekt im Schema (von der API verlangt). */
function strict(schema: unknown): unknown {
  if (Array.isArray(schema)) return schema.map(strict);
  if (!schema || typeof schema !== "object") return schema;
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema as Record<string, unknown>)) {
    out[key] = strict(value);
  }
  if (out.type === "object" && out.additionalProperties === undefined) {
    out.additionalProperties = false;
  }
  return out;
}

export async function callClaudeJson<T>(options: {
  model: string;
  system: string;
  user: string;
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
        output_config: { format: { type: "json_schema", schema: strict(options.schema) } },
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
    content?: Array<{ type: string; text?: string }>;
    stop_reason?: string;
  };

  if (data.stop_reason === "max_tokens") {
    throw new Error("Antwort am Token-Limit abgeschnitten.");
  }
  if (data.stop_reason === "refusal") {
    throw new Error("Modell hat die Antwort verweigert.");
  }

  const text = (data.content ?? [])
    .filter((block) => block.type === "text")
    .map((block) => block.text ?? "")
    .join("");

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error(
      `Antwort ist kein gültiges JSON (stop_reason: ${data.stop_reason ?? "?"}). Anfang: ${text.slice(0, 200)}`
    );
  }
}
