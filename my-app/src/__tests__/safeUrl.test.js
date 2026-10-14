import { describe, it, expect } from 'vitest';
import { safeUrl } from '../utils/safeUrl';

describe('safeUrl', () => {
  it('accepts http(s) URLs', () => {
    expect(safeUrl('https://github.com/Dhrumin245/repo')).toBe('https://github.com/Dhrumin245/repo');
    expect(safeUrl('  http://example.com  ')).toBe('http://example.com/');
  });

  it.each([
    'javascript:alert(1)',
    'JaVaScRiPt:alert(1)',
    ' \tjavascript:alert(1)',
    'java\nscript:alert(1)',
    'data:text/html,<script>alert(1)</script>',
    'vbscript:msgbox(1)',
    'file:///etc/passwd',
    '//evil.com/x',
    '/relative/path',
    'ftp://example.com',
    'mailto:a@b.com',
    '',
    '   ',
    null,
    undefined,
    42,
    {},
    ['https://a.com'],
  ])('rejects %j', (value) => {
    expect(safeUrl(value)).toBe('');
  });
});
