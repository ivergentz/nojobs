/**
 * Client für den NAV-Stellenfeed (pam-stilling-feed).
 * Doku: https://navikt.github.io/pam-stilling-feed/
 *
 * Wichtig zur Semantik: Der Feed ist KEINE Liste offener Stellen, sondern ein
 * fortlaufender Änderungsstrom seit ca. 2019. Jede Änderung an einer Anzeige
 * erzeugt einen neuen Eintrag. Der Startpunkt wird über den Header
 * `If-Modified-Since` gesetzt, danach hangelt man sich über `next_url` weiter.
 * Ende des Feeds: next_url === null.
 */

export const NAV_BASE = "https://pam-stilling-feed.nav.no";

export type NavFeedItem = {
  id: string;
  url: string;
  title: string | null;
  content_text: string | null;
  date_modified: string;
  _feed_entry: {
    uuid: string;
    status: string; // ACTIVE | INACTIVE
    title: string | null;
    businessName: string | null;
    municipal: string | null;
    sistEndret: string;
  };
};

export type NavFeedPage = {
  next_url: string | null;
  next_id: string | null;
  items: NavFeedItem[];
};

export type NavAdJson = {
  uuid?: string;
  published?: string | null;
  expires?: string | null;
  updated?: string | null;
  title?: string | null;
  jobtitle?: string | null;
  description?: string | null;
  source?: string | null;
  sourceurl?: string | null;
  link?: string | null;
  applicationUrl?: string | null;
  applicationDue?: string | null;
  engagementtype?: string | null;
  extent?: string | null;
  sector?: string | null;
  starttime?: string | null;
  positioncount?: string | null;
  workLocations?: Array<{
    country?: string | null;
    address?: string | null;
    city?: string | null;
    postalCode?: string | null;
    county?: string | null;
    municipal?: string | null;
  }> | null;
  occupationCategories?: Array<{ level1?: string | null; level2?: string | null }> | null;
  categoryList?: Array<{
    categoryType?: string | null;
    code?: string | null;
    name?: string | null;
    score?: number | null;
  }> | null;
  employer?: {
    name?: string | null;
    orgnr?: string | null;
    description?: string | null;
    homepage?: string | null;
  } | null;
  // contactList wird bewusst NICHT typisiert und nie gespeichert (Nutzungsbedingungen).
  [key: string]: unknown;
};

let cachedToken: { value: string; fetchedAt: number } | null = null;

/**
 * Holt den Bearer-Token. Bevorzugt NAV_FEED_TOKEN aus der Umgebung.
 * Fällt sonst auf den öffentlichen Test-Token zurück — der rotiert, deshalb
 * cachen wir ihn nur kurz im Speicher.
 */
export async function getNavToken(): Promise<string> {
  const fromEnv = process.env.NAV_FEED_TOKEN?.trim();
  if (fromEnv) return fromEnv;

  if (cachedToken && Date.now() - cachedToken.fetchedAt < 10 * 60 * 1000) {
    return cachedToken.value;
  }

  const res = await fetch(`${NAV_BASE}/api/publicToken`, { cache: "no-store" });
  if (!res.ok) {
    throw new Error(`publicToken fehlgeschlagen: HTTP ${res.status}`);
  }

  const body = (await res.text()).trim();
  const token = extractJwt(body);

  if (!token) {
    throw new Error(
      `publicToken lieferte keinen erkennbaren Token. Antwort begann mit: ${body.slice(0, 120)}`
    );
  }

  cachedToken = { value: token, fetchedAt: Date.now() };
  return token;
}

/**
 * Der publicToken-Endpunkt antwortet nicht mit dem reinen Token, sondern mit
 * einem Fließtext der Form:
 *
 *   Current public token for Nav Job Vacancy Feed:
 *   eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.…
 *
 * Ein HTTP-Header verträgt weder Zeilenumbrüche noch Leerzeichen, deshalb
 * fischen wir das JWT gezielt heraus, statt die Antwort zu trimmen.
 * JSON wird zusätzlich unterstützt, falls das Format sich wieder ändert.
 */
function extractJwt(body: string): string | null {
  if (body.startsWith("{")) {
    try {
      const parsed = JSON.parse(body) as Record<string, unknown>;
      const candidate = parsed.token ?? parsed.publicToken ?? parsed.access_token;
      if (typeof candidate === "string" && candidate.trim()) return candidate.trim();
    } catch {
      /* fällt unten auf die Mustersuche zurück */
    }
  }

  const match = body.match(/eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_.-]+/);
  if (match) return match[0];

  // Letzter Ausweg: eine einzelne Zeile ohne Leerzeichen.
  const bare = body.replace(/^"|"$/g, "").trim();
  return /^\S+$/.test(bare) ? bare : null;
}

function absolute(pathOrUrl: string): string {
  if (pathOrUrl.startsWith("http")) return pathOrUrl;
  return `${NAV_BASE}${pathOrUrl.startsWith("/") ? "" : "/"}${pathOrUrl}`;
}

export type FeedFetchResult =
  | { kind: "page"; page: NavFeedPage; etag: string | null; lastModified: string | null }
  | { kind: "not-modified" }
  | { kind: "error"; status: number; body: string };

export async function fetchFeedPage(opts: {
  token: string;
  path: string;
  ifModifiedSince?: string | null;
  etag?: string | null;
}): Promise<FeedFetchResult> {
  const headers: Record<string, string> = {
    Accept: "application/json",
    Authorization: `Bearer ${opts.token}`,
  };
  if (opts.ifModifiedSince) headers["If-Modified-Since"] = opts.ifModifiedSince;
  if (opts.etag) headers["If-None-Match"] = opts.etag;

  const res = await fetch(absolute(opts.path), { headers, cache: "no-store" });

  if (res.status === 304) return { kind: "not-modified" };
  if (!res.ok) {
    return { kind: "error", status: res.status, body: (await res.text()).slice(0, 500) };
  }

  const page = (await res.json()) as NavFeedPage;
  return {
    kind: "page",
    page,
    etag: res.headers.get("etag"),
    lastModified: res.headers.get("last-modified"),
  };
}

/**
 * Holt die Detaildaten einer Anzeige.
 * Die Doku beschreibt das Nutzdatenfeld als `json`, der Beispielcode als
 * `ad_content`. Wir akzeptieren beides und fallen notfalls auf den Rumpf zurück.
 */
export async function fetchAdDetail(opts: {
  token: string;
  url: string;
}): Promise<{ ad: NavAdJson; status: string | null } | null> {
  const res = await fetch(absolute(opts.url), {
    headers: { Accept: "application/json", Authorization: `Bearer ${opts.token}` },
    cache: "no-store",
  });
  if (!res.ok) return null;

  const body = (await res.json()) as Record<string, unknown>;
  const ad = (body.json ?? body.ad_content ?? body) as NavAdJson;
  const status = typeof body.status === "string" ? body.status : null;
  return { ad, status };
}

/** RFC-1123, das Format das der Feed für If-Modified-Since erwartet. */
export function toRfc1123(date: Date): string {
  return date.toUTCString();
}
