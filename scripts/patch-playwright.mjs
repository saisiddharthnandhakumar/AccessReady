// Vercel's Node File Trace (nft) doesn't detect playwright-core's
// browsers.json because it's loaded via fs.readFileSync, not require().
// This script creates a minimal stub so the file survives pruning.
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);

try {
  const corePath = require.resolve("playwright-core/package.json");
  const coreDir = dirname(corePath);
  const browsersPath = join(coreDir, "browsers.json");

  if (!existsSync(browsersPath)) {
    // Minimal valid browsers.json — lists no browser executables.
    // We only use chromium.connect() via Browserless, so the
    // browser registry is never actually queried.
    writeFileSync(
      browsersPath,
      JSON.stringify({ browsers: [] }, null, 2),
      "utf8",
    );
    console.log("[patch-playwright] Created browsers.json stub at", browsersPath);
  } else {
    console.log("[patch-playwright] browsers.json already exists, skipping.");
  }
} catch (err) {
  // playwright-core not installed yet (e.g. clean install in progress)
  console.warn("[patch-playwright] playwright-core not found, skipping patch.");
}
