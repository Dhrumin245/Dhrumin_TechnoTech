import { randomInt, timingSafeEqual } from 'crypto';

// In-memory OTP store with automatic expiry.
// Each OTP entry: { code, expiresAt, attempts }

const otpStore = new Map();

const OTP_EXPIRY_MS = 5 * 60 * 1000; // 5 minutes
const MAX_ATTEMPTS = 3;
const COOLDOWN_MS = 60 * 1000; // 1 minute between OTP sends

/**
 * Generate a random 6-digit OTP code.
 */
function generateOTP() {
  return randomInt(100000, 1000000).toString();
}

function safeEqual(expected, provided) {
  if (typeof provided !== 'string') return false;
  const a = Buffer.from(expected);
  const b = Buffer.from(provided);
  return a.length === b.length && timingSafeEqual(a, b);
}

/**
 * Store an OTP for the given email.
 * Returns { code, cooldown } — cooldown is true if the user must wait.
 */
export function createOTP(email) {
  const key = String(email).trim().toLowerCase();
  const existing = otpStore.get(key);

  // Enforce cooldown: can't request a new OTP within 1 minute
  if (existing && existing.createdAt && (Date.now() - existing.createdAt) < COOLDOWN_MS) {
    const remainingSeconds = Math.ceil((COOLDOWN_MS - (Date.now() - existing.createdAt)) / 1000);
    return { code: null, cooldown: true, remainingSeconds };
  }

  const code = generateOTP();
  otpStore.set(key, {
    code,
    createdAt: Date.now(),
    expiresAt: Date.now() + OTP_EXPIRY_MS,
    attempts: 0,
  });

  return { code, cooldown: false };
}

/**
 * Verify the OTP for the given email.
 * Returns { valid, error }
 */
export function verifyOTP(email, code) {
  const key = String(email).trim().toLowerCase();
  const entry = otpStore.get(key);

  if (!entry) {
    return { valid: false, error: 'No verification code found. Please request a new one.' };
  }

  if (Date.now() > entry.expiresAt) {
    otpStore.delete(key);
    return { valid: false, error: 'Verification code has expired. Please request a new one.' };
  }

  if (entry.attempts >= MAX_ATTEMPTS) {
    otpStore.delete(key);
    return { valid: false, error: 'Too many failed attempts. Please request a new code.' };
  }

  if (!safeEqual(entry.code, code)) {
    entry.attempts += 1;
    return { valid: false, error: `Invalid code. ${MAX_ATTEMPTS - entry.attempts} attempt(s) remaining.` };
  }

  // Valid — consume the OTP
  otpStore.delete(key);
  return { valid: true, error: null };
}

/**
 * Clean up expired OTPs (called periodically).
 */
export function cleanupExpiredOTPs() {
  const now = Date.now();
  for (const [key, entry] of otpStore) {
    if (now > entry.expiresAt) {
      otpStore.delete(key);
    }
  }
}

// Run cleanup every 10 minutes
setInterval(cleanupExpiredOTPs, 10 * 60 * 1000).unref();

export default { createOTP, verifyOTP, cleanupExpiredOTPs };
