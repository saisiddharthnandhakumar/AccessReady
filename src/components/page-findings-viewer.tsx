"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, ExternalLink, Eye, EyeOff, Layers, List, LocateFixed } from "lucide-react";
import { SeverityBadge } from "@/components/severity-badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  COLOR_BLIND_FILTERS,
  contrastRating,
  formatContrastRatio,
  normalizeHexColor,
  type ColorBlindMode,
  type ColorData,
} from "@/lib/contrast";
import { cn } from "@/lib/utils";
import {
  SECTION_LABELS,
  type PageSection,
} from "@/lib/page-sections";
import { type HeroAnalysis } from "@/lib/hero-detection";
import { type FixRecommendation } from "@/lib/recommendations";
import { type ImageAnalysisResult } from "@/lib/vision-analysis";
import { getUserImpact, type UserImpact } from "@/lib/user-impact";

type ElementBox = { x: number; y: number; width: number; height: number };

export type FindingViolation = {
  id: string; impact: string | null; description: string; help: string;
  helpUrl: string; targetJson: string; boundingBoxJson: string | null;
  colorDataJson: string | null; section: string | null;
  heroAnalysisJson: string | null; html: string; failureSummary: string | null;
};

export type FindingPage = {
  id: string; url: string; title: string | null; statusCode: number | null;
  screenshotPath: string | null; violationCount: number; violations: FindingViolation[];
  imageAnalyses?: FindingImageAnalysis[];
};

type FindingImageAnalysis = {
  id: string;
  imageUrl: string;
  imageType: string;
  altText: string | null;
  mimeType: string | null;
  storedPath: string | null;
  status: string;
  error: string | null;
  resultJson: string | null;
};

type PreviewState = { targetKey: string | null; path: string | null; isLoading: boolean; error: string | null };
type ColorEdit = { foreground: string; background: string };

function parseTargets(targetJson: string) {
  try { const targets = JSON.parse(targetJson); return Array.isArray(targets) ? targets.join(", ") : targetJson; }
  catch { return targetJson; }
}

function parseBox(boundingBoxJson: string | null): ElementBox | null {
  if (!boundingBoxJson) return null;
  try {
    const box = JSON.parse(boundingBoxJson) as Partial<ElementBox>;
    if (typeof box.x === "number" && typeof box.y === "number" && typeof box.width === "number" && typeof box.height === "number")
      return box as ElementBox;
  } catch { return null; }
  return null;
}

function parseColorData(colorDataJson: string | null): ColorData | null {
  if (!colorDataJson) return null;
  try {
    const data = JSON.parse(colorDataJson) as Partial<ColorData>;
    const fg = normalizeHexColor(data.foreground);
    const bg = normalizeHexColor(data.background);
    if (!fg || !bg) return null;
    return {
      foreground: fg, background: bg,
      contrastRatio: typeof data.contrastRatio === "number" ? data.contrastRatio : contrastRating(fg, bg).ratio,
      sampleText: data.sampleText, source: "axe",
      isLargeText: data.isLargeText === true,
    };
  } catch { return null; }
}

function boxStyle(box: ElementBox) {
  return { left: `${box.x}px`, top: `${box.y}px`, width: `${Math.max(box.width, 12)}px`, height: `${Math.max(box.height, 12)}px` };
}

function ColorBlindFilters() {
  return (
    <svg aria-hidden="true" xmlns="http://www.w3.org/2000/svg" width={0} height={0} style={{ position: "absolute", width: 0, height: 0 }}>
      <defs>
        <filter id="accessready-protanopia"><feColorMatrix type="matrix" values="0.567 0.433 0 0 0 0.558 0.442 0 0 0 0 0.242 0.758 0 0 0 0 0 1 0" /></filter>
        <filter id="accessready-deuteranopia"><feColorMatrix type="matrix" values="0.625 0.375 0 0 0 0.7 0.3 0 0 0 0 0.3 0.7 0 0 0 0 0 1 0" /></filter>
        <filter id="accessready-tritanopia"><feColorMatrix type="matrix" values="0.95 0.05 0 0 0 0 0.433 0.567 0 0 0 0.475 0.525 0 0 0 0 0 1 0" /></filter>
      </defs>
    </svg>
  );
}

function ColorField({ id, label, value, onChange }: { id: string; label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="text-xs font-medium text-foreground-secondary">{label}</label>
      <div className="grid grid-cols-[2.5rem_1fr] gap-2">
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value)}
          className="h-9 w-10 rounded-md border border-border bg-surface-raised p-0.5 cursor-pointer" />
        <Input value={value} onChange={(e) => { const n = normalizeHexColor(e.target.value); if (n) onChange(n); }}
          className="h-9 font-mono text-xs" />
      </div>
    </div>
  );
}

function ContrastEditor({ colorData, foreground, background, onForegroundChange, onBackgroundChange, previewState }: {
  colorData: ColorData | null; foreground: string; background: string;
  onForegroundChange: (v: string) => void; onBackgroundChange: (v: string) => void; previewState: PreviewState;
}) {
  if (!colorData) {
    return <div className="rounded-md border border-border bg-surface-hover p-3 text-xs text-foreground-secondary">Color metadata unavailable.</div>;
  }
  const rating = contrastRating(foreground, background, colorData.isLargeText);
  const sampleText = colorData.sampleText || "Sample";

  return (
    <div className="space-y-3 rounded-md border border-border bg-surface-raised p-3">
      <ColorField id="foreground-color" label="Foreground" value={foreground} onChange={onForegroundChange} />
      <ColorField id="background-color" label="Background" value={background} onChange={onBackgroundChange} />

      <div className="space-y-2">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-xs text-foreground-muted">Contrast Ratio</p>
            <p className="text-3xl font-semibold font-heading text-foreground">
              {formatContrastRatio(rating.ratio)}<span className="text-lg text-foreground-secondary">:1</span>
            </p>
          </div>
          <div className="min-w-24 rounded-md border border-border px-3 py-2 text-center text-sm"
            style={{ color: foreground, backgroundColor: background }}>{sampleText}</div>
        </div>

        <div className="grid gap-1.5 sm:grid-cols-2">
          <div className={cn("rounded-full px-2.5 py-1 text-xs font-medium", rating.aa ? "bg-success-muted text-success" : "bg-danger-muted text-danger")}>
            AA - {rating.aa ? "Pass" : "Fail"}
          </div>
          <div className={cn("rounded-full px-2.5 py-1 text-xs font-medium", rating.aaa ? "bg-success-muted text-success" : "bg-surface-hover text-foreground-muted")}>
            AAA - {rating.aaa ? "Pass" : "Fail"}
          </div>
        </div>

        <p className={cn("text-xs", rating.aa ? "text-success" : "text-danger")}>
          {rating.aa ? "Meets minimum contrast." : "Does not meet minimum contrast."}
        </p>
        {previewState.isLoading && <p className="text-xs text-foreground-muted">Updating preview...</p>}
        {previewState.error && <p className="text-xs text-danger">{previewState.error}</p>}
      </div>
    </div>
  );
}

function parseImageResult(resultJson: string | null): ImageAnalysisResult | null {
  if (!resultJson) return null;
  try {
    return JSON.parse(resultJson) as ImageAnalysisResult;
  } catch {
    return null;
  }
}

function ImageAnalysisPanel({ imageAnalyses }: { imageAnalyses: FindingImageAnalysis[] }) {
  if (!imageAnalyses || imageAnalyses.length === 0) return null;

  const completedCount = imageAnalyses.filter((ia) => ia.status === "completed").length;
  const failedCount = imageAnalyses.filter((ia) => ia.status === "failed").length;
  const skippedCount = imageAnalyses.filter((ia) => ia.status === "skipped").length;
  const totalIssues = imageAnalyses.reduce((sum, ia) => {
    const result = parseImageResult(ia.resultJson);
    return sum + (result?.wcagViolations?.length ?? 0);
  }, 0);

  return (
    <div className="border-t border-border">
      <div className="border-b border-border bg-surface-hover px-4 py-3">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-foreground">Image Text Analysis</span>
            <span className="text-xs text-foreground-muted">
              ({completedCount} analyzed{skippedCount > 0 ? `, ${skippedCount} no text` : ""}{failedCount > 0 ? `, ${failedCount} failed` : ""})
            </span>
          </div>
          {totalIssues > 0 && (
            <span className="rounded-full bg-danger-muted px-2 py-0.5 text-[11px] font-semibold text-danger">
              {totalIssues} issue{totalIssues !== 1 ? "s" : ""}
            </span>
          )}
        </div>
      </div>

      <div className="divide-y divide-border">
        {imageAnalyses.map((ia) => {
          const result = parseImageResult(ia.resultJson);
          const isCompleted = ia.status === "completed" && result;
          const isSkipped = ia.status === "skipped";
          const isFailed = ia.status === "failed";

          return (
            <div key={ia.id} className="p-4 space-y-3">
              {/* Image info header with thumbnail */}
              <div className="flex items-start gap-3">
                {/* Image thumbnail */}
                {ia.storedPath ? (
                  <a
                    href={ia.storedPath}
                    target="_blank"
                    rel="noreferrer"
                    className="shrink-0 block overflow-hidden rounded-md border border-border hover:ring-2 hover:ring-primary/50 transition-all"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={ia.storedPath}
                      alt={ia.altText || "Analyzed image"}
                      className="h-16 w-auto max-w-[100px] object-cover"
                    />
                  </a>
                ) : (
                  <div className="shrink-0 flex h-16 w-20 items-center justify-center rounded-md border border-dashed border-border bg-surface-hover text-[10px] text-foreground-muted">
                    No preview
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-medium text-foreground truncate" title={ia.imageUrl}>
                    {ia.altText || ia.imageUrl.split("/").pop() || ia.imageUrl}
                  </p>
                  <p className="text-[10px] text-foreground-muted mt-0.5">
                    {ia.imageType === "img" ? "<img>" : "CSS background"} · {ia.mimeType ?? "unknown"}
                  </p>
                </div>
                {isCompleted && result?.hasText && (
                  <span className="shrink-0 rounded-full bg-info-muted px-2 py-0.5 text-[10px] font-medium text-info">
                    {result.textRegions.length} text region{result.textRegions.length !== 1 ? "s" : ""}
                  </span>
                )}
                {isSkipped && (
                  <span className="shrink-0 rounded-full bg-surface-hover px-2 py-0.5 text-[10px] text-foreground-muted">
                    No text
                  </span>
                )}
                {isFailed && (
                  <span className="shrink-0 rounded-full bg-danger-muted px-2 py-0.5 text-[10px] text-danger">
                    Failed
                  </span>
                )}
              </div>

              {/* Failed state */}
              {isFailed && ia.error && (
                <p className="text-xs text-danger bg-danger-muted rounded-md p-2">{ia.error}</p>
              )}

              {/* Skipped state */}
              {isSkipped && (
                <p className="text-xs text-foreground-secondary">
                  No visible text detected in this image. Skipping contrast analysis.
                </p>
              )}

              {/* Completed: WCAG violations */}
              {isCompleted && result && result.wcagViolations.length > 0 && (
                <div className="space-y-2">
                  <p className="text-xs font-medium text-foreground-secondary">
                    Contrast Violations ({result.wcagViolations.length})
                  </p>
                  {result.wcagViolations.map((v, i) => (
                    <div key={i} className="rounded-md border border-danger/20 bg-danger-muted/30 p-2.5 space-y-1.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-medium text-foreground truncate max-w-[200px]">
                          &ldquo;{v.text.slice(0, 50)}&rdquo;
                        </span>
                        <span className={v.passesAA ? "text-[10px] text-success font-medium" : "text-[10px] text-danger font-medium"}>
                          {v.passesAA ? "AA Pass" : "AA Fail"}
                        </span>
                        <span className={v.passesAAA ? "text-[10px] text-success font-medium" : "text-[10px] text-foreground-muted font-medium"}>
                          {v.passesAAA ? "AAA Pass" : "AAA Fail"}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-[10px]">
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded border border-border" style={{ backgroundColor: v.foreground }} />
                          <span className="font-mono text-foreground-secondary">{v.foreground}</span>
                        </span>
                        <span className="text-foreground-muted">on</span>
                        <span className="inline-flex items-center gap-1">
                          <span className="inline-block h-3 w-3 rounded border border-border" style={{ backgroundColor: v.background }} />
                          <span className="font-mono text-foreground-secondary">{v.background}</span>
                        </span>
                        <span className="text-foreground-muted ml-auto">
                          {v.currentRatio}:1 (need {v.requiredRatio}:1)
                        </span>
                      </div>
                      <p className="text-[11px] text-foreground-secondary leading-4">{v.recommendation}</p>
                    </div>
                  ))}
                </div>
              )}

              {/* Completed: All passed */}
              {isCompleted && result && result.hasText && result.wcagViolations.length === 0 && (
                <div className="rounded-md border border-success/20 bg-success-muted/30 p-2.5">
                  <p className="text-xs text-success font-medium">
                    All {result.textRegions.length} text region(s) pass WCAG AA contrast requirements.
                  </p>
                  <p className="text-[10px] text-foreground-secondary mt-1">{result.overallAssessment}</p>
                </div>
              )}

              {/* Color-blind assessments */}
              {isCompleted && result && result.colorBlindAssessments.length > 0 && (
                <div className="space-y-1.5">
                  <p className="text-xs font-medium text-foreground-secondary">Color-Blind Impact</p>
                  <div className="grid gap-1.5 sm:grid-cols-2">
                    {result.colorBlindAssessments.map((cba, i) => (
                      <div key={i} className={cn(
                        "rounded-md border p-2",
                        cba.severity === "high" ? "border-danger/20 bg-danger-muted/20" :
                        cba.severity === "moderate" ? "border-warning/20 bg-warning-muted/20" :
                        "border-info/20 bg-info-muted/20",
                      )}>
                        <div className="flex items-center gap-1.5">
                          <span className={cn(
                            "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                            cba.severity === "high" ? "bg-danger-muted text-danger" :
                            cba.severity === "moderate" ? "bg-warning-muted text-warning" :
                            "bg-info-muted text-info",
                          )}>
                            {cba.mode}
                          </span>
                          <span className="text-[10px] text-foreground-muted capitalize">{cba.severity}</span>
                        </div>
                        <p className="text-[11px] text-foreground-secondary mt-1 leading-4">{cba.description}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Fix recommendations */}
              {isCompleted && result && result.fixRecommendations.length > 0 && (
                <div className="space-y-1.5">
                  {result.fixRecommendations.map((rec, i) => (
                    <div key={i} className="rounded-md border border-info/20 bg-info-muted/30 p-2 space-y-1">
                      <div className="flex items-center gap-1.5">
                        <span className={cn(
                          "rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                          rec.priority === "required" ? "bg-danger-muted text-danger" : "bg-surface-hover text-foreground-secondary",
                        )}>
                          {rec.priority}
                        </span>
                        <span className="text-[10px] text-foreground-muted capitalize">{rec.type.replace(/-/g, " ")}</span>
                      </div>
                      <p className="text-xs text-foreground">{rec.description}</p>
                      {rec.cssSnippet && (
                        <div className="relative">
                          <pre className="rounded bg-surface-hover p-1.5 text-[10px] font-mono text-foreground-secondary overflow-x-auto">{rec.cssSnippet}</pre>
                          <button type="button" onClick={() => navigator.clipboard.writeText(rec.cssSnippet!)}
                            className="absolute top-0.5 right-0.5 text-[10px] text-primary hover:underline">Copy</button>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function PageFindingsViewer({ scanId, source, pages }: { scanId: string; source: string; pages: FindingPage[] }) {
  const [activePageId, setActivePageId] = useState(pages[0]?.id ?? "");
  const activePage = useMemo(() => pages.find((p) => p.id === activePageId) ?? pages[0], [activePageId, pages]);
  const [activeViolationId, setActiveViolationId] = useState(activePage?.violations[0]?.id ?? "");
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [expandedSections, setExpandedSections] = useState<Record<string, boolean>>({});
  const [colorMode, setColorMode] = useState<ColorBlindMode>("normal");
  const [showBoxes, setShowBoxes] = useState(true);
  const [colorEdits, setColorEdits] = useState<Record<string, ColorEdit>>({});
  const [previewState, setPreviewState] = useState<PreviewState>({ targetKey: null, path: null, isLoading: false, error: null });
  const [recommendations, setRecommendations] = useState<FixRecommendation[]>([]);
  const [recommendationsLoading, setRecommendationsLoading] = useState(false);

  const groupedViolations = useMemo(() => {
    if (viewMode !== "grouped") return null;
    const groups = new Map<string, FindingViolation[]>();
    for (const v of activePage?.violations ?? []) {
      const section = (v.section || "unknown") as PageSection;
      if (!groups.has(section)) groups.set(section, []);
      groups.get(section)!.push(v);
    }
    const order: PageSection[] = ["header", "navigation", "hero", "main-content", "sidebar", "form", "footer", "unknown"];
    return order.filter((s) => groups.has(s)).map((s) => ({
      section: s, label: SECTION_LABELS[s], violations: groups.get(s)!,
      maxSeverity: groups.get(s)!.reduce((max, v) =>
        v.impact === "serious" || max === "serious" ? "serious" : v.impact === "moderate" || max === "moderate" ? "moderate" : v.impact === "minor" || max === "minor" ? "minor" : max,
      "pass" as string),
    }));
  }, [viewMode, activePage?.violations]);

  const activeBoxRef = useRef<HTMLButtonElement | null>(null);
  const activeSidebarRef = useRef<HTMLButtonElement | null>(null);
  const detailsRef = useRef<HTMLDivElement | null>(null);
  const activeViolation = activePage?.violations.find((v) => v.id === activeViolationId) ?? activePage?.violations[0];
  const colorData = useMemo(() => parseColorData(activeViolation?.colorDataJson ?? null), [activeViolation?.colorDataJson]);
  const colorEdit = activeViolation ? colorEdits[activeViolation.id] : undefined;
  const foreground = colorEdit?.foreground ?? colorData?.foreground ?? "#000000";
  const background = colorEdit?.background ?? colorData?.background ?? "#FFFFFF";
  const screenshotPath = previewState.targetKey === activeViolation?.id && previewState.path ? previewState.path : activePage?.screenshotPath;

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      activeBoxRef.current?.scrollIntoView({ block: "center", inline: "center", behavior: "smooth" });
      activeSidebarRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
      detailsRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
    });
    return () => cancelAnimationFrame(frame);
  }, [activeViolationId]);

  useEffect(() => {
    if (source !== "url" || !activePage || !activeViolation || !colorData) return;
    const timeout = window.setTimeout(async () => {
      setPreviewState((c) => ({ ...c, targetKey: activeViolation.id, isLoading: true, error: null }));
      try {
        const res = await fetch(`/api/scans/${scanId}/preview`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ pageId: activePage.id, violationId: activeViolation.id, foreground, background }) });
        const data = (await res.json()) as { previewPath?: string; error?: string };
        if (!res.ok || !data.previewPath) { setPreviewState({ targetKey: activeViolation.id, path: null, isLoading: false, error: data.error ?? "Could not update preview." }); return; }
        setPreviewState({ targetKey: activeViolation.id, path: data.previewPath, isLoading: false, error: null });
      } catch { setPreviewState({ targetKey: activeViolation.id, path: null, isLoading: false, error: "Preview request failed." }); }
    }, 650);
    return () => window.clearTimeout(timeout);
  }, [activePage, activeViolation, background, colorData, foreground, scanId, source]);

  useEffect(() => {
    if (!activeViolation) { setRecommendations([]); return; }
    let cancelled = false;
    async function fetchRecs() {
      setRecommendationsLoading(true); setRecommendations([]);
      try {
        const res = await fetch(`/api/scans/${scanId}/recommendations`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ violationId: activeViolation!.id }) });
        const data = (await res.json()) as { recommendations?: FixRecommendation[]; error?: string };
        if (!cancelled) setRecommendations(data.recommendations ?? []);
      } catch { if (!cancelled) setRecommendations([]); }
      finally { if (!cancelled) setRecommendationsLoading(false); }
    }
    fetchRecs();
    return () => { cancelled = true; };
  }, [activeViolation?.id, scanId]);

  if (!activePage) {
    return <div className="rounded-md border border-border bg-surface-raised p-5 text-sm text-foreground-secondary">No pages were audited for this scan.</div>;
  }

  const hasViolations = activePage.violations.length > 0 && activePage.violationCount > 0;

  return (
    <section className="space-y-4 w-full">
      <ColorBlindFilters />

      {/* ── Page Tabs ── */}
      <div className="flex gap-2 overflow-x-auto rounded-lg border border-border bg-surface-raised p-2">
        {pages.map((page, index) => (
          <button key={page.id} type="button" onClick={() => { setActivePageId(page.id); setActiveViolationId(page.violations[0]?.id ?? ""); }}
            className={cn("min-w-56 rounded-md border px-3 py-2 text-left text-sm transition-all duration-200",
              page.id === activePage.id ? "border-primary bg-primary text-foreground-inverse shadow-sm" : "border-border bg-surface-raised text-foreground-secondary hover:bg-surface-hover")}>
            <span className="block text-xs font-medium uppercase opacity-70">Page {index + 1}</span>
            <span className="mt-1 block truncate font-medium">{page.title || page.url}</span>
            <span className="mt-1 block text-xs opacity-80">{page.statusCode ?? "unknown"} · {page.violationCount} issues</span>
          </button>
        ))}
      </div>

      {/* ── Main Card ── */}
      <div className="rounded-lg border border-border bg-surface-raised shadow-sm w-full">
        {/* Page Header */}
        <div className="flex flex-col gap-3 border-b border-border p-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1">
            <h2 className="break-all text-sm font-semibold text-foreground">{activePage.title || activePage.url}</h2>
            <p className="break-all text-xs text-foreground-secondary font-mono">{activePage.url}</p>
          </div>
          <div className="flex shrink-0 flex-wrap items-center gap-2 text-xs text-foreground-secondary">
            <span>{activePage.statusCode ?? "unknown"}</span>
            <span>{activePage.violationCount} issues</span>
          </div>
        </div>

        {/* ── THREE-COLUMN LAYOUT: Details Left | Screenshot Center | Issues Right ── */}
        <div className={cn("grid gap-0", hasViolations ? "lg:grid-cols-[20rem_1fr_18rem]" : "")}>
          {/* ═══ LEFT COLUMN: Detail Panel (Color Picker) ═══ */}
          {hasViolations ? (
            <div className="min-w-0 border-b border-border lg:border-b-0 lg:border-r overflow-y-auto max-h-[calc(100vh-24rem)] lg:max-h-[calc(100vh-20rem)]" ref={detailsRef}>
              <div className="p-3 space-y-3">
                {activeViolation ? (
                  <>
                    <ContrastEditor colorData={colorData} foreground={foreground} background={background}
                      onForegroundChange={(v) => { if (!activeViolation) return; setColorEdits((c) => ({ ...c, [activeViolation.id]: { foreground: v, background } })); }}
                      onBackgroundChange={(v) => { if (!activeViolation) return; setColorEdits((c) => ({ ...c, [activeViolation.id]: { foreground, background: v } })); }}
                      previewState={previewState} />

                    {/* User Impact */}
                    {(() => {
                      if (!activeViolation || !colorData) return null;
                      let hasBgImage = false;
                      try {
                        const heroJson = activeViolation.heroAnalysisJson;
                        if (heroJson) {
                          const ha = JSON.parse(heroJson) as HeroAnalysis;
                          hasBgImage = ha?.hasBackgroundImage === true;
                        }
                      } catch { /* ignore */ }
                      const userImpact = getUserImpact({
                        impact: activeViolation.impact,
                        help: activeViolation.help,
                        section: activeViolation.section,
                        isLargeText: colorData.isLargeText,
                        hasBackgroundImage: hasBgImage,
                      });
                      if (activeViolation.impact === "pass") return null;
                      return (
                        <div className="rounded-md border border-accent/30 bg-accent-muted/50 p-3 space-y-1.5">
                          <p className="text-xs font-semibold text-accent">User Impact</p>
                          <p className="text-xs font-medium text-foreground">{userImpact.heading}</p>
                          <p className="text-xs leading-5 text-foreground-secondary">{userImpact.body}</p>
                          <p className="text-[10px] text-foreground-muted">Affected: {userImpact.affectedGroup}</p>
                        </div>
                      );
                    })()}

                    {/* Hero Analysis */}
                    {(() => {
                      const heroJson = activeViolation?.heroAnalysisJson;
                      if (!heroJson) return null;
                      let heroAnalysis: HeroAnalysis | null = null;
                      try { heroAnalysis = JSON.parse(heroJson) as HeroAnalysis; } catch { return null; }
                      if (!heroAnalysis?.hasBackgroundImage || !heroAnalysis?.hasTextOverlay) return null;
                      return (
                        <div className="rounded-md border border-warning/30 bg-warning-muted p-3 space-y-2">
                          <p className="text-xs font-semibold text-warning">Hero/Banner Text Over Image</p>
                          <p className="text-xs text-warning/80">
                            Text over a background image. {heroAnalysis.textOverlayElements.length > 0 ? `Detected: "${heroAnalysis.textOverlayElements.slice(0, 2).join('", "')}"` : ""}
                          </p>
                          {heroAnalysis.overlaySuggestion ? (
                            <>
                              <p className="text-xs font-medium text-warning">Add a {heroAnalysis.overlaySuggestion.type} overlay ({Math.round(heroAnalysis.overlaySuggestion.minOpacity * 100)}%)</p>
                              <pre className="rounded bg-warning-muted/50 p-2 text-xs font-mono text-warning overflow-x-auto border border-warning/20">{heroAnalysis.overlaySuggestion.cssSnippet}</pre>
                              <button type="button" onClick={() => navigator.clipboard.writeText(heroAnalysis.overlaySuggestion!.cssSnippet)}
                                className="text-xs font-medium text-primary hover:underline">Copy CSS</button>
                            </>
                          ) : <p className="text-xs text-warning/80">Add a semi-transparent overlay or move text to a solid area.</p>}
                        </div>
                      );
                    })()}

                    {/* LLM Recommendations */}
                    {recommendationsLoading ? (
                      <div className="rounded-md border border-border p-3"><div className="animate-shimmer rounded h-12" /><p className="mt-1 text-xs text-foreground-muted text-center">Generating...</p></div>
                    ) : recommendations.length > 0 ? (
                      <div className="rounded-md border border-info/30 bg-info-muted p-3 space-y-2">
                        <p className="text-xs font-semibold text-info">Fix Recommendations</p>
                        {recommendations.map((rec, i) => (
                          <div key={i} className="rounded bg-surface-raised border border-info/20 p-2 space-y-1.5">
                            <div className="flex items-center gap-1.5">
                              <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-medium", rec.priority === "required" ? "bg-danger-muted text-danger" : "bg-surface-hover text-foreground-secondary")}>{rec.priority}</span>
                              <span className="text-[10px] text-foreground-muted capitalize">{rec.type.replace(/-/g, " ")}</span>
                            </div>
                            <p className="text-xs text-foreground">{rec.description}</p>
                            {rec.cssSnippet && (
                              <div className="relative">
                                <pre className="rounded bg-surface-hover p-1.5 text-[10px] font-mono text-foreground-secondary overflow-x-auto">{rec.cssSnippet}</pre>
                                <button type="button" onClick={() => navigator.clipboard.writeText(rec.cssSnippet!)}
                                  className="absolute top-0.5 right-0.5 text-[10px] text-primary hover:underline">Copy</button>
                              </div>
                            )}
                            {rec.newForeground && rec.newBackground && (
                              <div className="flex items-center gap-1.5 text-[10px] text-foreground-secondary">
                                <span className="inline-block h-3 w-3 rounded border border-border" style={{ backgroundColor: rec.newForeground }} />{rec.newForeground}
                                <span>on</span>
                                <span className="inline-block h-3 w-3 rounded border border-border" style={{ backgroundColor: rec.newBackground }} />{rec.newBackground}
                                {rec.expectedContrastRatio && <span className="ml-1">({rec.expectedContrastRatio}:1)</span>}
                              </div>
                            )}
                          </div>
                        ))}
                        <p className="text-[10px] text-info">{process.env.NEXT_PUBLIC_NVIDIA_API_KEY ? "AI-generated" : "Template-based"} — verify above.</p>
                      </div>
                    ) : null}

                    {/* Violation Metadata */}
                    <div className="space-y-2">
                      <div className="flex flex-wrap items-center gap-1.5">
                        <SeverityBadge impact={activeViolation.impact} />
                        <h3 className="text-sm font-semibold text-foreground">{activeViolation.help}</h3>
                      </div>
                      <p className="text-xs leading-5 text-foreground-secondary">{activeViolation.description}</p>
                      <Button asChild variant="ghost" size="sm" className="h-7 text-xs">
                        <a href={activeViolation.helpUrl} target="_blank" rel="noreferrer">
                          <ExternalLink className="h-3 w-3" /> WCAG Help
                        </a>
                      </Button>
                      <dl className="grid gap-2 text-xs">
                        <div><dt className="font-medium text-foreground-secondary">Target</dt>
                          <dd className="mt-0.5 break-all rounded bg-surface-hover p-2 font-mono text-foreground-secondary">{parseTargets(activeViolation.targetJson)}</dd></div>
                        <div><dt className="font-medium text-foreground-secondary">Element</dt>
                          <dd className="mt-0.5 break-all rounded bg-surface-hover p-2 font-mono text-foreground-secondary">{activeViolation.html}</dd></div>
                        {activeViolation.failureSummary && (
                          <div><dt className="font-medium text-foreground-secondary">Failure Summary</dt>
                            <dd className="mt-0.5 whitespace-pre-wrap rounded bg-surface-hover p-2 leading-5 text-foreground-secondary">{activeViolation.failureSummary}</dd></div>
                        )}
                      </dl>
                    </div>
                  </>
                ) : (
                  <div className="flex flex-col items-center justify-center gap-2 py-8 text-xs text-foreground-muted">
                    <LocateFixed className="h-4 w-4 opacity-40" />
                    <p>Select a finding to view details</p>
                  </div>
                )}
              </div>
            </div>
          ) : null}

          {/* ═══ CENTER COLUMN: Screenshot ═══ */}
          <div className="min-w-0 border-b border-border lg:border-b-0">
            {screenshotPath ? (
              <div>
                <div className="flex flex-col gap-2 border-b border-border bg-surface-raised px-3 py-2 xl:flex-row xl:items-center xl:justify-between">
                  <p className="text-xs font-medium text-foreground-secondary">Screenshot Locator</p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(["normal", "protanopia", "deuteranopia", "tritanopia", "grayscale"] as ColorBlindMode[]).map((mode) => (
                      <button key={mode} type="button" onClick={() => setColorMode(mode)}
                        className={cn("h-8 rounded-full border px-2.5 text-xs font-medium transition-all duration-200",
                          colorMode === mode ? "border-primary bg-primary text-foreground-inverse shadow-sm" : "border-border bg-surface-raised text-foreground-secondary hover:bg-surface-hover")}>
                        {mode.charAt(0).toUpperCase() + mode.slice(1)}
                      </button>
                    ))}
                    <button type="button" onClick={() => setShowBoxes((prev) => !prev)}
                      className={cn("h-8 rounded-full border px-2.5 text-xs font-medium transition-all duration-200 inline-flex items-center gap-1.5",
                        showBoxes ? "border-primary bg-primary text-foreground-inverse shadow-sm" : "border-border bg-surface-raised text-foreground-secondary hover:bg-surface-hover")}>
                      {showBoxes ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                      {showBoxes ? "Hide boxes" : "Show boxes"}
                    </button>
                    <a href={screenshotPath} target="_blank" rel="noreferrer" className="text-xs font-medium text-primary hover:underline ml-1">Open full</a>
                  </div>
                </div>
                <div className="max-h-[calc(100vh-24rem)] lg:max-h-[calc(100vh-20rem)] overflow-auto bg-surface-hover">
                  <div className="relative inline-block max-w-none">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={screenshotPath} alt={`Screenshot of ${activePage.url}`} className="block max-w-none"
                      style={{ filter: COLOR_BLIND_FILTERS[colorMode] }} />
                    {showBoxes && activePage.violations.map((violation, index) => {
                      const box = parseBox(violation.boundingBoxJson);
                      if (!box) return null;
                      const isActive = violation.id === activeViolation?.id;
                      return (
                        <button key={violation.id} ref={isActive ? activeBoxRef : undefined} type="button"
                          onClick={() => setActiveViolationId(violation.id)} style={boxStyle(box)}
                          className={cn("absolute rounded-sm border-2 transition-colors duration-200",
                            isActive ? "z-20 border-danger bg-danger/20 ring-4 ring-danger/30" : "z-10 border-warning bg-warning/10 hover:border-danger")}
                          aria-label={`Show finding ${index + 1}`}>
                          <span className={cn("absolute -left-1 -top-7 rounded-md px-2 py-1 text-xs font-semibold text-white shadow-sm",
                            isActive ? "bg-danger" : "bg-warning")}>{index + 1}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-center p-12 text-sm text-foreground-muted">No screenshot available.</div>
            )}
          </div>

          {/* ═══ RIGHT COLUMN: Issues List ═══ */}
          {hasViolations ? (
            <div className="min-w-0 border-t border-border lg:border-t-0 lg:border-l">
              <div className="border-b border-border p-3">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-foreground">Findings</p>
                  <div className="flex rounded-md border border-border bg-surface-hover p-0.5">
                    <button type="button" onClick={() => setViewMode("flat")}
                      className={cn("rounded px-1.5 py-0.5 text-xs transition-all duration-200",
                        viewMode === "flat" ? "bg-surface-raised text-foreground shadow-sm" : "text-foreground-muted hover:text-foreground-secondary")}
                      aria-label="Flat list view"><List className="h-3 w-3" /></button>
                    <button type="button" onClick={() => setViewMode("grouped")}
                      className={cn("rounded px-1.5 py-0.5 text-xs transition-all duration-200",
                        viewMode === "grouped" ? "bg-surface-raised text-foreground shadow-sm" : "text-foreground-muted hover:text-foreground-secondary")}
                      aria-label="Grouped by section"><Layers className="h-3 w-3" /></button>
                  </div>
                </div>
              </div>
              <div className="max-h-[calc(100vh-24rem)] lg:max-h-[calc(100vh-20rem)] overflow-y-auto">
                {viewMode === "grouped" && groupedViolations ? (
                  groupedViolations.map((group) => {
                    const expanded = expandedSections[group.section] !== false;
                    return (
                      <div key={group.section}>
                        <button type="button" onClick={() => setExpandedSections((p) => ({ ...p, [group.section]: !(p[group.section] !== false) }))}
                          className="flex w-full items-center gap-1.5 border-b border-border bg-surface-hover px-3 py-2 text-left text-xs font-medium text-foreground-secondary transition-colors hover:bg-surface-hover/80">
                          <ChevronDown className={cn("h-3.5 w-3.5 text-foreground-muted transition-transform duration-200", expanded ? "rotate-0" : "-rotate-90")} />
                          <span className="flex-1">{group.label}</span>
                          <SeverityBadge impact={group.maxSeverity} />
                          <span className="text-foreground-muted">{group.violations.length}</span>
                        </button>
                        {expanded && group.violations.map((violation, index) => {
                          const hasBox = Boolean(parseBox(violation.boundingBoxJson));
                          const isActive = violation.id === activeViolation?.id;
                          const flatIndex = activePage?.violations.indexOf(violation) ?? index;
                          return (
                            <button key={violation.id} type="button" ref={isActive ? activeSidebarRef : undefined}
                              onClick={() => setActiveViolationId(violation.id)}
                              className={cn("flex w-full gap-2 border-b border-border pl-7 pr-3 py-2.5 text-left transition-all duration-200 border-l-2",
                                isActive ? "border-l-primary bg-primary-muted/50" : "border-l-transparent hover:bg-surface-hover")}>
                              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded bg-primary text-[10px] font-semibold text-foreground-inverse">{flatIndex + 1}</span>
                              <span className="min-w-0 flex-1 space-y-1">
                                <span className="flex flex-wrap items-center gap-1">
                                  <SeverityBadge impact={violation.impact} />
                                  {hasBox && <span className="inline-flex items-center gap-0.5 text-[10px] text-foreground-muted"><LocateFixed className="h-2.5 w-2.5" />located</span>}
                                </span>
                                <span className="line-clamp-2 block text-[11px] font-medium text-foreground">{violation.help}</span>
                              </span>
                            </button>
                          );
                        })}
                      </div>
                    );
                  })
                ) : (
                  activePage.violations.map((violation, index) => {
                    const hasBox = Boolean(parseBox(violation.boundingBoxJson));
                    const isActive = violation.id === activeViolation?.id;
                    return (
                      <button key={violation.id} type="button" ref={isActive ? activeSidebarRef : undefined}
                        onClick={() => setActiveViolationId(violation.id)}
                        className={cn("flex w-full gap-2.5 border-b border-border p-3 text-left transition-all duration-200 border-l-2",
                          isActive ? "border-l-primary bg-primary-muted/50" : "border-l-transparent hover:bg-surface-hover")}>
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded bg-primary text-[11px] font-semibold text-foreground-inverse">{index + 1}</span>
                        <span className="min-w-0 flex-1 space-y-1.5">
                          <span className="flex flex-wrap items-center gap-1">
                            <SeverityBadge impact={violation.impact} />
                            {hasBox && <span className="inline-flex items-center gap-0.5 text-[10px] text-foreground-muted"><LocateFixed className="h-3 w-3" />located</span>}
                          </span>
                          <span className="line-clamp-2 block text-xs font-medium text-foreground">{violation.help}</span>
                          <span className="block truncate font-mono text-[10px] text-foreground-muted">{parseTargets(violation.targetJson)}</span>
                        </span>
                      </button>
                    );
                  })
                )}
              </div>
            </div>
          ) : null}
        </div>

        {/* ── No-violations / All-passed Messages ── */}
        {!hasViolations && activePage.violations.length === 0 && (
          <div className="p-5">
            <div className="rounded-md border border-border bg-surface-hover p-4 text-sm text-foreground-secondary text-center">
              No axe-core color contrast violations found on this page.
            </div>
          </div>
        )}

        {/* ── Image Text Analysis (Vision Model) ── */}
        <ImageAnalysisPanel imageAnalyses={activePage.imageAnalyses ?? []} />
      </div>
    </section>
  );
}
