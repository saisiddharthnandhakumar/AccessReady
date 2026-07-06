import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Download, ExternalLink, Scale, ShieldAlert, Target } from "lucide-react";
import { prisma } from "@/lib/db";
import { cn } from "@/lib/utils";
import { PageFindingsViewer } from "@/components/page-findings-viewer";
import { ScanStatusBadge } from "@/components/scan-status-badge";
import { ScanStatusPoller } from "@/components/scan-status-poller";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { type Regulation } from "@/lib/compliance";
import { getBusinessImpact } from "@/lib/business-impact";
import { computeVpatReadinessScore, tagViolationVpatImpact, generateGapAnalysis } from "@/lib/report-generator";

export const dynamic = "force-dynamic";

function formatDate(date: Date | null) {
  if (!date) return "Not finished";
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function ScanDetail({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const scan = await prisma.scan.findUnique({
    where: { id },
    include: {
      pages: {
        orderBy: { createdAt: "asc" },
        include: {
          violations: {
            orderBy: [{ impact: "asc" }, { createdAt: "asc" }],
          },
          imageAnalyses: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
    },
  });

  if (!scan) notFound();

  return (
    <div className="space-y-6 px-4 py-6 sm:px-6 lg:px-8 w-full">
      {/* ── Breadcrumb ── */}
      <Button asChild variant="ghost" size="sm" className="-ml-3 text-foreground-secondary">
        <Link href="/">
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Dashboard
        </Link>
      </Button>

      {/* ── Header ── */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h1 className="text-2xl font-semibold tracking-tight font-heading sm:text-3xl text-foreground">
              Scan Findings
            </h1>
            <ScanStatusBadge status={scan.status} />
          </div>
          <p className="break-all text-sm text-foreground-secondary font-mono">
            {scan.normalizedUrl}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {scan.source === "url" ? (
            <Button asChild variant="secondary" size="sm">
              <a href={scan.normalizedUrl} target="_blank" rel="noreferrer">
                <ExternalLink className="h-4 w-4" aria-hidden="true" />
                Open Site
              </a>
            </Button>
          ) : null}
          {scan.status === "completed" ? (
            <Button asChild variant="outline" size="sm">
              <a href={`/api/scans/${scan.id}/report`} target="_blank" rel="noreferrer">
                <Download className="h-4 w-4" aria-hidden="true" />
                VPAT Report
              </a>
            </Button>
          ) : null}
        </div>
      </div>

      {/* ── Status Poller (polls API while scan is running) ── */}
      <ScanStatusPoller scanId={scan.id} status={scan.status} />

      {/* ── Stuck Scan Warning (server-side: running > 5 min with no progress) ── */}
      {scan.status === "running" &&
      Date.now() - new Date(scan.createdAt).getTime() > 300_000 ? (
        <Card className="border-warning/30 bg-warning-muted">
          <CardContent className="pt-5 space-y-2">
            <p className="text-sm font-medium text-warning">
              This scan started {Math.round((Date.now() - new Date(scan.createdAt).getTime()) / 60_000)} minutes ago and may have been interrupted.
            </p>
            <p className="text-sm text-foreground-secondary">
              Vercel serverless functions have a time limit. If the target site is slow or blocks automated audits, the scan cannot complete.{" "}
              <Link href="/" className="underline hover:text-foreground">
                Start a new scan
              </Link>
              {" "}or try a different URL.
            </p>
          </CardContent>
        </Card>
      ) : null}

      {/* ── Error Card ── */}
      {scan.error ? (
        <Card className="border-danger-muted bg-danger-muted">
          <CardContent className="pt-5 text-sm text-danger">{scan.error}</CardContent>
        </Card>
      ) : null}

      {/* ── Metadata ── */}
      {(scan.productType || scan.targetMarket || scan.industry || scan.notes) ? (
        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {scan.productType ? (
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Product Type</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {scan.productType}
                  {scan.productTypeOther ? <span className="block text-xs font-normal text-foreground-muted">Custom: {scan.productTypeOther}</span> : null}
                </p>
              </CardContent>
            </Card>
          ) : null}
          {scan.targetMarket ? (
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Target Market</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {scan.targetMarket}
                  {scan.targetMarketOther ? <span className="block text-xs font-normal text-foreground-muted">Custom: {scan.targetMarketOther}</span> : null}
                </p>
              </CardContent>
            </Card>
          ) : null}
          {scan.industry ? (
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Industry</p>
                <p className="mt-2 text-sm font-medium text-foreground">
                  {scan.industry}
                  {scan.industryOther ? <span className="block text-xs font-normal text-foreground-muted">Custom: {scan.industryOther}</span> : null}
                </p>
              </CardContent>
            </Card>
          ) : null}
          {scan.notes ? (
            <Card>
              <CardContent className="pt-5">
                <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Reviewer Notes</p>
                <p className="mt-2 whitespace-pre-wrap text-sm text-foreground-secondary">{scan.notes}</p>
              </CardContent>
            </Card>
          ) : null}
        </section>
      ) : null}

      {/* ── Regulations ── */}
      {scan.applicableRegulations ? (
        <section className="space-y-2">
          <div className="flex items-center gap-2">
            <Scale className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
            <h3 className="text-sm font-medium text-foreground-secondary">Applicable Regulations</h3>
          </div>
          <div className="flex flex-wrap gap-2">
            {(JSON.parse(scan.applicableRegulations) as Regulation[]).map((reg) => (
              <Badge key={reg.code} variant="outline" className="text-xs">
                <a href={reg.sourceUrl} target="_blank" rel="noreferrer" className="hover:underline">
                  {reg.name} ({reg.jurisdiction}) — WCAG {reg.wcagVersion} Level {reg.requiredLevel}
                </a>
              </Badge>
            ))}
          </div>
        </section>
      ) : null}

      {/* ── Business Impact ── */}
      {(() => {
        let regulations: Regulation[] = [];
        try {
          if (scan.applicableRegulations) {
            regulations = JSON.parse(scan.applicableRegulations) as Regulation[];
          }
        } catch { /* ignore */ }
        const impact = getBusinessImpact({
          regulations,
          industry: scan.industry ?? "Other",
          violationCount: scan.violationCount,
        });
        const exposureColors: Record<string, string> = {
          high: "border-danger/30 bg-danger-muted",
          moderate: "border-warning/30 bg-warning-muted",
          low: "border-info/30 bg-info-muted",
        };
        const exposureTextColors: Record<string, string> = {
          high: "text-danger",
          moderate: "text-warning",
          low: "text-info",
        };
        return (
          <section className="space-y-2">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground-secondary">Business Impact</h3>
            </div>
            <Card className={exposureColors[impact.exposureLevel] ?? exposureColors.low}>
              <CardContent className="pt-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="space-y-1">
                    <p className={cn("text-sm font-semibold", exposureTextColors[impact.exposureLevel] ?? "text-info")}>
                      {impact.heading}
                    </p>
                    <p className="text-sm leading-6 text-foreground-secondary">{impact.body}</p>
                  </div>
                  <span className={cn(
                    "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider",
                    impact.exposureLevel === "high" ? "bg-danger-muted text-danger" :
                    impact.exposureLevel === "moderate" ? "bg-warning-muted text-warning" :
                    "bg-info-muted text-info"
                  )}>
                    {impact.exposureLevel} exposure
                  </span>
                </div>
                {impact.risks.length > 0 ? (
                  <ul className="space-y-1.5">
                    {impact.risks.map((risk, i) => (
                      <li key={i} className="flex items-start gap-2 text-xs text-foreground-secondary">
                        <span className="mt-0.5 shrink-0 text-foreground-muted" aria-hidden="true">•</span>
                        <span>{risk}</span>
                      </li>
                    ))}
                  </ul>
                ) : null}
              </CardContent>
            </Card>
          </section>
        );
      })()}

      {/* ── Stats Cards ── */}
      <section className="grid gap-4 sm:grid-cols-3">
        <Card className="animate-enter" style={{ animationDelay: "0ms" }}>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Pages Audited</p>
            <p className="mt-2 text-3xl font-semibold font-heading text-foreground">{scan.pageCount}</p>
          </CardContent>
        </Card>
        <Card
          className={cn("animate-enter", scan.violationCount > 0 ? "border-l-4 border-l-primary" : "")}
          style={{ animationDelay: "75ms" }}
        >
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Contrast Issues</p>
            <p className={cn("mt-2 text-3xl font-semibold font-heading", scan.violationCount > 0 ? "text-primary" : "text-success")}>
              {scan.violationCount}
            </p>
          </CardContent>
        </Card>
        <Card className="animate-enter" style={{ animationDelay: "150ms" }}>
          <CardContent className="pt-5">
            <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">Finished</p>
            <p className="mt-2 text-sm font-medium text-foreground">{formatDate(scan.finishedAt)}</p>
          </CardContent>
        </Card>
      </section>

      {/* ── VPAT Readiness Score ── */}
      {(() => {
        const allViolations = scan.pages.flatMap((p) =>
          p.violations.map((v) => ({ impact: v.impact, section: v.section, help: v.help })),
        );
        const score = computeVpatReadinessScore(allViolations);
        const gaps = generateGapAnalysis(allViolations.filter((v) => v.impact !== "pass"));
        const scoreColors: Record<string, string> = {
          Ready: "text-success",
          "Nearly Ready": "text-warning",
          "Needs Work": "text-primary",
          "Not Ready": "text-danger",
        };
        const scoreBorders: Record<string, string> = {
          Ready: "border-success/30",
          "Nearly Ready": "border-warning/30",
          "Needs Work": "border-primary/30",
          "Not Ready": "border-danger/30",
        };
        return (
          <section className="space-y-3">
            <div className="flex items-center gap-2">
              <Target className="h-4 w-4 text-foreground-muted" aria-hidden="true" />
              <h3 className="text-sm font-medium text-foreground-secondary">VPAT Readiness</h3>
            </div>
            <div className="grid gap-4 sm:grid-cols-[auto_1fr]">
              <Card className={cn("text-center", scoreBorders[score.rating] ?? "border-border")}>
                <CardContent className="pt-5 flex flex-col items-center">
                  <p className={cn("text-4xl font-bold font-heading", scoreColors[score.rating] ?? "text-foreground-muted")}>
                    {score.overall}
                  </p>
                  <p className="text-xs text-foreground-muted mt-1">out of 100</p>
                  <Badge variant={score.rating === "Ready" ? "success" : score.rating === "Nearly Ready" ? "warning" : score.rating === "Needs Work" ? "default" : "danger"} className="mt-2 text-[10px]">
                    {score.rating}
                  </Badge>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-5 space-y-3">
                  <p className="text-xs text-foreground-secondary leading-5">
                    This score weights issues by severity and section prominence. <strong>Blocking</strong> issues are serious failures in critical sections (hero, navigation, main content, forms) that must be fixed for VPAT conformance.
                  </p>
                  <div className="grid gap-2 text-xs">
                    {score.criteria.map((c) => (
                      <div key={c.criterion} className="flex items-center justify-between gap-2 rounded bg-surface-hover px-3 py-1.5">
                        <span className="font-medium text-foreground">{c.criterion} {c.title} ({c.level})</span>
                        <span className="flex items-center gap-2">
                          {c.blockingCount > 0 ? (
                            <span className="text-danger font-semibold">{c.blockingCount} blocking</span>
                          ) : (
                            <span className="text-success font-medium">Clear</span>
                          )}
                          <span className="text-foreground-muted">{c.score}/100</span>
                        </span>
                      </div>
                    ))}
                  </div>
                  {gaps.length > 0 ? (
                    <div className="rounded-md border border-warning/20 bg-warning-muted p-2.5">
                      <p className="text-xs font-medium text-warning">Gap Analysis</p>
                      <ul className="mt-1 space-y-0.5">
                        {gaps.map((g, i) => (
                          <li key={i} className="text-xs text-warning/80">{g.description}</li>
                        ))}
                      </ul>
                    </div>
                  ) : null}
                </CardContent>
              </Card>
            </div>
          </section>
        );
      })()}

      <Separator />

      {/* ── Findings Viewer ── */}
      <PageFindingsViewer
        scanId={scan.id}
        source={scan.source}
        pages={scan.pages.map((page) => ({
          id: page.id,
          url: page.url,
          title: page.title,
          statusCode: page.statusCode,
          screenshotPath: page.screenshotPath,
          violationCount: page.violationCount,
          violations: page.violations.map((violation) => ({
            id: violation.id,
            impact: violation.impact,
            description: violation.description,
            help: violation.help,
            helpUrl: violation.helpUrl,
            targetJson: violation.targetJson,
            boundingBoxJson: violation.boundingBoxJson,
            colorDataJson: violation.colorDataJson,
            section: violation.section,
            heroAnalysisJson: violation.heroAnalysisJson,
            html: violation.html,
            failureSummary: violation.failureSummary,
          })),
          imageAnalyses: page.imageAnalyses.map((ia) => ({
            id: ia.id,
            imageUrl: ia.imageUrl,
            imageType: ia.imageType,
            altText: ia.altText,
            mimeType: ia.mimeType,
            storedPath: ia.storedPath,
            status: ia.status,
            error: ia.error,
            resultJson: ia.resultJson,
          })),
        }))}
      />
    </div>
  );
}
