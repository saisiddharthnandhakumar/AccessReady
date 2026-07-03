import Link from "next/link";
import { Activity, ArrowRight, FileSearch, ShieldCheck } from "lucide-react";
import { prisma } from "@/lib/db";
import { ScanForm } from "@/components/scan-form";
import { ScanStatusBadge } from "@/components/scan-status-badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export const dynamic = "force-dynamic";

function formatDate(date: Date) {
  return new Intl.DateTimeFormat("en", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export default async function Home() {
  const scans = await prisma.scan.findMany({
    orderBy: { createdAt: "desc" },
    take: 8,
  });

  const latest = scans[0];

  return (
    <>
      {/* ── Hero Section ── */}
      <section className="border-b border-border bg-surface-raised">
        <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-10 sm:px-6 lg:px-8">
          <div className="flex flex-col gap-4">
            <div className="inline-flex items-center gap-2 self-start rounded-full border border-primary/30 bg-primary-muted px-3 py-1 text-xs font-medium text-primary">
              <ShieldCheck className="h-3.5 w-3.5" aria-hidden="true" />
              WCAG 2.2 AA Contrast Audits
            </div>
            <div className="max-w-3xl space-y-3">
              <h1 className="text-3xl font-semibold tracking-tight font-heading sm:text-4xl">
                Accessibility Contrast Auditor
              </h1>
              <p className="text-base leading-7 text-foreground-secondary max-w-2xl">
                Enter a website URL to audit a page with axe-core for WCAG 2.2 AA
                color contrast violations. Screenshots and findings are saved and
                available for review.
              </p>
            </div>
          </div>
          <Card className="max-w-4xl shadow-md">
            <CardHeader className="border-b border-border">
              <CardTitle className="text-lg">Start A Scan</CardTitle>
            </CardHeader>
            <CardContent className="pt-5">
              <ScanForm />
            </CardContent>
          </Card>
        </div>
      </section>

      {/* ── Content Section ── */}
      <section className="mx-auto grid w-full max-w-6xl gap-6 px-4 py-8 sm:px-6 lg:grid-cols-[1.4fr_0.8fr] lg:px-8">
        {/* ── Recent Scans ── */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between gap-4 border-b border-border">
            <CardTitle>Recent Scans</CardTitle>
            <Activity className="h-5 w-5 text-foreground-muted" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            {scans.length === 0 ? (
              <div className="rounded-md border border-dashed border-border p-8 text-center text-sm text-foreground-secondary">
                No scans yet. Run the first audit to populate this dashboard.
              </div>
            ) : (
              <div className="divide-y divide-border">
                {scans.map((scan) => (
                  <Link
                    key={scan.id}
                    href={`/scans/${scan.id}`}
                    className="group grid gap-3 py-4 transition-all duration-200 hover:bg-surface-hover -mx-2 px-2 rounded-md sm:grid-cols-[1fr_auto]"
                  >
                    <div className="min-w-0 space-y-1">
                      <p className="truncate text-sm font-medium text-foreground group-hover:text-primary transition-colors">
                        {scan.normalizedUrl}
                      </p>
                      <p className="text-xs text-foreground-muted">
                        {formatDate(scan.createdAt)}
                      </p>
                      {(scan.productType || scan.targetMarket || scan.industry) ? (
                        <div className="flex flex-wrap gap-1.5">
                          {scan.productType ? (
                            <Badge variant="default">{scan.productType}</Badge>
                          ) : null}
                          {scan.targetMarket ? (
                            <Badge variant="default">{scan.targetMarket}</Badge>
                          ) : null}
                          {scan.industry ? (
                            <Badge variant="secondary">{scan.industry}</Badge>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-2 text-sm text-foreground-secondary">
                      <ScanStatusBadge status={scan.status} />
                      <span>{scan.pageCount} pages</span>
                      <span>{scan.violationCount} issues</span>
                      <ArrowRight className="h-4 w-4 opacity-0 -translate-x-1 transition-all duration-200 group-hover:opacity-100 group-hover:translate-x-0 text-primary" aria-hidden="true" />
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Latest Summary ── */}
        <Card>
          <CardHeader className="border-b border-border">
            <CardTitle>Latest Summary</CardTitle>
          </CardHeader>
          <CardContent>
            {latest ? (
              <div className="space-y-5">
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-md border border-border bg-surface-hover p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-foreground-muted">
                      Pages
                    </p>
                    <p className="mt-2 text-2xl font-semibold font-heading text-foreground">
                      {latest.pageCount}
                    </p>
                  </div>
                  <div className="rounded-md border border-primary/20 bg-primary-muted p-4">
                    <p className="text-xs font-medium uppercase tracking-wider text-primary">
                      Issues
                    </p>
                    <p className="mt-2 text-2xl font-semibold font-heading text-primary">
                      {latest.violationCount}
                    </p>
                  </div>
                </div>
                <div className="space-y-2">
                  <ScanStatusBadge status={latest.status} />
                  <p className="break-all text-sm text-foreground-secondary font-mono">
                    {latest.normalizedUrl}
                  </p>
                </div>
                <Button asChild variant="accent" className="w-full">
                  <Link href={`/scans/${latest.id}`}>
                    <FileSearch className="h-4 w-4" aria-hidden="true" />
                    View Findings
                  </Link>
                </Button>
              </div>
            ) : (
              <p className="text-sm leading-6 text-foreground-secondary">
                Your latest audit summary will appear here after the first scan.
              </p>
            )}
          </CardContent>
        </Card>
      </section>
    </>
  );
}
