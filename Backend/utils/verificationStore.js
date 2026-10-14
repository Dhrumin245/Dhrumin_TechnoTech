import { randomBytes, createHash } from 'crypto';

// One-time proof that a visitor verified control of an email address.
// The token is random, bound to that email, expires after 15 minutes and can be used once, so
// knowing (or guessing) someone's email address is not enough to submit the form as them.
const TTL_MS = 15 * 60 * 1000;
const MAX_ENTRIES = 5000;

const store = new Map(); // sha256(token) -> { email, expires }
const hash = (token) => createHash('sha256').update(token).digest('hex');
const norm = (email) => String(email).trim().toLowerCase();

function prune() {
  const now = Date.now();
  for (const [key, entry] of store) if (entry.expires <= now) store.delete(key);
  // Hard cap so a flood of verifications cannot grow memory without bound (Map keeps insertion order).
  while (store.size >= MAX_ENTRIES) store.delete(store.keys().next().value);
}

export function issueVerificationToken(email) {
  prune();
  const token = randomBytes(32).toString('base64url');
  store.set(hash(token), { email: norm(email), expires: Date.now() + TTL_MS });
  return token;
}

/** Returns true (and burns the token) only if it is valid, unexpired and issued for this email. */
export function consumeVerificationToken(email, token) {
  if (typeof token !== 'string' || token.length < 20 || token.length > 100) return false;
  const key = hash(token);
  const entry = store.get(key);
  if (!entry) return false;
  if (entry.expires <= Date.now()) {
    store.delete(key);
    return false;
  }
  if (entry.email !== norm(email)) return false;
  store.delete(key);
  return true;
}

/** Give a consumed token back (used when the server failed to save, so the visitor can retry). */
export function restoreVerificationToken(email, token) {
  prune();
  store.set(hash(token), { email: norm(email), expires: Date.now() + TTL_MS });
}

export function clearVerificationTokens() {
  store.clear();
}

export function verificationTokenCount() {
  return store.size;
}
