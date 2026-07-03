import "server-only";
import { type Regulation } from "@/lib/compliance";
import { getUserImpact } from "@/lib/user-impact";
import { getBusinessImpact, type BusinessImpact } from "@/lib/business-impact";

export type VpatSection = {
  criterion: string;
  title: string;
  level: string;
  conformance: "Supports" | "Partially Supports" | "Does Not Support" | "Not Applicable" | "Not Evaluated";
  findings: Array<{
    element: string;
    impact: string;
    description: string;
    section: string;
    currentRatio?: number;
    requiredRatio: number;
    userImpact?: string;
  }>;
};

export type ReportData = {
  scan: {
    id: string;
    url: string;
    productType?: string | null;
    targetMarket?: string | null;
    industry?: string | null;
    complianceLevel: string;
    createdAt: Date;
    finishedAt: Date | null;
    pageCount: number;
    violationCount: number;
    source: string;
    regulations: Regulation[];
  };
  pages: Array<{
    url: string;
    title: string | null;
    sectionSummary: Record<string, { total: number; pass: number }>;
  }>;
  vpatSections: VpatSection[];
  businessImpact: BusinessImpact;
  readinessScore: VpatReadinessScore;
  summary: {
    totalFindings: number;
    passCount: number;
    failCount: number;
    reviewCount: number;
    sectionsWithIssues: string[];
  };
};

/**
 * Builds a VPAT-aligned report from scan data.
 */
export function buildVpatReport(scanData: {
  id: string;
  url: string;
  normalizedUrl: string;
  source: string;
  productType: string | null;
  targetMarket: string | null;
  industry: string | null;
  applicableRegulations: string | null;
  status: string;
  pageCount: number;
  violationCount: number;
  createdAt: Date;
  finishedAt: Date | null;
  pages: Array<{
    url: string;
    title: string | null;
    violations: Array<{
      id: string;
      impact: string | null;
      description: string;
      help: string;
      section: string | null;
      colorDataJson: string | null;
      heroAnalysisJson: string | null;
      failureSummary: string | null;
    }>;
  }>;
}): ReportData {
  const allViolations = scanData.pages.flatMap((p) =>
    p.violations.map((v) => ({ ...v, pageUrl: p.url, pageTitle: p.title })),
  );

  // Parse regulations
  let regulations: Regulation[] = [];
  try {
    if (scanData.applicableRegulations) {
      regulations = JSON.parse(scanData.applicableRegulations) as Regulation[];
    }
  } catch {
    // Keep empty
  }

  // Build VPAT sections
  const vpatSections: VpatSection[] = [
    {
      criterion: "1.4.3",
      title: "Contrast (Minimum)",
      level: "AA",
      conformance: deriveConformance(allViolations.filter((v) => v.impact !== "pass"), 0),
      findings: allViolations
        .filter((v) => v.impact !== "pass")
        .map((v) => {
          let isLargeText = false;
          let hasBgImage = false;
          try {
            if (v.colorDataJson) {
              const cd = JSON.parse(v.colorDataJson) as { isLargeText?: boolean };
              isLargeText = cd.isLargeText === true;
            }
            if (v.heroAnalysisJson) {
              const ha = JSON.parse(v.heroAnalysisJson) as { hasBackgroundImage?: boolean };
              hasBgImage = ha?.hasBackgroundImage === true;
            }
          } catch { /* ignore */ }
          const ui = getUserImpact({
            impact: v.impact,
            help: v.help,
            section: v.section,
            isLargeText,
            hasBackgroundImage: hasBgImage,
          });
          return {
            element: v.help,
            impact: v.impact ?? "unknown",
            description: v.description,
            section: v.section ?? "unknown",
            requiredRatio: 4.5,
            userImpact: `${ui.heading}: ${ui.body}`,
          };
        }),
    },
    {
      criterion: "1.4.6",
      title: "Contrast (Enhanced)",
      level: "AAA",
      conformance: deriveConformance(
        allViolations.filter((v) => v.impact === "serious"),
        allViolations.length,
      ),
      findings: allViolations
        .filter((v) => v.impact === "serious")
        .map((v) => {
          let isLargeText = false;
          let hasBgImage = false;
          try {
            if (v.colorDataJson) {
              const cd = JSON.parse(v.colorDataJson) as { isLargeText?: boolean };
              isLargeText = cd.isLargeText === true;
            }
            if (v.heroAnalysisJson) {
              const ha = JSON.parse(v.heroAnalysisJson) as { hasBackgroundImage?: boolean };
              hasBgImage = ha?.hasBackgroundImage === true;
            }
          } catch { /* ignore */ }
          const ui = getUserImpact({
            impact: v.impact,
            help: v.help,
            section: v.section,
            isLargeText,
            hasBackgroundImage: hasBgImage,
          });
          return {
            element: v.help,
            impact: v.impact ?? "unknown",
            description: v.description,
            section: v.section ?? "unknown",
            requiredRatio: 7.0,
            userImpact: `${ui.heading}: ${ui.body}`,
          };
        }),
    },
    {
      criterion: "1.4.11",
      title: "Non-text Contrast",
      level: "AA",
      conformance: "Not Applicable",
      findings: [],
    },
  ];

  // Page section summaries
  const pages = scanData.pages.map((p) => {
    const sectionSummary: Record<string, { total: number; pass: number }> = {};
    for (const v of p.violations) {
      const section = v.section ?? "unknown";
      if (!sectionSummary[section]) {
        sectionSummary[section] = { total: 0, pass: 0 };
      }
      sectionSummary[section].total++;
      if (v.impact === "pass") sectionSummary[section].pass++;
    }
    return { url: p.url, title: p.title, sectionSummary };
  });

  const passCount = allViolations.filter((v) => v.impact === "pass").length;
  const failCount = allViolations.filter((v) => v.impact !== "pass").length;
  const sectionsWithIssues = [
    ...new Set(
      allViolations.filter((v) => v.impact !== "pass").map((v) => v.section ?? "unknown"),
    ),
  ];

  const businessImpact = getBusinessImpact({
    regulations,
    industry: scanData.industry ?? "Other",
    violationCount: scanData.violationCount,
  });

  const readinessScore = computeVpatReadinessScore(
    allViolations.map((v) => ({ impact: v.impact, section: v.section })),
  );
  const gapAnalysis = generateGapAnalysis(
    allViolations
      .filter((v) => v.impact !== "pass")
      .map((v) => ({ impact: v.impact, section: v.section, help: v.help })),
  );

  return {
    scan: {
      id: scanData.id,
      url: scanData.url,
      productType: scanData.productType,
      targetMarket: scanData.targetMarket,
      industry: scanData.industry,
      complianceLevel: "AA",
      createdAt: scanData.createdAt,
      finishedAt: scanData.finishedAt,
      pageCount: scanData.pageCount,
      violationCount: scanData.violationCount,
      source: scanData.source,
      regulations,
    },
    pages,
    vpatSections,
    businessImpact,
    readinessScore,
    summary: {
      totalFindings: allViolations.length,
      passCount,
      failCount,
      reviewCount: allViolations.filter((v) => v.impact === "moderate").length,
      sectionsWithIssues,
    },
  };
}

function deriveConformance(
  failures: unknown[],
  total: number,
): "Supports" | "Partially Supports" | "Does Not Support" | "Not Applicable" {
  if (total === 0) return "Not Applicable";
  if (failures.length === 0) return "Supports";
  if (failures.length < total * 0.5) return "Partially Supports";
  return "Does Not Support";
}

// ── VPAT-Readiness Scoring ──

export type VpatReadinessScore = {
  /** Overall readiness score 0–100 */
  overall: number;
  /** Categorical rating */
  rating: "Ready" | "Nearly Ready" | "Needs Work" | "Not Ready";
  /** Per-criterion scores */
  criteria: Array<{
    criterion: string;
    title: string;
    level: string;
    score: number;
    blockingCount: number;
  }>;
};

export type VpatViolationTag = "blocking" | "advisory";

export type VpatGapItem = {
  criterion: string;
  criterionTitle: string;
  blockingCount: number;
  description: string;
};

/**
 * Weights violations by impact and section prominence to compute
 * a 0–100 VPAT readiness score. Serious issues in critical sections
 * (hero, navigation, main-content, form) are weighted most heavily.
 */
export function computeVpatReadinessScore(violations: Array<{
  impact: string | null;
  section: string | null;
}>): VpatReadinessScore {
  const impactWeight = (impact: string | null): number => {
    switch (impact) {
      case "serious": return 3;
      case "moderate": return 2;
      case "minor": return 1;
      default: return 0;
    }
  };

  const sectionWeight = (section: string | null): number => {
    switch (section) {
      case "hero": return 3;
      case "navigation": return 2.5;
      case "main-content": return 2;
      case "form": return 2;
      case "header": return 1.5;
      case "sidebar": return 1;
      case "footer": return 0.5;
      default: return 1;
    }
  };

  const nonPass = violations.filter((v) => v.impact !== "pass");

  // Compute weighted penalty
  let totalPenalty = 0;
  for (const v of nonPass) {
    totalPenalty += impactWeight(v.impact) * sectionWeight(v.section);
  }

  // Max theoretical penalty (all serious in hero): violations * 3 * 3
  const maxPenalty = Math.max(nonPass.length * 9, 1);
  const rawScore = Math.max(0, 100 - Math.round((totalPenalty / maxPenalty) * 100));

  // Count blocking issues (serious impact in critical sections)
  const criticalSections = ["hero", "navigation", "main-content", "form"];
  const blockingCount = nonPass.filter(
    (v) => v.impact === "serious" && criticalSections.includes(v.section ?? ""),
  ).length;
  const advisoryCount = nonPass.length - blockingCount;

  // Rating thresholds
  let rating: VpatReadinessScore["rating"];
  if (rawScore >= 90 && blockingCount === 0) {
    rating = "Ready";
  } else if (rawScore >= 70 && blockingCount <= 2) {
    rating = "Nearly Ready";
  } else if (rawScore >= 40) {
    rating = "Needs Work";
  } else {
    rating = "Not Ready";
  }

  // Per-criterion scores (simplified — real impl would group by criterion)
  const allSerious = nonPass.filter((v) => v.impact === "serious");
  const nonSerious = nonPass.filter((v) => v.impact !== "serious");

  return {
    overall: rawScore,
    rating,
    criteria: [
      {
        criterion: "1.4.3",
        title: "Contrast (Minimum)",
        level: "AA",
        score: nonPass.length === 0 ? 100 : Math.max(0, 100 - nonPass.length * 10),
        blockingCount: blockingCount,
      },
      {
        criterion: "1.4.6",
        title: "Contrast (Enhanced)",
        level: "AAA",
        score: allSerious.length === 0 ? 100 : Math.max(0, 100 - allSerious.length * 15),
        blockingCount: allSerious.filter((v) => criticalSections.includes(v.section ?? "")).length,
      },
      {
        criterion: "1.4.11",
        title: "Non-text Contrast",
        level: "AA",
        score: 100,
        blockingCount: 0,
      },
    ],
  };
}

/**
 * Classifies a single violation as "blocking" (must fix for VPAT
 * conformance) or "advisory" (improvement, not blocking).
 */
export function tagViolationVpatImpact(violation: {
  impact: string | null;
  section: string | null;
}): VpatViolationTag {
  const criticalSections = ["hero", "navigation", "main-content", "form", "header"];
  if (
    violation.impact === "serious" &&
    criticalSections.includes(violation.section ?? "")
  ) {
    return "blocking";
  }
  if (violation.impact === "serious") {
    return "blocking";
  }
  return "advisory";
}

/**
 * Generates a gap analysis: the minimum set of issues that must be
 * fixed to reach a higher readiness level for each criterion.
 */
export function generateGapAnalysis(violations: Array<{
  impact: string | null;
  section: string | null;
  help: string;
}>): VpatGapItem[] {
  const nonPass = violations.filter((v) => v.impact !== "pass");
  const blocking = nonPass.filter(
    (v) => v.impact === "serious",
  );

  const gaps: VpatGapItem[] = [];

  if (blocking.length > 0) {
    gaps.push({
      criterion: "1.4.3",
      criterionTitle: "Contrast (Minimum)",
      blockingCount: blocking.length,
      description:
        blocking.length === 1
          ? `Fix 1 serious contrast issue to reach "Supports" for WCAG 1.4.3 (Level AA).`
          : `Fix ${blocking.length} serious contrast issues to reach "Supports" for WCAG 1.4.3 (Level AA).`,
    });

    if (blocking.length > 0) {
      gaps.push({
        criterion: "1.4.6",
        criterionTitle: "Contrast (Enhanced)",
        blockingCount: blocking.length,
        description:
          blocking.length === 1
            ? `Fix 1 serious contrast issue to reach "Supports" for WCAG 1.4.6 (Level AAA).`
            : `Fix ${blocking.length} serious contrast issues to reach "Supports" for WCAG 1.4.6 (Level AAA).`,
      });
    }
  } else if (nonPass.length > 0) {
    gaps.push({
      criterion: "1.4.3",
      criterionTitle: "Contrast (Minimum)",
      blockingCount: nonPass.length,
      description:
        nonPass.length === 1
          ? `Address 1 moderate contrast issue to reach "Supports" for WCAG 1.4.3 (Level AA).`
          : `Address ${nonPass.length} moderate contrast issues to reach "Supports" for WCAG 1.4.3 (Level AA).`,
    });
  }

  return gaps;
}

/**
 * Renders the report as a styled standalone HTML page.
 */
export function renderReportHtml(report: ReportData): string {
  const { scan, vpatSections, businessImpact, readinessScore, summary, pages } = report;

  const formatDate = (d: Date | null) =>
    d
      ? new Intl.DateTimeFormat("en", {
          dateStyle: "medium",
          timeStyle: "short",
        }).format(new Date(d))
      : "N/A";

  const conformanceBadge = (c: string) => {
    const colors: Record<string, string> = {
      Supports: "#10b981",
      "Partially Supports": "#f59e0b",
      "Does Not Support": "#ef4444",
      "Not Applicable": "#6b7280",
    };
    return `<span style="display:inline-block;padding:2px 8px;border-radius:9999px;font-size:12px;font-weight:600;color:white;background:${colors[c] || "#6b7280"}">${c}</span>`;
  };

  const severityBadge = (impact: string) => {
    const colors: Record<string, string> = {
      serious: "#ef4444",
      moderate: "#f59e0b",
      minor: "#3b82f6",
      pass: "#10b981",
    };
    return `<span style="display:inline-block;padding:1px 6px;border-radius:4px;font-size:11px;font-weight:600;color:white;background:${colors[impact] || "#6b7280"}">${impact}</span>`;
  };

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VPAT Accessibility Conformance Report — ${scan.url}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; color: #1e293b; line-height: 1.6; max-width: 900px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 24px; margin-bottom: 8px; }
    h2 { font-size: 18px; margin: 24px 0 12px; border-bottom: 1px solid #e2e8f0; padding-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; font-size: 14px; }
    th, td { border: 1px solid #e2e8f0; padding: 10px 12px; text-align: left; vertical-align: top; }
    th { background: #f8fafc; font-weight: 600; font-size: 12px; text-transform: uppercase; color: #64748b; }
    .meta-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; margin: 16px 0; }
    .meta-item { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px; }
    .meta-label { font-size: 11px; text-transform: uppercase; color: #64748b; font-weight: 600; }
    .meta-value { font-size: 14px; font-weight: 500; margin-top: 4px; }
    .summary-grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin: 16px 0; }
    .summary-card { text-align: center; padding: 16px; border: 1px solid #e2e8f0; border-radius: 6px; }
    .summary-number { font-size: 28px; font-weight: 700; }
    .summary-label { font-size: 11px; text-transform: uppercase; color: #64748b; margin-top: 4px; }
    .footer { margin-top: 40px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 12px; color: #94a3b8; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Accessibility Conformance Report</h1>
  <p style="color:#64748b;font-size:14px;">VPAT 2.5 — WCAG Edition</p>

  <h2>Report Information</h2>
  <div class="meta-grid">
    <div class="meta-item">
      <div class="meta-label">Evaluated URL</div>
      <div class="meta-value" style="word-break:break-all">${scan.url}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Product Type</div>
      <div class="meta-value">${scan.productType || "Not specified"}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Target Market</div>
      <div class="meta-value">${scan.targetMarket || "Not specified"}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Industry</div>
      <div class="meta-value">${scan.industry || "Not specified"}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Scan Date</div>
      <div class="meta-value">${formatDate(scan.createdAt)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Completed</div>
      <div class="meta-value">${formatDate(scan.finishedAt)}</div>
    </div>
    <div class="meta-item">
      <div class="meta-label">Scan Method</div>
      <div class="meta-value">Automated (axe-core + Playwright)</div>
    </div>
  </div>

  ${scan.regulations.length > 0 ? `
  <h2>Applicable Regulations</h2>
  <ul style="margin:12px 0;font-size:14px;">
    ${scan.regulations.map((r: Regulation) => `<li><strong>${r.name}</strong> (${r.jurisdiction}) — WCAG ${r.wcagVersion} Level ${r.requiredLevel} · <a href="${r.sourceUrl}" target="_blank">Source</a></li>`).join("")}
  </ul>
  ` : ""}

  <h2>Business Impact Assessment</h2>
  ${(() => {
    const expColors: Record<string, string> = { high: "#ef4444", moderate: "#f59e0b", low: "#3b82f6" };
    const bgColors: Record<string, string> = { high: "#fef2f2", moderate: "#fffbeb", low: "#eff6ff" };
    const ec = expColors[businessImpact.exposureLevel] ?? "#3b82f6";
    const bg = bgColors[businessImpact.exposureLevel] ?? "#eff6ff";
    return "<div style=\"background:" + bg + ";border:1px solid " + ec + "20;border-radius:6px;padding:16px;margin:16px 0;\">" +
      "<div style=\"display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:12px;\">" +
      "<div>" +
      "<p style=\"font-size:14px;font-weight:600;color:" + ec + ";margin:0 0 4px;\">" + businessImpact.heading + "</p>" +
      "<p style=\"font-size:14px;color:#475569;margin:0;line-height:1.6;\">" + businessImpact.body + "</p>" +
      "</div>" +
      "<span style=\"display:inline-block;padding:2px 8px;border-radius:9999px;font-size:10px;font-weight:700;text-transform:uppercase;color:white;background:" + ec + ";white-space:nowrap;\">" + businessImpact.exposureLevel + " exposure</span>" +
      "</div>" +
      (businessImpact.risks.length > 0 ? "<ul style=\"margin:0;padding-left:16px;font-size:13px;color:#64748b;line-height:1.8;\">" +
        businessImpact.risks.map(function(r: string) { return "<li>" + r + "</li>"; }).join("") +
      "</ul>" : "") +
    "</div>";
  })()}

  <h2>Evaluation Methods</h2>
  <p style="font-size:14px;color:#475569;">Automated color contrast analysis was performed using axe-core (WCAG color-contrast rule) via Playwright browser automation. The evaluation covers WCAG 2.2 Success Criteria related to color contrast. Manual review of flagged items is recommended.</p>

  <h2>Findings Summary</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="summary-number">${summary.totalFindings}</div>
      <div class="summary-label">Total Findings</div>
    </div>
    <div class="summary-card">
      <div class="summary-number" style="color:#ef4444">${summary.failCount}</div>
      <div class="summary-label">Issues Found</div>
    </div>
    <div class="summary-card">
      <div class="summary-number" style="color:#10b981">${summary.passCount}</div>
      <div class="summary-label">Passed</div>
    </div>
    <div class="summary-card">
      <div class="summary-number" style="color:#f59e0b">${scan.pageCount}</div>
      <div class="summary-label">Pages Audited</div>
    </div>
  </div>

  <h2>VPAT Readiness Score</h2>
  ${(() => {
    const rs = readinessScore;
    const scoreColors: Record<string, string> = {
      Ready: "#10b981",
      "Nearly Ready": "#f59e0b",
      "Needs Work": "#f97316",
      "Not Ready": "#ef4444",
    };
    const sc = scoreColors[rs.rating] ?? "#6b7280";
    return "<div style=\"display:grid;grid-template-columns:auto 1fr;gap:16px;margin:16px 0;\">" +
      "<div style=\"text-align:center;padding:24px;border:2px solid " + sc + ";border-radius:12px;background:" + sc + "10;\">" +
      "<div style=\"font-size:42px;font-weight:700;color:" + sc + ";\">" + rs.overall + "</div>" +
      "<div style=\"font-size:11px;text-transform:uppercase;color:#64748b;margin-top:4px;\">out of 100</div>" +
      "<div style=\"display:inline-block;padding:3px 10px;border-radius:9999px;font-size:11px;font-weight:700;color:white;background:" + sc + ";margin-top:8px;\">" + rs.rating + "</div>" +
      "</div>" +
      "<div>" +
      "<p style=\"font-size:13px;color:#475569;margin:0 0 12px;line-height:1.6;\">This score reflects the weighted severity and location of contrast issues. <strong>Blocking</strong> issues are serious failures in critical page sections (hero, navigation, main content, forms).</p>" +
      "<table style=\"margin:0;\"><thead><tr><th>Criterion</th><th>Level</th><th>Blocking</th><th>Score</th></tr></thead><tbody>" +
      rs.criteria.map(function(c) {
        return "<tr><td><strong>" + c.criterion + "</strong> " + c.title + "</td><td>" + c.level + "</td><td style=\"color:" + (c.blockingCount > 0 ? "#ef4444" : "#10b981") + ";\"><strong>" + c.blockingCount + "</strong></td><td><strong>" + c.score + "</strong></td></tr>";
      }).join("") +
      "</tbody></table>" +
      "</div>" +
      "</div>";
  })()}

  ${(() => {
    const gaps = generateGapAnalysis(
      summary.totalFindings > 0 ? Array.from({ length: summary.failCount }, function() {
        return { impact: "serious", section: "main-content", help: "" };
      }) : [],
    );
    if (gaps.length === 0) return "";
    return "<h2>Gap Analysis</h2>" +
      "<p style=\"font-size:14px;color:#475569;margin:12px 0;\">Minimum fixes to improve conformance status:</p>" +
      "<ul style=\"margin:0;padding-left:16px;font-size:14px;color:#475569;line-height:1.8;\">" +
      gaps.map(function(g) { return "<li><strong>" + g.criterion + " " + g.criterionTitle + ":</strong> " + g.description + "</li>"; }).join("") +
      "</ul>";
  })()}

  <h2>WCAG 2.2 Conformance — Color Contrast Criteria</h2>
  <table>
    <thead>
      <tr>
        <th>Criteria</th>
        <th>Level</th>
        <th>Conformance</th>
        <th>Findings</th>
      </tr>
    </thead>
    <tbody>
      ${vpatSections.map((section) => `
        <tr>
          <td><strong>${section.criterion}</strong><br><span style="font-size:12px;color:#64748b">${section.title}</span></td>
          <td>${section.level}</td>
          <td>${conformanceBadge(section.conformance)}</td>
          <td>${section.findings.length} issue${section.findings.length !== 1 ? "s" : ""}</td>
        </tr>
      `).join("")}
    </tbody>
  </table>

  ${vpatSections.filter((s) => s.findings.length > 0).length > 0 ? `
  <h2>Detailed Findings</h2>
  ${vpatSections.filter((s) => s.findings.length > 0).map((section) => `
    <h3 style="font-size:16px;margin-top:20px;">${section.criterion} ${section.title} (Level ${section.level})</h3>
    <table>
      <thead>
        <tr>
          <th style="width:4%">#</th>
          <th style="width:10%">Severity</th>
          <th style="width:12%">Section</th>
          <th style="width:22%">Element</th>
          <th style="width:30%">Description</th>
          <th>User Impact</th>
        </tr>
      </thead>
      <tbody>
        ${section.findings.map((f, i) => `
          <tr>
            <td>${i + 1}</td>
            <td>${severityBadge(f.impact)}</td>
            <td>${f.section}</td>
            <td>${f.element}</td>
            <td style="font-size:13px">${f.description}</td>
            <td style="font-size:12px;color:#475569">${f.userImpact || "—"}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("")}
  ` : ""}

  <h2>Page-by-Page Summary</h2>
  ${pages.map((p, i) => `
    <h3 style="font-size:14px;margin-top:12px;">Page ${i + 1}: ${p.title || p.url}</h3>
    <p style="font-size:12px;color:#64748b;word-break:break-all">${p.url}</p>
    <table style="font-size:13px;">
      <thead>
        <tr><th>Section</th><th>Total</th><th>Passed</th><th>Issues</th></tr>
      </thead>
      <tbody>
        ${Object.entries(p.sectionSummary).map(([section, counts]) => `
          <tr>
            <td>${section}</td>
            <td>${counts.total}</td>
            <td>${counts.pass}</td>
            <td>${counts.total - counts.pass}</td>
          </tr>
        `).join("")}
      </tbody>
    </table>
  `).join("")}

  <div class="footer">
    <p>Generated by AccessReady Contrast Auditor on ${formatDate(new Date())}.</p>
    <p>This report is auto-generated and should be reviewed by an accessibility specialist for completeness.</p>
    <p>WCAG 2.2: <a href="https://www.w3.org/TR/WCAG22/">https://www.w3.org/TR/WCAG22/</a></p>
  </div>
</body>
</html>`;
}
