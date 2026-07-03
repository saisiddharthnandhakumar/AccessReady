import { INDUSTRIES as COMPLIANCE_INDUSTRIES } from "@/lib/compliance";

export const PRODUCT_TYPE_GROUPS: { label: string; values: string[] }[] = [
  {
    label: "Web & Mobile",
    values: ["Web Application", "Mobile Application"],
  },
  {
    label: "Commerce & Finance",
    values: ["E-commerce Checkout", "Banking & Finance"],
  },
  {
    label: "Platforms",
    values: [
      "Social Media Platform",
      "Content Management System",
      "Educational Platform",
    ],
  },
  {
    label: "Specialized",
    values: [
      "Government Portal",
      "Healthcare Application",
      "Reporting Dashboard",
      "Document Management",
    ],
  },
];

export const PRODUCT_TYPES = PRODUCT_TYPE_GROUPS.flatMap((group) => group.values);

export const TARGET_MARKETS = [
  "United States",
  "European Union",
  "United Kingdom",
  "India",
  "Canada",
  "Australia",
  "Global",
] as const;

export const INDUSTRIES = COMPLIANCE_INDUSTRIES;

export type ScanMetadataInput = {
  productType: string;
  productTypeOther?: string | null;
  targetMarket: string;
  targetMarketOther?: string | null;
  industry: string;
  industryOther?: string | null;
  notes?: string | null;
};
