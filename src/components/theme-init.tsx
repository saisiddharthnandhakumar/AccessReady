"use client";

import { useEffect } from "react";

/**
 * Applies the saved or system theme after hydration.
 *
 * We intentionally do NOT use a blocking inline <script> to avoid React 19
 * hydration issues that can cause client components (like ScanForm) to
 * remount and lose their state.  This means there may be a brief flash if
 * the saved preference differs from the system default — a worthwhile
 * tradeoff for a working scan form.
 */
export function ThemeInit() {
  useEffect(() => {
    try {
      const stored = localStorage.getItem("accessready-theme");
      const theme =
        stored ??
        (window.matchMedia("(prefers-color-scheme: dark)").matches
          ? "dark"
          : "light");
      if (theme === "dark") {
        document.documentElement.classList.add("dark");
      }
    } catch {
      // localStorage unavailable — nothing to do
    }
  }, []);

  return null;
}
