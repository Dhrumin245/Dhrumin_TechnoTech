import { describe, it, expect } from 'vitest';
import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const html = readFileSync(resolve(root, 'index.html'), 'utf8');
// Parse with a real HTML parser (same text normalisation the browser applies before hashing) instead of regexes.
const doc = new DOMParser().parseFromString(html, 'text/html');
const inlineScripts = [...doc.querySelectorAll('script:not([src])')]
  .filter((el) => !el.type || el.type === 'text/javascript' || el.type === 'module')
  .map((el) => el.textContent);
const externalScriptOrigins = [...doc.querySelectorAll('script[src]')]
  .map((el) => el.getAttribute('src'))
  .filter((src) => /^https?:\/\//i.test(src))
  .map((src) => new URL(src).origin);
const vercel = JSON.parse(readFileSync(resolve(root, 'vercel.json'), 'utf8'));
const header = (key) => vercel.headers[0].headers.find((h) => h.key === key)?.value;

describe('Vercel security headers', () => {
  it('CSP hash matches the inline script in index.html (regenerate vercel.json if you edit it)', () => {
    const inline = inlineScripts;
    expect(inline.length).toBeGreaterThan(0);
    const csp = header('Content-Security-Policy');
    for (const code of inline) {
      const hash = createHash('sha256').update(code).digest('base64');
      expect(csp).toContain(`'sha256-${hash}'`);
    }
  });

  it('CSP forbids unsafe-inline/eval scripts, plugins, framing and base-tag hijacking', () => {
    const csp = header('Content-Security-Policy');
    const script = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(script).not.toMatch(/unsafe-inline|unsafe-eval|\*/);
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it('sets the standard hardening headers', () => {
    expect(header('X-Content-Type-Options')).toBe('nosniff');
    expect(header('X-Frame-Options')).toBe('DENY');
    expect(header('Strict-Transport-Security')).toMatch(/max-age=\d{7,}/);
    expect(header('Referrer-Policy')).toBeTruthy();
  });

  it('no longer proxies /uploads to the backend', () => {
    expect(JSON.stringify(vercel.rewrites)).not.toMatch(/uploads/);
  });

  it('index.html loads no unused third-party libraries (anime.js / lottie removed)', () => {
    expect(html).not.toMatch(/anime|lottie|bodymovin/i);
  });

  it('every external <script src> in index.html is explicitly allowed by script-src', () => {
    const csp = header('Content-Security-Policy');
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    const hosts = externalScriptOrigins;
    expect(hosts.length).toBeGreaterThan(0); // analytics tag
    for (const origin of hosts) expect(scriptSrc).toContain(origin);
  });

  it('script-src does not trust the cdnjs CDN', () => {
    const csp = header('Content-Security-Policy');
    const scriptSrc = csp.split(';').find((d) => d.trim().startsWith('script-src'));
    expect(scriptSrc).not.toContain('cdnjs.cloudflare.com');
  });

  it('connect-src is an allow-list: no blanket https:/wildcard, but includes the API host and analytics', () => {
    const csp = header('Content-Security-Policy');
    const connect = csp.split(';').map((d) => d.trim()).find((d) => d.startsWith('connect-src'));
    expect(connect).toBeDefined();
    const sources = connect.split(/\s+/).slice(1);
    expect(sources).toContain("'self'");
    expect(sources).not.toContain('https:');
    expect(sources).not.toContain('*');
    expect(sources).toContain('https://portfolioo-production-4c7f.up.railway.app'); // backend API
    expect(sources).toContain('https://www.google-analytics.com');
  });

  it('no third-party CDN is trusted for scripts, styles or fonts any more', () => {
    expect(header('Content-Security-Policy')).not.toContain('cdnjs.cloudflare.com');
    expect(html).not.toContain('cdnjs.cloudflare.com');
  });
});
