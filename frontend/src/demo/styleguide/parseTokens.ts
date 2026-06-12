/**
 * parseTokens — parses a tokens.css string into structured entries.
 *
 * Extracts CSS custom property declarations from both `:root` and
 * `[data-theme="dark"]` blocks. Returns one entry per token with its
 * light value, dark value (if overridden), and inline comment if present.
 */

export interface TokenEntry {
  name: string;       // e.g. "--bg"
  lightValue: string; // value from :root block
  darkValue: string;  // value from [data-theme="dark"] block, or "" if not overridden
  comment: string;    // inline /* … */ comment, or ""
}

/**
 * Parse all "--name: value;" declarations (with optional inline comments) from a CSS block.
 */
function parseBlock(css: string, blockSelector: string): Map<string, { value: string; comment: string }> {
  const result = new Map<string, { value: string; comment: string }>();

  // Find the block by selector, then extract content between { and matching }
  const selectorPattern = blockSelector === ':root'
    ? /:root\s*\{/
    : /\[data-theme="dark"\]\s*\{/;

  const selectorMatch = selectorPattern.exec(css);
  if (!selectorMatch) return result;

  // Walk from the opening brace, tracking brace depth
  let depth = 0;
  let start = -1;
  let end = -1;
  for (let i = selectorMatch.index; i < css.length; i++) {
    if (css[i] === '{') {
      if (depth === 0) start = i + 1;
      depth++;
    } else if (css[i] === '}') {
      depth--;
      if (depth === 0) {
        end = i;
        break;
      }
    }
  }

  if (start === -1 || end === -1) return result;

  const block = css.slice(start, end);

  // Match custom property declarations, possibly spanning multiple lines
  // Pattern: --name: value; optionally followed by /* comment */
  // Values can contain nested parens and commas
  const lineRe = /--([\w-]+)\s*:\s*((?:[^;]|\n)*?)\s*;(?:\s*\/\*([^*]|\*(?!\/))*\*\/)?/g;

  let m: RegExpExecArray | null;
  while ((m = lineRe.exec(block)) !== null) {
    const name = `--${m[1]}`;
    let value = m[2].trim();
    // Remove any inline comment from the value
    value = value.replace(/\/\*[^*]*\*+(?:[^/*][^*]*\*+)*\//g, '').trim();

    // Extract trailing comment after the semicolon in the matched region
    const matchedStr = m[0];
    const commentMatch = /\/\*\s*(.*?)\s*\*\//.exec(matchedStr.slice(matchedStr.indexOf(';') + 1));
    const comment = commentMatch ? commentMatch[1].trim() : '';

    result.set(name, { value, comment });
  }

  return result;
}

/**
 * Parse a tokens.css string and return a merged array of TokenEntry.
 *
 * Light entries are the source; dark entries fill in `darkValue`.
 * Tokens only in the dark block are appended with empty lightValue.
 */
export function parseTokens(css: string): TokenEntry[] {
  const lightMap = parseBlock(css, ':root');
  const darkMap = parseBlock(css, '[data-theme="dark"]');

  const entries: TokenEntry[] = [];

  // First pass: all light tokens (in declaration order, via Map insertion order)
  for (const [name, { value, comment }] of lightMap) {
    const dark = darkMap.get(name);
    entries.push({
      name,
      lightValue: value,
      darkValue: dark?.value ?? '',
      comment: comment || dark?.comment || '',
    });
  }

  // Second pass: dark-only tokens (no light override)
  for (const [name, { value, comment }] of darkMap) {
    if (!lightMap.has(name)) {
      entries.push({
        name,
        lightValue: '',
        darkValue: value,
        comment,
      });
    }
  }

  return entries;
}

/**
 * Group token entries by a prefix extracted from the name.
 * Returns a Map<groupKey, TokenEntry[]> in a consistent order.
 */
export function groupTokens(entries: TokenEntry[]): Map<string, TokenEntry[]> {
  const ORDER = [
    'surface', 'bg', 'background',
    'text',
    'accent',
    'success', 'warning', 'error',
    'glass',
    'border',
    'shadow',
    'progress',
    'radius',
    'overlay',
    'cloud',
    'as',
    'header',
    'misc',
  ];

  function getGroup(name: string): string {
    const bare = name.replace(/^--/, '');
    for (const prefix of ORDER) {
      if (bare === prefix || bare.startsWith(prefix + '-') || bare.startsWith(prefix + '_')) {
        return prefix;
      }
    }
    return 'misc';
  }

  const groups = new Map<string, TokenEntry[]>();

  for (const entry of entries) {
    const group = getGroup(entry.name);
    const arr = groups.get(group) ?? [];
    arr.push(entry);
    groups.set(group, arr);
  }

  // Sort groups by ORDER, then append any unknown groups at the end
  const sorted = new Map<string, TokenEntry[]>();
  for (const key of ORDER) {
    if (groups.has(key)) sorted.set(key, groups.get(key)!);
  }
  for (const [key, val] of groups) {
    if (!sorted.has(key)) sorted.set(key, val);
  }

  return sorted;
}
