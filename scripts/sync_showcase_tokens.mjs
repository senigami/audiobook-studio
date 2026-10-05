#!/usr/bin/env node
/**
 * sync_showcase_tokens.mjs
 *
 * Reads frontend/src/theme/tokens.css, extracts the :root block and the
 * [data-theme="dark"] block verbatim, then replaces the marked region in
 * docs/v1.html.
 *
 * Markers:
 *   /* BEGIN GENERATED TOKENS (scripts/sync_showcase_tokens.mjs) * /
 *   /* END GENERATED TOKENS * /
 *
 * After replacement, reports any var(--name) references in v1.html that are
 * not defined in the generated blocks, and injects a --legacy-* fallback
 * section for them.
 *
 * Usage:
 *   node scripts/sync_showcase_tokens.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { resolve, dirname } from "path";
import { fileURLToPath } from "url";

const __dir = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dir, "..");

const TOKENS_CSS = resolve(REPO_ROOT, "frontend/src/theme/tokens.css");
const V1_HTML = resolve(REPO_ROOT, "docs/v1.html");

const BEGIN_MARKER = "/* BEGIN GENERATED TOKENS (scripts/sync_showcase_tokens.mjs) */";
const END_MARKER = "/* END GENERATED TOKENS */";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Extract the text of the first CSS block that starts with `selector {` */
function extractBlock(css, selector) {
  // Find selector line
  const selectorPattern = new RegExp(
    "^" + escapeRegex(selector) + "\\s*\\{",
    "m"
  );
  const match = selectorPattern.exec(css);
  if (!match) return null;

  let depth = 0;
  let start = match.index;
  let i = start;
  while (i < css.length) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) {
        return css.slice(start, i + 1);
      }
    }
    i++;
  }
  return null;
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Collect all --name tokens defined inside a CSS block string */
function collectDefinedTokens(block) {
  const defined = new Set();
  const re = /--([a-zA-Z0-9_-]+)\s*:/g;
  let m;
  while ((m = re.exec(block)) !== null) {
    defined.add("--" + m[1]);
  }
  return defined;
}

/** Collect all var(--name) references inside a file string */
function collectUsedVars(content) {
  const used = new Set();
  const re = /var\((--[a-zA-Z0-9_-]+)\)/g;
  let m;
  while ((m = re.exec(content)) !== null) {
    used.add(m[1]);
  }
  return used;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

// 1. Read source files
let tokensCss;
try {
  tokensCss = readFileSync(TOKENS_CSS, "utf8");
} catch {
  console.error(`ERROR: Cannot read tokens source: ${TOKENS_CSS}`);
  process.exit(1);
}

let htmlContent;
try {
  htmlContent = readFileSync(V1_HTML, "utf8");
} catch {
  console.error(`ERROR: Cannot read showcase file: ${V1_HTML}`);
  process.exit(1);
}

// 2. Extract blocks from tokens.css
const rootBlock = extractBlock(tokensCss, ":root");
if (!rootBlock) {
  console.error("ERROR: Could not find :root block in tokens.css");
  process.exit(1);
}

const darkBlock = extractBlock(tokensCss, '[data-theme="dark"]');
if (!darkBlock) {
  console.error('ERROR: Could not find [data-theme="dark"] block in tokens.css');
  process.exit(1);
}

// 3. Determine which vars v1.html uses that are NOT in the generated blocks
//    We must do this BEFORE we replace, using the current html minus the old block.
//    Actually: collect all used vars from html (except the generated region itself),
//    then check against defined tokens.
const combinedBlocks = rootBlock + "\n\n" + darkBlock;
const definedTokens = collectDefinedTokens(combinedBlocks);

// Strip the old marker region (if present) before scanning used vars, so we
// don't accidentally count legacy vars defined there as "used in page content".
const htmlWithoutMarkers = htmlContent.replace(
  new RegExp(escapeRegex(BEGIN_MARKER) + "[\\s\\S]*?" + escapeRegex(END_MARKER), "g"),
  ""
);
const usedVars = collectUsedVars(htmlWithoutMarkers);

// Legacy = used in page content but not defined in the fresh token blocks
const legacyVars = [...usedVars].filter((v) => !definedTokens.has(v)).sort();

// Build legacy fallback map (closest current token values)
const LEGACY_FALLBACKS = {
  "--info-tint": "#f0f7ff",     // was --as-info-tint in tokens.css
  // add more entries here if new ones appear in future
};

let legacySection = "";
if (legacyVars.length > 0) {
  const lines = legacyVars.map((name) => {
    const fallback = LEGACY_FALLBACKS[name];
    if (!fallback) {
      console.warn(
        `WARNING: Legacy var ${name} used in v1.html has no known fallback mapping — using currentColor as placeholder`
      );
      return `  ${name.replace("--", "--legacy-")}: currentColor; /* FIXME: map to closest token */`;
    }
    return `  /* ${name} → closest current token */ --legacy${name.slice(2)}: ${fallback};\n  ${name}: var(--legacy${name.slice(2)});`;
  });

  legacySection = `\n\n/* ------------------------------------------------------------------\n   Legacy token aliases — vars used by v1.html that were renamed or\n   removed from tokens.css. Each maps to the closest current value.\n   Do NOT hand-edit — regenerate via: node scripts/sync_showcase_tokens.mjs\n   ------------------------------------------------------------------ */\n:root {\n${lines.join("\n")}\n}`;
}

// 4. Build the replacement region
const generatedBlock =
  BEGIN_MARKER +
  "\n" +
  rootBlock +
  "\n\n" +
  darkBlock +
  legacySection +
  "\n" +
  END_MARKER;

// 5. Determine if markers exist; if so replace, if not insert after :root block
let newHtml;

const markerRe = new RegExp(
  escapeRegex(BEGIN_MARKER) + "[\\s\\S]*?" + escapeRegex(END_MARKER)
);

if (markerRe.test(htmlContent)) {
  // Idempotent: replace marked region
  newHtml = htmlContent.replace(markerRe, generatedBlock);
} else {
  // First run: find the existing :root block in the <style> tag and replace it
  // The old :root block starts at line 18 in v1.html
  const oldRootRe = /(:root\s*\{[^}]*\})/;
  const oldRootMatch = oldRootRe.exec(htmlContent);
  if (!oldRootMatch) {
    console.error("ERROR: Could not locate :root block in v1.html to replace (no markers found either)");
    process.exit(1);
  }
  newHtml = htmlContent.replace(oldRootRe, generatedBlock);
}

// 6. Write output
writeFileSync(V1_HTML, newHtml, "utf8");

// 7. Verify: balanced braces in the style block
const styleMatch = /<style>([\s\S]*?)<\/style>/.exec(newHtml);
if (styleMatch) {
  const styleText = styleMatch[1];
  let depth = 0;
  for (const ch of styleText) {
    if (ch === "{") depth++;
    else if (ch === "}") depth--;
    if (depth < 0) {
      console.error("ERROR: Unbalanced braces detected in <style> block after replacement!");
      process.exit(1);
    }
  }
  if (depth !== 0) {
    console.error(`ERROR: Unbalanced braces in <style> block (depth=${depth} at end)`);
    process.exit(1);
  }
}

// 8. Report
console.log("sync_showcase_tokens: done");
console.log(`  Tokens source: ${TOKENS_CSS}`);
console.log(`  Showcase file: ${V1_HTML}`);
console.log(`  Defined tokens injected: ${definedTokens.size}`);
console.log(`  Vars used by v1.html: ${usedVars.size}`);

if (legacyVars.length > 0) {
  console.log(`\n  Legacy fallback aliases added (${legacyVars.length}):`);
  legacyVars.forEach((v) => {
    const fb = LEGACY_FALLBACKS[v] || "(no mapping — FIXME)";
    console.log(`    ${v}  →  ${fb}`);
  });
} else {
  console.log("  No legacy fallbacks needed — all used vars are defined in tokens.css");
}

console.log("\n  Note: screenshots in plan doc 14 step 7 remain unchecked (manual verification required).");
console.log("  Brace balance check: PASSED");
