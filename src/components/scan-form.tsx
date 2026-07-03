"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { ChevronDown, Link2, Loader2, Plus, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import {
  PRODUCT_TYPE_GROUPS,
  TARGET_MARKETS,
  INDUSTRIES,
} from "@/lib/scan-metadata";

type FieldErrors = Partial<Record<
  "productType" | "productTypeOther" | "targetMarket" | "targetMarketOther" | "industry" | "industryOther",
  string
>>;

export function ScanForm() {
  const router = useRouter();
  const [url, setUrl] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);

  const [productType, setProductType] = useState("");
  const [productTypeOther, setProductTypeOther] = useState("");
  const [targetMarket, setTargetMarket] = useState("");
  const [targetMarketOther, setTargetMarketOther] = useState("");
  const [industry, setIndustry] = useState("");
  const [industryOther, setIndustryOther] = useState("");
  const [notes, setNotes] = useState("");
  const [showNotes, setShowNotes] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const productTypeOtherRef = useRef<HTMLInputElement>(null);
  const targetMarketOtherRef = useRef<HTMLInputElement>(null);
  const industryOtherRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (productType === "Other") requestAnimationFrame(() => productTypeOtherRef.current?.focus());
  }, [productType]);
  useEffect(() => {
    if (targetMarket === "Other") requestAnimationFrame(() => targetMarketOtherRef.current?.focus());
  }, [targetMarket]);
  useEffect(() => {
    if (industry === "Other") requestAnimationFrame(() => industryOtherRef.current?.focus());
  }, [industry]);

  function validate(): boolean {
    const errors: FieldErrors = {};
    if (!productType) errors.productType = "Select a product type.";
    if (productType === "Other" && !productTypeOther.trim()) errors.productTypeOther = "Describe the product type.";
    if (!targetMarket) errors.targetMarket = "Select a target market.";
    if (targetMarket === "Other" && !targetMarketOther.trim()) errors.targetMarketOther = "Describe the target market.";
    if (!industry) errors.industry = "Select an industry.";
    if (industry === "Other" && !industryOther.trim()) errors.industryOther = "Describe the industry.";
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      document.getElementById(Object.keys(errors)[0])?.focus();
      return false;
    }
    return true;
  }

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setFieldErrors({});
    if (!validate()) return;
    setIsScanning(true);

    try {
      const effectiveProductType = productType === "Other" ? productTypeOther.trim() : productType;
      const effectiveTargetMarket = targetMarket === "Other" ? targetMarketOther.trim() : targetMarket;
      const effectiveIndustry = industry === "Other" ? industryOther.trim() : industry;

      const response = await fetch("/api/scans", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          url, productType: effectiveProductType,
          productTypeOther: productType === "Other" ? productTypeOther.trim() : undefined,
          targetMarket: effectiveTargetMarket,
          targetMarketOther: targetMarket === "Other" ? targetMarketOther.trim() : undefined,
          industry: effectiveIndustry,
          industryOther: industry === "Other" ? industryOther.trim() : undefined,
          notes: notes.trim() || undefined,
        }),
      });

      const data = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !data.id) { setError(data.error ?? "The scan could not be started."); return; }
      router.push(`/scans/${data.id}`);
      router.refresh();
    } catch (err) {
      // Distinguish network failures (ngrok timeouts, connection drops) from
      // other errors so the user gets actionable guidance.
      if (err instanceof TypeError && err.message === "Failed to fetch") {
        setError(
          "The scan request could not reach the server. If you are using ngrok, " +
            "make sure the tunnel is running and refresh the page. You may also " +
            "need to click through the ngrok interstitial warning page first.",
        );
      } else if (err instanceof DOMException && err.name === "AbortError") {
        setError("The scan request timed out. Try again — the second attempt is usually faster.");
      } else {
        setError("The scan request failed. Check the input and try again.");
      }
    } finally {
      setIsScanning(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {/* ── URL Input ── */}
      <div className="flex flex-col gap-3 sm:flex-row">
        <label className="sr-only" htmlFor="url">Website URL</label>
        <Input id="url" inputMode="url" placeholder="https://example.com" value={url}
          onChange={(e) => setUrl(e.target.value)} disabled={isScanning} className="h-11" />
        <Button type="submit" disabled={isScanning} className="h-11 sm:w-36">
          {isScanning ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : <Search className="h-4 w-4" aria-hidden="true" />}
          {isScanning ? "Scanning…" : "Scan"}
        </Button>
      </div>

      {/* ── Metadata Fields ── */}
      <div className="border-t border-border pt-4">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {/* Product Type */}
          <div className="space-y-1.5">
            <label htmlFor="productType" className="text-sm font-medium text-foreground">Product Type <span className="text-danger" aria-hidden="true">*</span></label>
            <Select id="productType" value={productType} onChange={(e) => { setProductType(e.target.value); if (fieldErrors.productType) setFieldErrors((prev) => { const n = { ...prev }; delete n.productType; return n; }); }}
              disabled={isScanning} required aria-invalid={fieldErrors.productType ? "true" : undefined}
              aria-describedby={fieldErrors.productType ? "productType-error" : undefined}
              className={cn(fieldErrors.productType && "border-danger focus:border-danger focus:ring-danger/25")}>
              <option value="" disabled>Select product type…</option>
              {PRODUCT_TYPE_GROUPS.map((group) => (
                <optgroup key={group.label} label={group.label}>
                  {group.values.map((value) => <option key={value} value={value}>{value}</option>)}
                </optgroup>
              ))}
              <option value="Other">Other</option>
            </Select>
            {fieldErrors.productType && <p className="mt-1 text-xs text-danger" id="productType-error" role="alert">{fieldErrors.productType}</p>}
            {productType === "Other" && (
              <Input ref={productTypeOtherRef} id="productTypeOther" placeholder="Describe product type…" value={productTypeOther}
                onChange={(e) => { setProductTypeOther(e.target.value); if (fieldErrors.productTypeOther) setFieldErrors((prev) => { const n = { ...prev }; delete n.productTypeOther; return n; }); }}
                disabled={isScanning} required aria-label="Custom product type"
                aria-invalid={fieldErrors.productTypeOther ? "true" : undefined}
                aria-describedby={fieldErrors.productTypeOther ? "productTypeOther-error" : undefined}
                className={cn("mt-2", fieldErrors.productTypeOther && "border-danger focus:border-danger focus:ring-danger/25")} />
            )}
            {fieldErrors.productTypeOther && <p className="mt-1 text-xs text-danger" id="productTypeOther-error" role="alert">{fieldErrors.productTypeOther}</p>}
          </div>

          {/* Target Market */}
          <div className="space-y-1.5">
            <label htmlFor="targetMarket" className="text-sm font-medium text-foreground">Target Market <span className="text-danger" aria-hidden="true">*</span></label>
            <Select id="targetMarket" value={targetMarket} onChange={(e) => { setTargetMarket(e.target.value); if (fieldErrors.targetMarket) setFieldErrors((prev) => { const n = { ...prev }; delete n.targetMarket; return n; }); }}
              disabled={isScanning} required aria-invalid={fieldErrors.targetMarket ? "true" : undefined}
              aria-describedby={fieldErrors.targetMarket ? "targetMarket-error" : undefined}
              className={cn(fieldErrors.targetMarket && "border-danger focus:border-danger focus:ring-danger/25")}>
              <option value="" disabled>Select target market…</option>
              {TARGET_MARKETS.map((market) => <option key={market} value={market}>{market}</option>)}
              <option value="Other">Other</option>
            </Select>
            {fieldErrors.targetMarket && <p className="mt-1 text-xs text-danger" id="targetMarket-error" role="alert">{fieldErrors.targetMarket}</p>}
            {targetMarket === "Other" && (
              <Input ref={targetMarketOtherRef} id="targetMarketOther" placeholder="Describe target market…" value={targetMarketOther}
                onChange={(e) => { setTargetMarketOther(e.target.value); if (fieldErrors.targetMarketOther) setFieldErrors((prev) => { const n = { ...prev }; delete n.targetMarketOther; return n; }); }}
                disabled={isScanning} required aria-label="Custom target market"
                aria-invalid={fieldErrors.targetMarketOther ? "true" : undefined}
                aria-describedby={fieldErrors.targetMarketOther ? "targetMarketOther-error" : undefined}
                className={cn("mt-2", fieldErrors.targetMarketOther && "border-danger focus:border-danger focus:ring-danger/25")} />
            )}
            {fieldErrors.targetMarketOther && <p className="mt-1 text-xs text-danger" id="targetMarketOther-error" role="alert">{fieldErrors.targetMarketOther}</p>}
          </div>

          {/* Industry */}
          <div className="space-y-1.5">
            <label htmlFor="industry" className="text-sm font-medium text-foreground">Industry <span className="text-danger" aria-hidden="true">*</span></label>
            <Select id="industry" value={industry} onChange={(e) => { setIndustry(e.target.value); if (fieldErrors.industry) setFieldErrors((prev) => { const n = { ...prev }; delete n.industry; return n; }); }}
              disabled={isScanning} required aria-invalid={fieldErrors.industry ? "true" : undefined}
              aria-describedby={fieldErrors.industry ? "industry-error" : undefined}
              className={cn(fieldErrors.industry && "border-danger focus:border-danger focus:ring-danger/25")}>
              <option value="" disabled>Select industry…</option>
              {INDUSTRIES.map((value) => <option key={value} value={value}>{value}</option>)}
            </Select>
            {fieldErrors.industry && <p className="mt-1 text-xs text-danger" id="industry-error" role="alert">{fieldErrors.industry}</p>}
            {industry === "Other" && (
              <Input ref={industryOtherRef} id="industryOther" placeholder="Describe industry…" value={industryOther}
                onChange={(e) => { setIndustryOther(e.target.value); if (fieldErrors.industryOther) setFieldErrors((prev) => { const n = { ...prev }; delete n.industryOther; return n; }); }}
                disabled={isScanning} required aria-label="Custom industry"
                aria-invalid={fieldErrors.industryOther ? "true" : undefined}
                aria-describedby={fieldErrors.industryOther ? "industryOther-error" : undefined}
                className={cn("mt-2", fieldErrors.industryOther && "border-danger focus:border-danger focus:ring-danger/25")} />
            )}
            {fieldErrors.industryOther && <p className="mt-1 text-xs text-danger" id="industryOther-error" role="alert">{fieldErrors.industryOther}</p>}
          </div>
        </div>

        {/* Notes */}
        <div className="mt-3">
          <button type="button" onClick={() => setShowNotes((prev) => !prev)}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-foreground-muted transition-colors hover:text-foreground"
            aria-expanded={showNotes}>
            {showNotes ? <ChevronDown className="h-4 w-4 transition-transform duration-200" aria-hidden="true" /> : <Plus className="h-4 w-4" aria-hidden="true" />}
            {showNotes ? "Hide notes" : "Add notes (optional)"}
          </button>
          {showNotes && (
            <div className="mt-2 space-y-1.5">
              <label htmlFor="scan-notes" className="text-sm font-medium text-foreground">Notes</label>
              <Textarea id="scan-notes" rows={3} placeholder='e.g. "This is the latest release screen", "The issue was reported by a colorblind user"'
                value={notes} onChange={(e) => setNotes(e.target.value)} disabled={isScanning} />
            </div>
          )}
        </div>
      </div>

      {/* Status Messages */}
      {error ? <p className="text-sm text-danger" role="alert">{error}</p> : null}
      {isScanning ? (
        <div className="flex items-center gap-2 text-sm text-foreground-secondary">
          <span className="flex gap-1">
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "0ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "150ms" }} />
            <span className="h-1.5 w-1.5 rounded-full bg-primary animate-bounce" style={{ animationDelay: "300ms" }} />
          </span>
          <span>Auditing the provided page and checking WCAG AA contrast.</span>
        </div>
      ) : null}
    </form>
  );
}
