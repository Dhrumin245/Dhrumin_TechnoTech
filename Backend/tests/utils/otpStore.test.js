import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createOTP, verifyOTP } from '../../utils/otpStore.js';

describe('otpStore', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  it('generates 6-digit codes without using Math.random (CSPRNG)', () => {
    const rnd = vi.spyOn(Math, 'random');
    const codes = new Set();
    for (let i = 0; i < 200; i++) {
      const { code } = createOTP(`gen${i}@example.com`);
      expect(code).toMatch(/^[1-9]\d{5}$/);
      codes.add(code);
    }
    expect(rnd).not.toHaveBeenCalled();
    expect(codes.size).toBeGreaterThan(150);
    rnd.mockRestore();
  });

  it('normalises email case/whitespace', () => {
    const { code } = createOTP('  Case@Example.COM ');
    expect(verifyOTP('case@example.com', code).valid).toBe(true);
  });

  it('expires after 5 minutes', () => {
    const { code } = createOTP('exp@example.com');
    vi.advanceTimersByTime(5 * 60 * 1000 + 1);
    const r = verifyOTP('exp@example.com', code);
    expect(r.valid).toBe(false);
    expect(r.error).toMatch(/expired/i);
  });

  it('enforces a 60s cooldown between sends', () => {
    createOTP('cd@example.com');
    expect(createOTP('cd@example.com').cooldown).toBe(true);
    vi.advanceTimersByTime(61 * 1000);
    expect(createOTP('cd@example.com').cooldown).toBe(false);
  });

  it('allows at most 3 wrong attempts', () => {
    const { code } = createOTP('att@example.com');
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) expect(verifyOTP('att@example.com', wrong).valid).toBe(false);
    expect(verifyOTP('att@example.com', code).valid).toBe(false);
  });

  it('is single use and rejects non-string codes', () => {
    const { code } = createOTP('one@example.com');
    expect(verifyOTP('one@example.com', Number(code)).valid).toBe(false);
    expect(verifyOTP('one@example.com', code).valid).toBe(true);
    expect(verifyOTP('one@example.com', code).valid).toBe(false);
  });
});
