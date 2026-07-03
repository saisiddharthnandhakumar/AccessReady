// Industry and regulation data — safe for both client and server.
// (Pure data + functions; no server-only APIs used.)

// ── Industry options ──

export const INDUSTRIES = [
  "Healthcare / HealthTech",
  "Banking & Financial Services",
  "Government / Public Sector",
  "Education / EdTech",
  "E-commerce / Retail",
  "Technology / SaaS",
  "Media & Entertainment",
  "Insurance",
  "Telecommunications",
  "Other",
] as const;

export type Industry = (typeof INDUSTRIES)[number];

// ── Regulation definitions ──

export type Regulation = {
  code: string;
  name: string;
  jurisdiction: string;
  requiredLevel: "AA";
  wcagVersion: "2.0" | "2.1" | "2.2";
  sourceUrl: string;
};

const REGULATIONS: Record<string, Regulation> = {
  "section-508": {
    code: "section-508",
    name: "Section 508",
    jurisdiction: "United States (Federal)",
    requiredLevel: "AA",
    wcagVersion: "2.0",
    sourceUrl: "https://www.section508.gov",
  },
  ada: {
    code: "ada",
    name: "ADA Title III",
    jurisdiction: "United States",
    requiredLevel: "AA",
    wcagVersion: "2.1",
    sourceUrl: "https://www.ada.gov",
  },
  "en-301-549": {
    code: "en-301-549",
    name: "EN 301 549",
    jurisdiction: "European Union",
    requiredLevel: "AA",
    wcagVersion: "2.1",
    sourceUrl: "https://www.etsi.org/standards/en-301-549",
  },
  aoda: {
    code: "aoda",
    name: "AODA",
    jurisdiction: "Ontario, Canada",
    requiredLevel: "AA",
    wcagVersion: "2.0",
    sourceUrl: "https://www.ontario.ca/page/accessibility-laws",
  },
  psbar: {
    code: "psbar",
    name: "Equality Act 2010 / PSBAR",
    jurisdiction: "United Kingdom",
    requiredLevel: "AA",
    wcagVersion: "2.1",
    sourceUrl:
      "https://www.gov.uk/guidance/accessibility-requirements-for-public-sector-websites-and-apps",
  },
  eaa: {
    code: "eaa",
    name: "European Accessibility Act",
    jurisdiction: "European Union (Member States)",
    requiredLevel: "AA",
    wcagVersion: "2.1",
    sourceUrl: "https://ec.europa.eu/social/main.jsp?catId=1202",
  },
};

// ── Regulation applicability ──
//
// Based on official regulatory scope from:
// • Section 508: US federal + state procurement (all industries)
// • ADA Title III: US public accommodations (all industries)
// • EN 301 549: EU public sector websites & mobile apps
// • European Accessibility Act: products/services sold in EU (all industries)
// • AODA: Ontario, Canada (all industries)
// • Equality Act 2010 / PSBAR: UK public sector

type MarketMatcher = (market: string) => boolean;

const US_MARKETS: MarketMatcher = (market) =>
  market === "United States" || market === "Global";

const EU_MARKETS: MarketMatcher = (market) =>
  market === "European Union" || market === "Global";

const UK_MARKETS: MarketMatcher = (market) =>
  market === "United Kingdom" || market === "Global";

const CA_MARKETS: MarketMatcher = (market) =>
  market === "Canada" || market === "Global";

const ALL_MARKETS: MarketMatcher = () => true;

type RegulationRule = {
  regulationCode: string;
  marketMatcher: MarketMatcher;
  industryMatcher: (industry: string) => boolean;
};

const REGULATION_RULES: RegulationRule[] = [
  // Section 508 applies to US federal procurement — all industries
  {
    regulationCode: "section-508",
    marketMatcher: US_MARKETS,
    industryMatcher: () => true,
  },
  // ADA Title III applies to all US public accommodations — all industries
  {
    regulationCode: "ada",
    marketMatcher: US_MARKETS,
    industryMatcher: () => true,
  },
  // EN 301 549 applies to EU public sector
  {
    regulationCode: "en-301-549",
    marketMatcher: EU_MARKETS,
    industryMatcher: () => true,
  },
  // EAA applies to products/services sold in EU — all industries
  {
    regulationCode: "eaa",
    marketMatcher: EU_MARKETS,
    industryMatcher: () => true,
  },
  // AODA applies to Ontario, Canada
  {
    regulationCode: "aoda",
    marketMatcher: CA_MARKETS,
    industryMatcher: () => true,
  },
  // PSBAR applies to UK public sector
  {
    regulationCode: "psbar",
    marketMatcher: UK_MARKETS,
    industryMatcher: () => true,
  },
];

/**
 * Returns which accessibility regulations apply to a scan based on
 * target market and industry.
 */
export function getApplicableRegulations(
  targetMarket: string,
  _industry: string,
): Regulation[] {
  const codes = new Set<string>();

  for (const rule of REGULATION_RULES) {
    if (
      rule.marketMatcher(targetMarket) &&
      rule.industryMatcher(_industry)
    ) {
      codes.add(rule.regulationCode);
    }
  }

  return [...codes]
    .map((code) => REGULATIONS[code])
    .filter((r): r is Regulation => r != null);
}

/**
 * Returns a human-readable summary of the compliance obligations
 * based on applicable regulations.
 */
export function complianceSummary(regulations: Regulation[]): string {
  if (regulations.length === 0) {
    return "No specific accessibility regulation identified for this market and industry. WCAG 2.2 Level AA is recommended as a baseline.";
  }

  const names = regulations.map((r) => r.name);
  const levels = [...new Set(regulations.map((r) => `Level ${r.requiredLevel}`))];

  return `This scan is covered by ${names.join(", ")}. All require WCAG ${levels.join(" and ")} conformance as the minimum standard.`;
}

/**
 * AAA (the highest WCAG tier) is never legally required.
 * However, it is strongly recommended for high-risk contexts:
 *
 * • Healthcare: medication instructions, consent forms, emergency info, patient portals
 * • Government: benefits portals, identity verification, emergency alerts
 * • Fintech: transaction confirmations, error prevention on financial submissions (WCAG 3.3.4)
 */
const AAA_RECOMMENDED_INDUSTRIES = new Set([
  "Healthcare / HealthTech",
  "Banking & Financial Services",
  "Government / Public Sector",
  "Insurance",
]);

export function isAaaRecommended(
  _market: string,
  industry: string,
): boolean {
  return AAA_RECOMMENDED_INDUSTRIES.has(industry);
}
