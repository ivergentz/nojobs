import { clean, decodeEntities, fetchWithTimeout, htmlToText, toIso } from "./text";

/**
 * Öffentliche Stellen-Feeds von Bewerbersystemen (ATS).
 *
 * Diese Endpunkte sind dafür gedacht, dass Firmen ihre offenen Stellen auf
 * eigenen Seiten anzeigen — sie sind öffentlich, ohne Schlüssel, und liefern
 * die vollständige Stellenbeschreibung. Ein Abruf pro Firma und Tag.
 *
 * Unterstützt: personio, greenhouse, lever, smartrecruiters, recruitee, ashby
 */

export type Ats = "personio" | "greenhouse" | "lever" | "smartrecruiters" | "recruitee" | "ashby";

export type Firma = {
  name: string;
  ats: Ats;
  /** Kennung im Bewerbersystem, z. B. "catworkx" aus catworkx.jobs.personio.de */
  slug: string;
  /** Nur Personio: feste Domain. Ohne Angabe wird jobs.personio.com, dann jobs.personio.de probiert. */
  domain?: string;
  /** Greenhouse und Lever: "eu" für Firmen auf der EU-Instanz
   *  (erkennbar an job-boards.eu.greenhouse.io bzw. jobs.eu.lever.co) */
  region?: "eu";
  aktiv?: boolean;
};

export type AtsJob = {
  id: string;
  title: string;
  location: string;
  remote: boolean | null;
  description: string;
  url: string | null;
  published: string | null;
};

const JSON_HEADERS = { Accept: "application/json" };

async function getJson(url: string): Promise<any> {
  const res = await fetchWithTimeout(url, { headers: JSON_HEADERS }, 8_000);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// ---------------------------------------------------------------- Personio

/** Wert eines XML-Elements, inklusive CDATA. */
function xmlValue(block: string, tag: string): string | null {
  const match = block.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`));
  if (!match) return null;
  const raw = match[1].replace(/^\s*<!\[CDATA\[([\s\S]*?)\]\]>\s*$/, "$1");
  return decodeEntities(raw).trim() || null;
}

async function personio(firma: Firma): Promise<AtsJob[]> {
  // Personio betreibt beide Domains; manche Firmen antworten nur auf einer.
  const domains = firma.domain ? [firma.domain] : ["jobs.personio.com", "jobs.personio.de"];
  let res: Response | null = null;
  let base = "";
  for (const domain of domains) {
    base = `https://${firma.slug}.${domain}`;
    res = await fetchWithTimeout(`${base}/xml?language=de`, {}, 8_000);
    if (res.ok) break;
  }
  if (!res || !res.ok) throw new Error(`HTTP ${res?.status ?? "?"} (auf ${domains.join(" und ")})`);
  const xml = await res.text();
  const positions = xml.match(/<position>[\s\S]*?<\/position>/g) ?? [];

  return positions.map((block) => {
    const id = xmlValue(block, "id") ?? "";
    const offices = [xmlValue(block, "office")];
    const additional = block.match(/<additionalOffices>([\s\S]*?)<\/additionalOffices>/);
    if (additional) {
      for (const office of additional[1].match(/<office>[\s\S]*?<\/office>/g) ?? []) {
        offices.push(xmlValue(office, "office"));
      }
    }
    const sections = (block.match(/<jobDescription>[\s\S]*?<\/jobDescription>/g) ?? []).map((section) => {
      const name = xmlValue(section, "name");
      const value = htmlToText(xmlValue(section, "value"));
      return name ? `${name}\n${value}` : value;
    });
    const location = offices.filter(Boolean).join(", ");
    return {
      id,
      title: xmlValue(block, "name") ?? "",
      location,
      remote: /remote|homeoffice|home office/i.test(location) ? true : null,
      description: [
        sections.join("\n\n"),
        [xmlValue(block, "employmentType"), xmlValue(block, "schedule"), xmlValue(block, "seniority")]
          .filter(Boolean)
          .join(" · "),
      ]
        .filter(Boolean)
        .join("\n\n"),
      url: id ? `${base}/job/${id}` : base,
      published: toIso(xmlValue(block, "createdAt")),
    };
  });
}

// -------------------------------------------------------------- Greenhouse

async function greenhouse(firma: Firma): Promise<AtsJob[]> {
  const host = firma.region === "eu" ? "boards-api.eu.greenhouse.io" : "boards-api.greenhouse.io";
  const body = await getJson(
    `https://${host}/v1/boards/${encodeURIComponent(firma.slug)}/jobs?content=true`
  );
  return (body.jobs ?? []).map((job: any) => {
    const location = clean(job.location?.name) ?? "";
    return {
      id: String(job.id),
      title: clean(job.title) ?? "",
      location,
      remote: /remote/i.test(location) ? true : null,
      description: htmlToText(job.content),
      url: clean(job.absolute_url),
      published: toIso(job.first_published ?? job.updated_at),
    };
  });
}

// ------------------------------------------------------------------- Lever

async function lever(firma: Firma): Promise<AtsJob[]> {
  const host = firma.region === "eu" ? "api.eu.lever.co" : "api.lever.co";
  const body = await getJson(`https://${host}/v0/postings/${encodeURIComponent(firma.slug)}?mode=json`);
  return (Array.isArray(body) ? body : []).map((job: any) => {
    const location = [job.categories?.location, ...(job.categories?.allLocations ?? [])]
      .filter(Boolean)
      .filter((value: string, index: number, all: string[]) => all.indexOf(value) === index)
      .join(", ");
    const lists = (job.lists ?? [])
      .map((list: any) => `${list.text ?? ""}\n${htmlToText(list.content)}`)
      .join("\n\n");
    return {
      id: String(job.id),
      title: clean(job.text) ?? "",
      location,
      remote: job.workplaceType === "remote" ? true : /remote/i.test(location) ? true : null,
      description: [clean(job.descriptionPlain) ?? htmlToText(job.description), lists, clean(job.additionalPlain)]
        .filter(Boolean)
        .join("\n\n"),
      url: clean(job.hostedUrl) ?? clean(job.applyUrl),
      published: toIso(job.createdAt),
    };
  });
}

// --------------------------------------------------------- SmartRecruiters

async function smartrecruiters(firma: Firma, nurNeu?: (id: string) => boolean): Promise<AtsJob[]> {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(firma.slug)}/postings`;
  const list = await getJson(`${base}?limit=100`);
  const postings: any[] = list.content ?? [];

  // Die Liste hat keine Beschreibung — Details nur für unbekannte Stellen holen.
  return Promise.all(
    postings.map(async (posting) => {
      const id = String(posting.id);
      const location = [posting.location?.city, posting.location?.country?.toUpperCase?.()]
        .filter(Boolean)
        .join(", ");
      let description = "";
      let url: string | null = `https://jobs.smartrecruiters.com/${firma.slug}/${id}`;
      if (!nurNeu || nurNeu(id)) {
        try {
          const detail = await getJson(`${base}/${id}`);
          const sections = detail.jobAd?.sections ?? {};
          description = ["jobDescription", "qualifications", "additionalInformation", "companyDescription"]
            .map((key) => htmlToText(sections[key]?.text))
            .filter(Boolean)
            .join("\n\n");
          url = clean(detail.postingUrl) ?? clean(detail.applyUrl) ?? url;
        } catch {
          /* ohne Beschreibung weiter */
        }
      }
      return {
        id,
        title: clean(posting.name) ?? "",
        location,
        remote: posting.location?.remote === true ? true : null,
        description,
        url,
        published: toIso(posting.releasedDate),
      };
    })
  );
}

// --------------------------------------------------------------- Recruitee

async function recruitee(firma: Firma): Promise<AtsJob[]> {
  const body = await getJson(`https://${encodeURIComponent(firma.slug)}.recruitee.com/api/offers/`);
  return (body.offers ?? []).map((offer: any) => {
    const location = [offer.location, offer.city].filter(Boolean)[0] ?? "";
    return {
      id: String(offer.id),
      title: clean(offer.title) ?? "",
      location: String(location),
      remote: offer.remote === true ? true : null,
      description: [htmlToText(offer.description), htmlToText(offer.requirements)].filter(Boolean).join("\n\n"),
      url: clean(offer.careers_url) ?? clean(offer.careers_apply_url),
      published: toIso(offer.published_at ?? offer.created_at),
    };
  });
}

// ------------------------------------------------------------------- Ashby

async function ashby(firma: Firma): Promise<AtsJob[]> {
  const body = await getJson(
    `https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(firma.slug)}?includeCompensation=true`
  );
  return (body.jobs ?? [])
    .filter((job: any) => job.isListed !== false)
    .map((job: any) => {
      const location = [job.location, ...(job.secondaryLocations ?? []).map((l: any) => l.location)]
        .filter(Boolean)
        .join(", ");
      return {
        id: String(job.id),
        title: clean(job.title) ?? "",
        location,
        remote: job.isRemote === true || job.workplaceType === "Remote" ? true : null,
        description: clean(job.descriptionPlain) ?? htmlToText(job.descriptionHtml),
        url: clean(job.jobUrl) ?? clean(job.applyUrl),
        published: toIso(job.publishedAt),
      };
    });
}

// --------------------------------------------------------------------------

export async function fetchFirmenJobs(
  firma: Firma,
  nurNeu?: (id: string) => boolean
): Promise<AtsJob[]> {
  switch (firma.ats) {
    case "personio":
      return personio(firma);
    case "greenhouse":
      return greenhouse(firma);
    case "lever":
      return lever(firma);
    case "smartrecruiters":
      return smartrecruiters(firma, nurNeu);
    case "recruitee":
      return recruitee(firma);
    case "ashby":
      return ashby(firma);
    default:
      throw new Error(`Unbekanntes Bewerbersystem: ${String((firma as Firma).ats)}`);
  }
}

export function atsUuid(firma: Firma, id: string): string {
  return `ats-${firma.ats}-${firma.slug}-${id}`;
}
