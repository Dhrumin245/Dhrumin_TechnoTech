/**
 * Return the URL only if it is a well-formed http(s) URL, otherwise ''.
 * Blocks javascript:, data:, vbscript:, file: and protocol-relative links
 * so that project data can never turn into a script-injection vector.
 */
export function safeUrl(value) {
  if (typeof value !== 'string') return '';
  const trimmed = value.trim();
  if (!trimmed) return '';
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === 'https:' || parsed.protocol === 'http:' ? parsed.href : '';
  } catch {
    return '';
  }
}
