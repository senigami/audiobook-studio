import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { demoAsset } from '@/demo/assetUrl';

const DEMO_SRC = path.resolve(process.cwd(), 'src/demo');

function walk(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return walk(full);
    return /\.(ts|tsx)$/.test(entry.name) ? [full] : [];
  });
}

describe('demoAsset', () => {
  it('prefixes the Vite base and strips one leading slash', () => {
    expect(demoAsset('demo-covers/x.jpg')).toBe(`${import.meta.env.BASE_URL}demo-covers/x.jpg`);
    expect(demoAsset('/demo-covers/x.jpg')).toBe(`${import.meta.env.BASE_URL}demo-covers/x.jpg`);
  });
});

describe('demo sources', () => {
  it('contain no root-absolute asset string literals', () => {
    const rootAbsolute = /['"`]\/(demo-|textures\/|logo\.png)/;
    const offenders: string[] = [];
    for (const file of walk(DEMO_SRC)) {
      fs.readFileSync(file, 'utf8').split('\n').forEach((line, i) => {
        if (rootAbsolute.test(line)) offenders.push(`${path.relative(DEMO_SRC, file)}:${i + 1}: ${line.trim()}`);
      });
    }
    expect(offenders).toEqual([]);
  });
});
