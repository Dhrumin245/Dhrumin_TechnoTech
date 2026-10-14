import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import dns from 'dns';
import contactRoutes from '../../routes/contactRoutes.js';
import { clearVerificationTokens } from '../../utils/verificationStore.js';
import Contact from '../../models/contact.js';
import nodemailer from 'nodemailer';

vi.mock('../../models/contact.js');

vi.mock('../../utils/disposableEmails.js', () => ({
  isDisposableEmail: vi.fn((email) => {
    const disposable = ['tempmail.com', 'guerrillamail.com', 'yopmail.com'];
    const domain = email?.split('@')[1];
    return disposable.includes(domain);
  }),
}));

const mockSendMail = vi.fn();
vi.mock('nodemailer', () => ({
  default: {
    createTransport: vi.fn(() => ({
      sendMail: mockSendMail,
    })),
  },
}));

const mockResendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = {
        send: mockResendSend,
      };
    }
  },
}));

vi.mock('dns', () => ({
  default: {
    promises: {
      resolveMx: vi.fn(),
    },
  },
}));

// Mock otpStore
const otpStoreMap = new Map();
vi.mock('../../utils/otpStore.js', () => ({
  createOTP: vi.fn((email) => {
    const code = '123456';
    otpStoreMap.set(email.toLowerCase(), code);
    return { code, cooldown: false };
  }),
  verifyOTP: vi.fn((email, code) => {
    const stored = otpStoreMap.get(email.toLowerCase());
    if (!stored) return { valid: false, error: 'No verification code found.' };
    if (stored !== code) return { valid: false, error: 'Invalid code.' };
    otpStoreMap.delete(email.toLowerCase());
    return { valid: true, error: null };
  }),
}));

describe('Contact Routes', () => {
  let app;
  const originalEnv = { ...process.env };

  beforeEach(() => {
    app = express();
    app.use(express.json());
    app.use('/api/contact', contactRoutes);
    vi.clearAllMocks();
    otpStoreMap.clear();
    clearVerificationTokens();
    process.env = { ...originalEnv };
    dns.promises.resolveMx.mockResolvedValue([{ exchange: 'mail.example.com', priority: 10 }]);
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  // ── Send OTP Tests ──

  it('POST /api/contact/send-otp should return 400 for disposable email', async () => {
    const response = await request(app)
      .post('/api/contact/send-otp')
      .send({ email: 'user@tempmail.com' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Temporary or disposable');
  });

  it('POST /api/contact/send-otp should return 400 for invalid domain', async () => {
    const err = new Error('ENOTFOUND');
    err.code = 'ENOTFOUND';
    dns.promises.resolveMx.mockRejectedValue(err);

    const response = await request(app)
      .post('/api/contact/send-otp')
      .send({ email: 'user@fake123domain.xyz' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('valid email');
  });

  it('POST /api/contact/send-otp should send OTP for valid email', async () => {
    mockResendSend.mockResolvedValue({ data: { id: 'resend_otp' }, error: null });
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'contact@test.com';

    const response = await request(app)
      .post('/api/contact/send-otp')
      .send({ email: 'jane@example.com' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('Verification code sent');
    expect(mockResendSend).toHaveBeenCalled();
  });

  // ── Standalone Verify OTP Tests ──

  it('POST /api/contact/verify-otp should return 400 for wrong OTP', async () => {
    otpStoreMap.set('jane@example.com', '123456');

    const response = await request(app)
      .post('/api/contact/verify-otp')
      .send({ email: 'jane@example.com', otp: '999999' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Invalid code');
  });

  it('POST /api/contact/verify-otp should return 200 for correct OTP', async () => {
    otpStoreMap.set('jane@example.com', '123456');

    const response = await request(app)
      .post('/api/contact/verify-otp')
      .send({ email: 'jane@example.com', otp: '123456' });

    expect(response.status).toBe(200);
    expect(response.body.message).toContain('Email verified successfully');
  });

  // ── Submit with OTP / Pre-verified Tests ──

  it('POST /api/contact should return 400 when unverified and OTP is missing', async () => {
    const response = await request(app)
      .post('/api/contact')
      .send({ name: 'Jane', email: 'jane@example.com', message: 'Hello' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('verification code is required');
  });

  it('POST /api/contact should return 400 for disposable email', async () => {
    const response = await request(app)
      .post('/api/contact')
      .send({ name: 'Jane', email: 'user@yopmail.com', message: 'Hello', otp: '123456' });

    expect(response.status).toBe(400);
    expect(response.body.error).toContain('Temporary or disposable');
  });

  it('POST /api/contact should return 200 when pre-verified via verify-otp endpoint', async () => {
    Contact.prototype.save = vi.fn().mockResolvedValue({});
    mockResendSend.mockResolvedValue({ data: { id: 'resend_notify' }, error: null });
    process.env.RESEND_API_KEY = 're_test_key';
    process.env.RESEND_FROM_EMAIL = 'contact@test.com';

    // 1. Verify OTP first
    otpStoreMap.set('jane@example.com', '123456');
    const verify = await request(app)
      .post('/api/contact/verify-otp')
      .send({ email: 'jane@example.com', otp: '123456' });
    expect(verify.body.verificationToken).toMatch(/^[A-Za-z0-9_-]{40,}$/);

    // 2. Submit form with the one-time verification token (no OTP needed again)
    const response = await request(app)
      .post('/api/contact')
      .send({ name: 'Jane Doe', email: 'jane@example.com', message: 'Build my app', verificationToken: verify.body.verificationToken });

    expect(response.status).toBe(200);
    expect(response.body.message).toBe('Message sent successfully');
    expect(Contact.prototype.save).toHaveBeenCalledTimes(1);
  });

  it('POST /api/contact should return 500 when database save fails', async () => {
    Contact.prototype.save = vi.fn().mockRejectedValue(new Error('DB connection failed'));
    otpStoreMap.set('jane@example.com', '123456');

    const response = await request(app)
      .post('/api/contact')
      .send({ name: 'Jane', email: 'jane@example.com', message: 'Hello', otp: '123456' });

    expect(response.status).toBe(500);
    expect(response.body.error).toBe('Failed to send message');
  });
});
