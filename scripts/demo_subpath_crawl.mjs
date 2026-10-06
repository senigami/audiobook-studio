#!/usr/bin/env node
/**
 * Serves a built demo from /x/y/ and crawls it in Chrome.
 * Usage: node scripts/demo_subpath_crawl.mjs <distDir> [--port 8765]
 * Exit 0 = clean, 1 = findings, 2 = setup problem (no Chrome, bad args), 3 = overall timeout.
 */
import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const { chromium } = createRequire(path.join(root, 'frontend', 'package.json'))('playwright');

const args = process.argv.slice(2);
const dist = args.find(a => !a.startsWith('--') && a !== args[args.indexOf('--port') + 1]);
const portIdx = args.indexOf('--port');
const port = portIdx >= 0 ? Number(args[portIdx + 1]) : 8765;
if (!dist || !fs.existsSync(path.join(dist, 'index.html'))) {
  console.error('usage: node scripts/demo_subpath_crawl.mjs <distDir with index.html> [--port N]');
  process.exit(2);
}

const BASE = `http://127.0.0.1:${port}/x/y/`;
const BOOKS = ['The Whispering Vale', 'Echoes of Ember', 'Iron Meridian', 'The Silver Thread', 'Starfall Compact', 'Hollow Crown'];
const RAIL = ['Library', 'Voices', 'Activity', 'Engines', 'Integrations', 'Settings'];
const findings = [];
const fail = msg => { findings.push(msg); console.error('FINDING:', msg); };

const watchdog = setTimeout(() => { console.error('overall timeout'); process.exit(3); }, 180000);

const serveRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'demo-crawl-'));
fs.cpSync(dist, path.join(serveRoot, 'x', 'y'), { recursive: true });
const server = spawn('python3', ['-m', 'http.server', String(port), '--bind', '127.0.0.1', '--directory', serveRoot], { stdio: 'ignore' });

const cleanup = () => { clearTimeout(watchdog); server.kill(); fs.rmSync(serveRoot, { recursive: true, force: true }); };

async function waitForServer() {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(BASE)).ok) return; } catch { /* not up yet */ }
    await new Promise(r => setTimeout(r, 100));
  }
  throw new Error('http server did not start');
}

let browser;
let responses = 0;
let imagesChecked = 0;
const seenImages = new Set();
const coverUrls = new Set();
try {
  await waitForServer();
  try {
    browser = await chromium.launch({ channel: 'chrome' });
  } catch (e) {
    console.error('Could not launch Chrome:', e.message);
    cleanup();
    process.exit(2);
  }
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
  page.on('response', r => {
    responses++;
    if (r.status() >= 400) fail(`${r.status()} ${r.url()}`);
    if (r.url().includes('demo-covers')) coverUrls.add(r.url());
  });
  page.on('requestfailed', r => fail(`request failed ${r.url()} ${r.failure()?.errorText}`));
  page.on('pageerror', e => fail(`page error: ${e.message}`));

  // Waits on each pending image's load/error event, never on a fixed delay.
  const settle = async () => {
    await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => {});
    await page.evaluate(() => Promise.all([...document.images].filter(i => !i.complete).map(i =>
      new Promise(res => { i.addEventListener('load', res, { once: true }); i.addEventListener('error', res, { once: true }); }))));
  };
  const checkImages = async label => {
    const imgs = await page.evaluate(() => [...document.images]
      .filter(i => i.currentSrc)
      .map(i => ({ src: i.currentSrc, complete: i.complete, w: i.naturalWidth })));
    for (const i of imgs) {
      seenImages.add(i.src);
      if (/\.svg(\?|$)/.test(i.src)) continue;
      if (i.complete && i.w === 0) fail(`broken image at "${label}": ${i.src}`);
    }
    imagesChecked += imgs.length;
  };
  const railStageCount = () => page.locator('.ns-book-rail-stage').count();
  const waitHash = h => page.waitForFunction(x => location.hash === x, h, { timeout: 5000 }).catch(() => fail(`hash did not become ${h}`));

  // 1. Redirects land on the tour.
  await page.goto(BASE);
  await waitHash('#/stage/site-mockup');
  for (const start of ['#/styleguide', '#/stage/queue', '#/']) {
    await page.evaluate(h => { location.hash = h; }, start);
    await waitHash('#/stage/site-mockup');
  }

  // 2. No transport bar on the tour.
  if (await page.getByRole('button', { name: 'Restart' }).count()) fail('transport bar is visible on the tour');
  await settle();
  await checkImages('splash');

  // 3. Every sidebar item (Voices carries the voice raster and silhouettes).
  await page.getByRole('button', { name: 'Enter Library' }).click();
  for (const item of RAIL) {
    await page.locator(`button[aria-label="${item}"]`).click();
    await settle();
    await checkImages(`rail ${item}`);
  }

  // 4. Every book: open it, visit each book tab, then Home and Library must be clean.
  for (const title of BOOKS) {
    await page.locator('button[aria-label="Library"]').click();
    await page.getByText(title, { exact: true }).first().click();
    await settle();
    await checkImages(`book ${title}`);
    const tabs = await railStageCount();
    if (tabs === 0) fail(`no book tree in the rail after opening ${title}`);
    for (let i = 0; i < tabs; i++) {
      await page.locator('.ns-book-rail-stage').nth(i).click();
      await settle();
      await checkImages(`book ${title} tab ${i}`);
    }
    await page.getByRole('button', { name: 'Home' }).click();
    if ((await railStageCount()) !== 0) fail(`left nav still shows the book after Home (${title})`);
    await page.getByRole('button', { name: 'Enter Library' }).click();
    if ((await railStageCount()) !== 0) fail(`left nav shows the book after Home then Enter Library (${title})`);
    await page.locator('button[aria-label="Library"]').click();
    if ((await railStageCount()) !== 0) fail(`left nav shows the book after Home then Library (${title})`);
    if (!(await page.getByText(BOOKS[1], { exact: true }).first().isVisible())) fail(`Library list not shown after Home (${title})`);
    await settle();
    await checkImages(`library after ${title}`);
  }

  console.log(`crawled ${responses} responses, ${imagesChecked} image checks (${seenImages.size} distinct), ${coverUrls.size} cover files reached under ${BASE}`);
  if (coverUrls.size === 0) fail('no demo-covers image was requested');
} catch (e) {
  fail(`crawl aborted: ${e.message}`);
} finally {
  if (browser) await browser.close();
  cleanup();
}

if (findings.length) { console.error(`FAIL: ${findings.length} finding(s)`); process.exit(1); }
console.log('OK: no >=400 responses, no broken images, left nav clean after Home');
