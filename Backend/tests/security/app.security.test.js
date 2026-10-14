import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import request from 'supertest';
import dns from 'dns';

vi.mock('../../models/contact.js');
vi.mock('dns', () => ({ default: { promises: { resolveMx: vi.fn() } } }));

const mockResendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    constructor() {
      this.emails = { send: mockResendSend };
    }
  },
}));

const { createApp } = await import('../../app.js');
const { default: Contact } = await import('../../models/contact.js');
const { clearVerificationTokens, verificationTokenCount } = await import('../../utils/verificationStore.js');

let app;
const lastEmail = () => mockResendSend.mock.calls.at(-1)?.[0];

/** Request an OTP through the real route and read the code from the (mocked) email. */
async function getOtp(email) {
  const res = await request(app).post('/api/contact/send-otp').send({ email });
  expect(res.status).toBe(200);
  return /code is: (\d{6})/.exec(lastEmail().text)[1];
}

beforeEach(() => {
  process.env.RESEND_API_KEY = 're_test';
  process.env.RESEND_FROM_EMAIL = 'noreply@test.com';
  delete process.env.ALLOWED_ORIGINS;
  vi.clearAllMocks();
  clearVerificationTokens();
  dns.promises.resolveMx.mockResolvedValue([{ exchange: 'mx.example.com', priority: 10 }]);
  mockResendSend.mockResolvedValue({ data: { id: 'x' }, error: null });
  Contact.prototype.save = vi.fn().mockResolvedValue({});
  app = createApp(); // fresh rate-limit counters per test
});

afterEach(() => vi.restoreAllMocks());

describe('Security headers', () => {
  it('sends hardening headers and hides the framework', async () => {
    const res = await request(app).get('/api/health');
    expect(res.status).toBe(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['strict-transport-security']).toBeDefined();
    expect(res.headers['content-security-policy']).toBeDefined();
    expect(res.headers['x-frame-options']).toBeDefined();
  });
});

describe('Removed admin panel / project CMS endpoints', () => {
  const cases = [
    ['get', '/api/projects'],
    ['get', '/api/projects/anything'],
    ['post', '/api/projects'],
    ['put', '/api/projects/anything'],
    ['delete', '/api/projects/anything'],
    ['post', '/api/projects/upload-image'],
    ['post', '/api/projects/anything/restore/0'],
    ['get', '/uploads/1782715789552-668490243.png'],
    ['get', '/admin'],
    ['get', '/admin/projects'],
  ];
  it.each(cases)('%s %s is gone (404 JSON)', async (method, url) => {
    const res = await request(app)[method](url).set('x-admin-api-key', 'anything').send({});
    expect(res.status).toBe(404);
    expect(res.body).toEqual({ error: 'Not found' });
  });
});

describe('Request parsing hardening', () => {
  it('returns a generic JSON 400 for malformed JSON (no stack trace / parser details)', async () => {
    const res = await request(app).post('/api/contact/send-otp').set('Content-Type', 'application/json').send('{"email": ');
    expect(res.status).toBe(400);
    expect(res.body).toEqual({ error: 'Invalid request.' });
    expect(res.text).not.toMatch(/SyntaxError|at .*\.js|node_modules/);
  });

  it('rejects bodies over 10kb with 413', async () => {
    const res = await request(app).post('/api/contact').send({ name: 'a', email: 'a@example.com', message: 'x'.repeat(20000) });
    expect(res.status).toBe(413);
  });
});

describe('CORS', () => {
  const get = (origin) => request(app).get('/api/health').set('Origin', origin);

  it.each([
    'http://localhost:5173',
    'http://127.0.0.1:3000',
    'https://www.dhrumintechnotech.in',
    'https://dhrumintechnotech.in',
  ])('allows %s', async (origin) => {
    const res = await get(origin);
    expect(res.status).toBe(200);
    expect(res.headers['access-control-allow-origin']).toBe(origin);
  });

  it.each([
    'https://evil.com',
    'https://attacker-app.vercel.app', // arbitrary Vercel apps are no longer trusted
    'https://my-portfolio-abc123.vercel.app',
    'https://dhrumintechnotech.in.evil.com',
    'https://evil-dhrumintechnotech.in',
    'http://www.dhrumintechnotech.in', // http downgrade of a trusted host
    'https://evilvercel.app',
    'https://x.vercel.app.evil.com',
    'http://x.vercel.app',
    'https://vercel.app.attacker.io',
    'null',
  ])('blocks %s with a JSON 403', async (origin) => {
    const res = await get(origin);
    expect(res.status).toBe(403);
    expect(res.headers['access-control-allow-origin']).toBeUndefined();
    expect(res.body).toEqual({ error: 'Forbidden.' });
  });

  it('allows exact origins listed in ALLOWED_ORIGINS (e.g. one specific preview URL)', async () => {
    process.env.ALLOWED_ORIGINS = 'https://my-preview-abc.vercel.app/, https://staging.example.com';
    app = createApp();
    expect((await get('https://my-preview-abc.vercel.app')).status).toBe(200);
    expect((await get('https://staging.example.com')).status).toBe(200);
    // but not siblings or wildcard-like variants
    expect((await get('https://other-preview.vercel.app')).status).toBe(403);
    expect((await get('https://x.staging.example.com')).status).toBe(403);
  });
});

describe('Input type confusion / injection (must never crash the process)', () => {
  const weird = [{ $gt: '' }, { $ne: null }, ['a@b.com'], 12345, true, null, { toString: 'x' }];

  it.each(weird.map((w) => [JSON.stringify(w), w]))('send-otp rejects email=%s', async (_l, value) => {
    const res = await request(app).post('/api/contact/send-otp').send({ email: value });
    expect(res.status).toBe(400);
  });

  it.each(weird.map((w) => [JSON.stringify(w), w]))('verify-otp rejects email/otp=%s', async (_l, value) => {
    expect((await request(app).post('/api/contact/verify-otp').send({ email: value, otp: '123456' })).status).toBe(400);
    expect((await request(app).post('/api/contact/verify-otp').send({ email: 'a@example.com', otp: value })).status).toBe(400);
  });

  it.each(weird.map((w) => [JSON.stringify(w), w]))('contact submit rejects email/name/message=%s', async (_l, value) => {
    const ok = { name: 'Jane', email: 'jane@example.com', message: 'Hello', otp: '123456' };
    for (const field of ['email', 'name', 'message']) {
      const res = await request(app).post('/api/contact').send({ ...ok, [field]: value });
      expect(res.status).toBe(400);
    }
    expect(Contact.prototype.save).not.toHaveBeenCalled();
  });

  it('rejects empty / missing body and non-6-digit OTPs', async () => {
    expect((await request(app).post('/api/contact').send({})).status).toBe(400);
    expect((await request(app).post('/api/contact')).status).toBe(400);
    const base = { name: 'Jane', email: 'jane@example.com', message: 'Hello' };
    for (const otp of ['abc123', '12345', '1234567', '12 456', { $gt: '' }, [123456]]) {
      const res = await request(app).post('/api/contact').send({ ...base, otp });
      expect(res.status).toBe(400);
    }
  });

  it('enforces field length limits', async () => {
    const base = { email: 'jane@example.com', otp: '123456' };
    const longName = await request(app).post('/api/contact').send({ ...base, name: 'a'.repeat(101), message: 'hi' });
    expect(longName.status).toBe(400);
    const longMsg = await request(app).post('/api/contact').send({ ...base, name: 'Jane', message: 'a'.repeat(5001) });
    expect(longMsg.status).toBe(400);
  });
});

describe('Email injection', () => {
  async function submit(overrides) {
    const email = 'jane@example.com';
    const code = await getOtp(email);
    return request(app)
      .post('/api/contact')
      .send({ name: 'Jane', email, message: 'Hello', otp: code, ...overrides });
  }

  it('HTML-escapes name and message in the notification email (stored/email XSS)', async () => {
    const res = await submit({ name: '<script>alert(1)</script>', message: '<img src=x onerror=alert(1)>"\'&' });
    expect(res.status).toBe(200);
    const { html } = lastEmail();
    expect(html).not.toMatch(/<script>alert/i);
    expect(html).not.toMatch(/<img src=x/i);
    expect(html).toContain('&lt;script&gt;alert(1)&lt;/script&gt;');
    expect(html).toContain('&lt;img src=x onerror=alert(1)&gt;');
  });

  it('strips CR/LF and quotes from header fields (header injection)', async () => {
    const res = await submit({ name: 'Eve\r\nBcc: attacker@evil.com\r\nSubject: pwned" <x@y.z>' });
    expect(res.status).toBe(200);
    const { subject, from } = lastEmail();
    expect(subject).not.toMatch(/[\r\n]/);
    expect(from).not.toMatch(/[\r\n]/);
    expect(from.match(/"/g).length).toBe(2); // only the wrapping quotes
  });

  it('does not write the visitor message or email address to logs', async () => {
    const log = vi.spyOn(console, 'log').mockImplementation(() => {});
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    await submit({ message: 'SUPER-SECRET-BRIEF-12345' });
    const logged = JSON.stringify([...log.mock.calls, ...warn.mock.calls]);
    expect(logged).not.toContain('SUPER-SECRET-BRIEF-12345');
    expect(logged).not.toContain('jane@example.com');
  });
});

describe('OTP abuse resistance', () => {
  it('locks the code after 3 wrong guesses, even if the right one is then supplied', async () => {
    const email = 'victim@example.com';
    const code = await getOtp(email);
    const wrong = code === '000000' ? '111111' : '000000';
    for (let i = 0; i < 3; i++) {
      expect((await request(app).post('/api/contact/verify-otp').send({ email, otp: wrong })).status).toBe(400);
    }
    const res = await request(app).post('/api/contact/verify-otp').send({ email, otp: code });
    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/too many failed attempts/i);
  });

  it('a verified OTP cannot be replayed', async () => {
    const email = 'once@example.com';
    const code = await getOtp(email);
    expect((await request(app).post('/api/contact/verify-otp').send({ email, otp: code })).status).toBe(200);
    clearVerificationTokens();
    expect((await request(app).post('/api/contact/verify-otp').send({ email, otp: code })).status).toBe(400);
  });

  it('cannot submit the form without a verified email or valid OTP', async () => {
    const res = await request(app).post('/api/contact').send({ name: 'Bot', email: 'bot@example.com', message: 'spam', otp: '000000' });
    expect(res.status).toBe(400);
    expect(Contact.prototype.save).not.toHaveBeenCalled();
  });

  it('enforces the 60s per-email resend cooldown', async () => {
    await getOtp('cool@example.com');
    const again = await request(app).post('/api/contact/send-otp').send({ email: 'cool@example.com' });
    expect(again.status).toBe(429);
  });

  it('blocks disposable email domains', async () => {
    const res = await request(app).post('/api/contact/send-otp').send({ email: 'x@mailinator.com' });
    expect(res.status).toBe(400);
  });
});

describe('Rate limiting', () => {
  it('limits send-otp per IP (email-bombing protection)', async () => {
    const statuses = [];
    for (let i = 0; i < 12; i++) {
      const res = await request(app).post('/api/contact/send-otp').send({ email: `user${i}@example.com` });
      statuses.push(res.status);
    }
    expect(statuses.slice(0, 10).every((s) => s === 200)).toBe(true);
    expect(statuses.slice(10)).toEqual([429, 429]);
  });

  it('limits OTP guessing on verify-otp per IP', async () => {
    let last;
    for (let i = 0; i < 21; i++) {
      last = await request(app).post('/api/contact/verify-otp').send({ email: `u${i}@example.com`, otp: '000000' });
    }
    expect(last.status).toBe(429);
    expect(last.body.error).toMatch(/too many requests/i);
  });
});

describe('Error handling', () => {
  it('does not leak internals when the database fails', async () => {
    Contact.prototype.save = vi.fn().mockRejectedValue(new Error('mongodb://user:pass@host/db ECONNREFUSED'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const email = 'jane@example.com';
    const code = await getOtp(email);
    const res = await request(app).post('/api/contact').send({ name: 'Jane', email, message: 'Hello', otp: code });
    expect(res.status).toBe(500);
    expect(res.text).not.toMatch(/mongodb|ECONNREFUSED|pass/);
  });
});

describe('Email verification token (anyone knowing a verified email must not be able to submit as it)', () => {
  const form = { name: 'Jane', message: 'Hello' };

  async function verified(email) {
    const code = await getOtp(email);
    const res = await request(app).post('/api/contact/verify-otp').send({ email, otp: code });
    expect(res.status).toBe(200);
    return res.body.verificationToken;
  }

  it('issues an unguessable random token on successful verification only', async () => {
    const a = await verified('a@example.com');
    const b = await verified('b@example.com');
    expect(a).toMatch(/^[A-Za-z0-9_-]{40,}$/);
    expect(a).not.toBe(b);
    const bad = await request(app).post('/api/contact/verify-otp').send({ email: 'c@example.com', otp: '000000' });
    expect(bad.status).toBe(400);
    expect(bad.body.verificationToken).toBeUndefined();
  });

  it('knowing a recently verified email address is NOT enough to submit as it', async () => {
    await verified('victim@example.com');
    const res = await request(app).post('/api/contact').send({ ...form, email: 'victim@example.com' });
    expect(res.status).toBe(400);
    expect(Contact.prototype.save).not.toHaveBeenCalled();
  });

  it('accepts the genuine token exactly once (no replay)', async () => {
    const token = await verified('once@example.com');
    const first = await request(app).post('/api/contact').send({ ...form, email: 'once@example.com', verificationToken: token });
    expect(first.status).toBe(200);
    const replay = await request(app).post('/api/contact').send({ ...form, email: 'once@example.com', verificationToken: token });
    expect(replay.status).toBe(400);
    expect(Contact.prototype.save).toHaveBeenCalledTimes(1);
  });

  it('a token cannot be used for a different email address', async () => {
    const token = await verified('mine@example.com');
    const stolen = await request(app).post('/api/contact').send({ ...form, email: 'other@example.com', verificationToken: token });
    expect(stolen.status).toBe(400);
    // the rightful owner can still use it (a failed attempt by someone else does not burn it)
    const ok = await request(app).post('/api/contact').send({ ...form, email: 'mine@example.com', verificationToken: token });
    expect(ok.status).toBe(200);
  });

  it.each([['random string', 'x'.repeat(43)], ['empty-ish', ' '], ['object', { $ne: null }], ['array', ['a']], ['number', 123456], ['huge', 'a'.repeat(5000)]])(
    'rejects a forged/malformed token (%s)',
    async (_l, token) => {
      await verified('forge@example.com');
      const res = await request(app).post('/api/contact').send({ ...form, email: 'forge@example.com', verificationToken: token });
      expect(res.status).toBe(400);
      expect(Contact.prototype.save).not.toHaveBeenCalled();
    }
  );

  it('expires after 15 minutes', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      const token = await verified('late@example.com');
      vi.setSystemTime(Date.now() + 15 * 60 * 1000 + 1000);
      const res = await request(app).post('/api/contact').send({ ...form, email: 'late@example.com', verificationToken: token });
      expect(res.status).toBe(400);
      expect(res.body.error).toMatch(/expired or invalid/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it('lets the visitor retry with the same token after a server-side failure', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const token = await verified('retry@example.com');
    Contact.prototype.save = vi.fn().mockRejectedValueOnce(new Error('db down')).mockResolvedValue({});
    const body = { ...form, email: 'retry@example.com', verificationToken: token };
    expect((await request(app).post('/api/contact').send(body)).status).toBe(500);
    expect((await request(app).post('/api/contact').send(body)).status).toBe(200);
    expect((await request(app).post('/api/contact').send(body)).status).toBe(400); // and still single-use
  });

  it('keeps memory bounded: expired tokens are pruned', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    try {
      await verified('p1@example.com');
      await verified('p2@example.com');
      vi.setSystemTime(Date.now() + 16 * 60 * 1000);
      await verified('p3@example.com'); // issuing prunes the two expired ones
      expect(verificationTokenCount()).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
