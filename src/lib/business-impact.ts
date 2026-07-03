// Business impact explanations — safe for both client and server.
// Explains commercial and legal risks of accessibility violations,
// contextualized by applicable regulations and industry.

import { type Regulation } from "@/lib/compliance";

export type BusinessImpact = {
  /** Short heading for the impact panel */
  heading: string;
  /** Primary business risk statement */
  body: string;
  /** Secondary risks (list of 1-3 items) */
  risks: string[];
  /** Severity of business exposure */
  exposureLevel: "high" | "moderate" | "low";
};

type BusinessImpactInput = {
  regulations: Regulation[];
  industry: string;
  violationCount: number;
};

/**
 * Returns a business-impact assessment contextualized by applicable
 * accessibility regulations and industry. Covers litigation risk,
 * procurement disqualification, brand damage, and market access.
 */
export function getBusinessImpact(input: BusinessImpactInput): BusinessImpact {
  const { regulations, industry, violationCount } = input;

  const hasRegulation = regulations.length > 0;
  const hasUS = regulations.some((r) => r.code === "ada" || r.code === "section-508");
  const hasEU = regulations.some((r) => r.code === "eaa" || r.code === "en-301-549");
  const isHighRisk = [
    "Healthcare / HealthTech",
    "Banking & Financial Services",
    "Government / Public Sector",
    "Insurance",
  ].includes(industry);

  // High-risk industry + active US regulations = highest exposure
  if (isHighRisk && hasUS) {
    return {
      heading: "Significant legal and commercial exposure",
      body: `Your product falls under ${regulations.map((r) => r.name).join(" and ")}, and your industry (${industry}) is among the most targeted for accessibility lawsuits. ADA Title III federal filings exceeded 4,000 in 2024 alone, with healthcare, financial services, and government contractors facing disproportionate risk.`,
      risks: [
        "ADA Title III lawsuits: Median settlement ranges from $20K–$50K for small businesses to $100K+ for enterprises, plus plaintiff attorney fees.",
        "Section 508 non-compliance can disqualify your product from federal and state government procurement (U.S. federal IT spending exceeds $100B annually).",
        `${industry} organizations face heightened scrutiny from advocacy groups and regulatory bodies. A single demand letter can trigger a costly remediation cycle.`,
      ],
      exposureLevel: "high",
    };
  }

  // High-risk industry + EU regulations
  if (isHighRisk && hasEU) {
    return {
      heading: "Regulatory enforcement and market access risk",
      body: `The European Accessibility Act (EAA) comes into full enforcement in June 2025, requiring products and services sold in the EU to meet WCAG 2.1 Level AA. Your industry (${industry}) faces elevated scrutiny under ${regulations.map((r) => r.name).join(" and ")}.`,
      risks: [
        "EAA non-compliance can result in products being barred from the EU single market (447 million consumers).",
        "EN 301 549 applies to public sector procurement across all EU member states — inaccessible products cannot be sold to European governments.",
        "Member states can impose fines, and competitors may use non-compliance as grounds for legal challenge.",
      ],
      exposureLevel: "high",
    };
  }

  // Any US regulation
  if (hasUS) {
    return {
      heading: "Litigation and procurement risk",
      body: `Your product is subject to ${regulations.map((r) => r.name).join(" and ")}. Accessibility lawsuits in the U.S. continue to rise year over year, with plaintiffs targeting digital products across all industries.`,
      risks: [
        "ADA Title III lawsuits: Over 4,000 federal cases were filed in 2024. Demand letters often precede formal litigation and can be resolved early with demonstrated compliance.",
        "Section 508: Non-compliant products are ineligible for U.S. federal procurement. VPAT submittal is required for most government RFPs.",
        "State-level accessibility laws (California Unruh Act, New York Human Rights Law) create additional exposure beyond federal requirements.",
      ],
      exposureLevel: "moderate",
    };
  }

  // Any EU regulation
  if (hasEU) {
    return {
      heading: "EU market access and regulatory compliance risk",
      body: `The European Accessibility Act (June 2025 enforcement) and EN 301 549 create binding accessibility requirements for products sold or procured in the EU.`,
      risks: [
        "EAA non-compliance can result in exclusion from the EU market. National enforcement bodies can impose penalties and require corrective action.",
        "EN 301 549 is referenced in EU public procurement directives — inaccessible products are effectively barred from public sector sales.",
        "EU consumers and advocacy groups have standing to file complaints, creating reputational risk across member states.",
      ],
      exposureLevel: "moderate",
    };
  }

  // Other regulations (Canada, UK)
  if (hasRegulation) {
    return {
      heading: "Regulatory compliance required for market access",
      body: `Your product falls under ${regulations.map((r) => r.name).join(" and ")}. While litigation volume is lower than the U.S., non-compliance can block public sector sales and create legal exposure.`,
      risks: [
        `${regulations.map((r) => r.name).join(" and ")} require WCAG conformance for covered products. Non-compliance can result in fines, orders to remediate, and exclusion from procurement.`,
        "Accessibility requirements are expanding globally — demonstrating compliance now reduces future remediation cost when new regulations take effect.",
      ],
      exposureLevel: "low",
    };
  }

  // No specific regulation detected — baseline risk
  return {
    heading: "Baseline business risk — proactive compliance recommended",
    body: "No specific accessibility regulation was identified for your market and industry combination. However, WCAG 2.2 Level AA is increasingly treated as a de facto standard in commercial contracts, platform requirements (Apple App Store, Google Play), and partner due diligence.",
    risks: [
      "Even without a specific regulation, inaccessible products face reputational risk, lost market share (~15–20% of the population has a disability), and exclusion from partner ecosystems.",
      "Proactive accessibility is a competitive differentiator — companies that invest early avoid costly retroactive remediation.",
      `With ${violationCount} contrast issues found, addressing these now is significantly cheaper than remediating after launch (cost ratio typically 1:30 per issue).`,
    ],
    exposureLevel: "low",
  };
}
