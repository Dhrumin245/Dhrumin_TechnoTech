const MAP = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;', '`': '&#96;' };

/** Escape a value for safe interpolation into HTML (email bodies). */
export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"'`]/g, (c) => MAP[c]);
}

/** Make a value safe for use inside an email header (subject / display name). */
export function sanitizeHeader(value, maxLength = 100) {
  return String(value ?? '')
    .replace(/[\r\n\0"<>]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLength);
}
