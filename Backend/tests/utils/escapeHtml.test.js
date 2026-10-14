import { describe, it, expect } from 'vitest';
import { escapeHtml, sanitizeHeader } from '../../utils/escapeHtml.js';

describe('escapeHtml', () => {
  it('escapes HTML metacharacters', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&\``)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;&#96;');
  });
  it('handles null/undefined/non-strings', () => {
    expect(escapeHtml(null)).toBe('');
    expect(escapeHtml(undefined)).toBe('');
    expect(escapeHtml(42)).toBe('42');
  });
});

describe('sanitizeHeader', () => {
  it('removes CR/LF/NUL, quotes and angle brackets and caps length', () => {
    expect(sanitizeHeader('a\r\nBcc: x"<y>\0')).toBe('a Bcc: x y');
    expect(sanitizeHeader('x'.repeat(500)).length).toBe(100);
  });
});
