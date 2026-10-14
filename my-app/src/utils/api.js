/**
 * API base URL helper for deployment.
 *
 * In development (Vite proxy): VITE_API_URL can be empty → relative paths work.
 * In production (Vercel):       VITE_API_URL = "https://your-backend.koyeb.app"
 */
const API_BASE = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/**
 * Prefix a path with the API base URL.
 * @param {string} path — e.g. '/api/contact'
 * @returns {string} — e.g. 'https://backend.koyeb.app/api/contact'
 */
export function apiUrl(path) {
  return `${API_BASE}${path}`;
}
