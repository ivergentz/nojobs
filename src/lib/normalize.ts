import type { NavAdJson, NavFeedItem } from "./nav";

export type JobRow = {
  uuid: string;
  source: string;
  status: string;
  title: string | null;
  employer_name: string | null;
  employer_homepage: string | null;
  municipal: string | null;
  county: string | null;
  country: string | null;
  published: string | null;
  expires: string | null;
  updated: string | null;
  application_url: string | null;
  application_due: string | null;
  source_url: string | null;
  description: string | null;
  extent: string | null;
  engagement_type: string | null;
  sector: string | null;
  occupation_level1: string | null;
  occupation_level2: string | null;
  categories: unknown;
  raw: unknown;
  imported_at: string;
};

const clean = (value: unknown): string | null => {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

const asTimestamp = (value: unknown): string | null => {
  const text = clean(value);
  if (!text) return null;
  const parsed = new Date(text);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
};

/**
 * Entfernt personenbezogene Kontaktdaten, bevor irgendetwas gespeichert wird.
 * Die NAV-Nutzungsbedingungen verlangen, dass Kontaktdaten inaktiver Anzeigen
 * nicht weiter angezeigt werden. Der einfachste Weg, das nie zu verletzen:
 * gar nicht erst speichern.
 */
function stripPersonalData(ad: NavAdJson): Record<string, unknown> {
  const copy: Record<string, unknown> = { ...ad };
  delete copy.contactList;
  delete copy.contacts;
  return copy;
}

export function normalizeAd(args: {
  item: NavFeedItem;
  ad: NavAdJson;
  detailStatus: string | null;
}): JobRow {
  const { item, ad, detailStatus } = args;
  const location = ad.workLocations?.[0] ?? null;

  return {
    uuid: ad.uuid ?? item._feed_entry.uuid,
    source: "nav",
    status: (detailStatus ?? item._feed_entry.status ?? "ACTIVE").toUpperCase(),
    title: clean(ad.title) ?? clean(ad.jobtitle) ?? clean(item.title),
    employer_name: clean(ad.employer?.name) ?? clean(item._feed_entry.businessName),
    employer_homepage: clean(ad.employer?.homepage),
    municipal: clean(location?.municipal) ?? clean(item._feed_entry.municipal),
    county: clean(location?.county),
    country: clean(location?.country),
    published: asTimestamp(ad.published),
    expires: asTimestamp(ad.expires),
    updated: asTimestamp(ad.updated) ?? asTimestamp(item.date_modified),
    // Die Nutzungsbedingungen verlangen, dass der Bewerben-Link direkt auf das
    // Originalsystem zeigt. Reihenfolge deshalb: applicationUrl vor link.
    application_url: clean(ad.applicationUrl) ?? clean(ad.link) ?? clean(ad.sourceurl),
    application_due: clean(ad.applicationDue),
    source_url: clean(ad.sourceurl) ?? clean(ad.link),
    description: clean(ad.description),
    extent: clean(ad.extent),
    engagement_type: clean(ad.engagementtype),
    sector: clean(ad.sector),
    occupation_level1: clean(ad.occupationCategories?.[0]?.level1),
    occupation_level2: clean(ad.occupationCategories?.[0]?.level2),
    categories: ad.categoryList ?? null,
    raw: stripPersonalData(ad),
    imported_at: new Date().toISOString(),
  };
}
