// Page section classification — types and constants safe for client/server.
// (Client components import SECTION_LABELS and PageSection type.)

export type PageSection =
  | "header"
  | "navigation"
  | "hero"
  | "main-content"
  | "sidebar"
  | "footer"
  | "form"
  | "unknown";

export const SECTION_LABELS: Record<PageSection, string> = {
  header: "Header",
  navigation: "Navigation",
  hero: "Hero / Banner",
  "main-content": "Main Content",
  sidebar: "Sidebar",
  footer: "Footer",
  form: "Form",
  unknown: "Other",
};

/**
 * Classification function that runs inside the browser context (page.evaluate).
 * For a given CSS selector (from an axe violation target), walks up the ancestor
 * chain and returns the semantic section the element belongs to.
 *
 * Detection priority:
 * 1. Explicit ARIA roles (role="banner", role="navigation", etc.)
 * 2. HTML5 semantic elements (<header>, <nav>, <main>, etc.)
 * 3. CSS/layout heuristics (large viewport-height container with background-image → "hero",
 *    element in bottom 15% → "footer")
 */
export function classifyElementSection(selectors: string[]): PageSection {
  // Find the matching element using axe's selector stack (most specific first)
  let element: Element | null = null;
  for (const selector of selectors) {
    try {
      const el = document.querySelector(selector);
      if (el) {
        element = el;
        break;
      }
    } catch {
      continue;
    }
  }

  if (!element) {
    return "unknown";
  }

  // Walk up ancestor chain (up to 10 levels) checking for section landmarks
  const MAX_LEVELS = 10;
  let current: Element | null = element;

  for (let level = 0; level < MAX_LEVELS && current; level++) {
    const tag = current.tagName?.toLowerCase();
    const role = current.getAttribute("role")?.toLowerCase();

    // Priority 1: ARIA roles
    if (role === "banner") return "header";
    if (role === "navigation") return "navigation";
    if (role === "main") return "main-content";
    if (role === "contentinfo") return "footer";
    if (role === "complementary") return "sidebar";
    if (role === "form") return "form";

    // Priority 2: HTML5 semantic elements
    if (tag === "header") return "header";
    if (tag === "nav") return "navigation";
    if (tag === "main" || tag === "article") return "main-content";
    if (tag === "footer") return "footer";
    if (tag === "aside") return "sidebar";
    if (tag === "form") return "form";

    current = current.parentElement;
  }

  // Priority 3: CSS/layout heuristics (check the original element, not ancestors)
  try {
    const htmlElement = element as HTMLElement;
    const rect = htmlElement.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const pageHeight = document.body.scrollHeight;
    const styles = window.getComputedStyle(htmlElement);

    // Hero detection: large container covering most of viewport height,
    // near the top of the page, with a background-image
    if (
      rect.height >= viewportHeight * 0.4 &&
      rect.top < viewportHeight * 0.5 &&
      rect.width >= window.innerWidth * 0.6 &&
      styles.backgroundImage &&
      styles.backgroundImage !== "none"
    ) {
      return "hero";
    }

    // Footer heuristic: element in the bottom 15% of the page
    if (rect.top >= pageHeight * 0.85) {
      return "footer";
    }

    // Hero heuristic without background-image: large, viewport-tall, top of page
    if (
      rect.height >= viewportHeight * 0.5 &&
      rect.top < 100
    ) {
      return "hero";
    }
  } catch {
    // Heuristic failed, fall through to unknown
  }

  return "unknown";
}

/**
 * Generates the browser-evaluate script that classifies all violation
 * selectors in a single batched call.
 */
export function buildSectionClassificationScript(
  violationTargets: string[][],
): string {
  // We need to inline classifyElementSection into the page context.
  // Using a stringified IIFE that defines the function and maps over targets.
  const fnBody = classifyElementSection.toString();

  return `
    (function() {
      const classify = ${fnBody};
      return (${JSON.stringify(violationTargets)}).map(function(targets) {
        return classify(targets);
      });
    })()
  `;
}
