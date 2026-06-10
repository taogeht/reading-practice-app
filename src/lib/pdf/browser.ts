import { existsSync } from 'node:fs';
import puppeteer, { type Browser } from 'puppeteer-core';

// puppeteer-core ships no browser; we point it at a system Chromium. Candidate
// paths in priority order: explicit env override, the two Alpine package
// locations (the binary moved between Alpine releases), then local macOS Chrome
// for dev. First one that exists wins.
const CANDIDATE_PATHS = [
  process.env.PUPPETEER_EXECUTABLE_PATH,
  '/usr/bin/chromium-browser',
  '/usr/bin/chromium',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/Applications/Chromium.app/Contents/MacOS/Chromium',
].filter((p): p is string => typeof p === 'string' && p.length > 0);

function resolveExecutablePath(): string {
  for (const p of CANDIDATE_PATHS) {
    if (existsSync(p)) return p;
  }
  // Nothing found — return the env value (or first candidate) and let launch
  // throw a clear ENOENT the caller can surface.
  return process.env.PUPPETEER_EXECUTABLE_PATH || CANDIDATE_PATHS[0] || 'chromium';
}

let browserPromise: Promise<Browser> | null = null;

function launch(): Promise<Browser> {
  return puppeteer.launch({
    executablePath: resolveExecutablePath(),
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      // Containers cap /dev/shm small; without this Chromium can crash mid-render.
      '--disable-dev-shm-usage',
      '--disable-gpu',
    ],
  });
}

// One Chromium reused across requests (cheap newPage per render), relaunched if
// it has died or disconnected. Mirrors the getBrowser() singleton pattern.
export async function getBrowser(): Promise<Browser> {
  if (browserPromise) {
    try {
      const existing = await browserPromise;
      if (existing.connected) return existing;
    } catch {
      // fall through to relaunch
    }
  }
  browserPromise = launch();
  return browserPromise;
}

export async function renderPdfFromHtml(
  html: string,
  opts?: { format?: 'A4' | 'Letter'; landscape?: boolean },
): Promise<Buffer> {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // Images are inlined as data URIs, so there are no external requests —
    // 'load' settles immediately.
    await page.setContent(html, { waitUntil: 'load' });
    const pdf = await page.pdf({
      format: opts?.format ?? 'A4',
      landscape: opts?.landscape ?? false,
      printBackground: true,
      margin: { top: '14mm', right: '12mm', bottom: '14mm', left: '12mm' },
    });
    return Buffer.from(pdf);
  } finally {
    await page.close();
  }
}
