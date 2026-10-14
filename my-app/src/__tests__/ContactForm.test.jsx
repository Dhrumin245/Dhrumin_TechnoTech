import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import App from '../App';

vi.mock('../components/animations/Animations/SplashCursor/SplashCursor', () => ({ default: () => null }));

const json = (status, body) => Promise.resolve({ ok: status >= 200 && status < 300, status, json: () => Promise.resolve(body) });

function setup(handlers) {
  const calls = [];
  globalThis.fetch = vi.fn((url, opts) => {
    const path = new URL(String(url), 'http://x').pathname;
    const body = opts?.body ? JSON.parse(opts.body) : undefined;
    calls.push({ path, body });
    return handlers[path] ? handlers[path](body) : json(404, {});
  });
  render(
    <MemoryRouter>
      <App />
    </MemoryRouter>
  );
  return calls;
}

async function verifyEmail() {
  fireEvent.change(document.getElementById('name'), { target: { value: 'Jane' } });
  fireEvent.change(document.getElementById('email'), { target: { value: 'jane@example.com' } });
  fireEvent.change(document.getElementById('message'), { target: { value: 'Build me an app' } });
  fireEvent.click(screen.getByRole('button', { name: 'Verify Email' }));
  const otp = await screen.findByPlaceholderText('Enter 6-digit code');
  fireEvent.change(otp, { target: { value: '123456' } }); // 6 digits auto-submits
  await screen.findByText(/✓ Verified/);
}

describe('Contact form verification token', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends the one-time verificationToken from /verify-otp with the submission', async () => {
    const calls = setup({
      '/api/contact/send-otp': () => json(200, { message: 'sent' }),
      '/api/contact/verify-otp': () => json(200, { message: 'ok', verificationToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789' }),
      '/api/contact': () => json(200, { message: 'Message sent successfully' }),
    });
    await verifyEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send Project Brief' }));
    await screen.findByText('Project brief sent successfully!');

    const submit = calls.find((c) => c.path === '/api/contact');
    expect(submit.body).toMatchObject({
      name: 'Jane',
      email: 'jane@example.com',
      message: 'Build me an app',
      verificationToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789',
    });
  });

  it('sends the visitor back to the verify step if the server says verification expired', async () => {
    setup({
      '/api/contact/send-otp': () => json(200, { message: 'sent' }),
      '/api/contact/verify-otp': () => json(200, { verificationToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789' }),
      '/api/contact': () => json(400, { error: 'Email verification expired or invalid. Please verify your email again.' }),
    });
    await verifyEmail();
    fireEvent.click(screen.getByRole('button', { name: 'Send Project Brief' }));
    await screen.findByText(/verify your email again/i);
    await waitFor(() => expect(screen.queryByText(/✓ Verified/)).toBeNull());
    expect(document.getElementById('email')).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Send Project Brief' })).toBeDisabled(); // must verify again
  });

  it('forgets the token when the email is edited after verification', async () => {
    const calls = setup({
      '/api/contact/send-otp': () => json(200, { message: 'sent' }),
      '/api/contact/verify-otp': () => json(200, { verificationToken: 'tok_abcdefghijklmnopqrstuvwxyz0123456789' }),
      '/api/contact': () => json(400, { error: 'Email verification code is required.' }),
    });
    await verifyEmail();
    fireEvent.click(screen.getByText(/✓ Verified/)); // "click to change email"
    expect(screen.getByRole('button', { name: 'Send Project Brief' })).toBeDisabled();
    expect(calls.filter((c) => c.path === '/api/contact')).toHaveLength(0);
  });
});
