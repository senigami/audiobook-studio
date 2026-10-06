import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

const FRONTEND = process.cwd();
const allowlist: string[] = JSON.parse(
  fs.readFileSync(path.join(FRONTEND, 'demo-public-allowlist.json'), 'utf8'),
);

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('demo public allowlist', () => {
  it('lists only files that exist in frontend/public', () => {
    const missing = allowlist.filter(rel => !fs.existsSync(path.join(FRONTEND, 'public', rel)));
    expect(missing).toEqual([]);
  });

  it('covers every public file the demo sources reference', () => {
    const files = [...walk(path.join(FRONTEND, 'src/demo')), path.join(FRONTEND, 'src/components/layout/BrandLogo.tsx')];
    const referenced = new Set<string>();
    for (const file of files) {
      const text = fs.readFileSync(file, 'utf8');
      for (const m of text.matchAll(/demoAsset\('([^']+)'\)/g)) referenced.add(m[1]);
      for (const m of text.matchAll(/TEX\('([^']+)'\)/g)) referenced.add(`textures/${m[1]}`);
      for (const m of text.matchAll(/BASE_URL\}([A-Za-z0-9_.-]+\.[a-z]+)/g)) referenced.add(m[1]);
    }
    expect([...referenced].length).toBeGreaterThan(25);
    expect([...referenced].filter(rel => !allowlist.includes(rel))).toEqual([]);
  });

  it('has no entries nothing references (keeps the shipped set minimal)', () => {
    const files = [...walk(path.join(FRONTEND, 'src/demo')), path.join(FRONTEND, 'src/components/layout/BrandLogo.tsx')];
    const text = files.map(f => fs.readFileSync(f, 'utf8')).join('\n');
    const unused = allowlist.filter(rel => {
      const base = path.posix.basename(rel);
      return !text.includes(rel) && !text.includes(`'${base}'`) && !text.includes(`BASE_URL}${rel}`);
    });
    expect(unused).toEqual([]);
  });
});
