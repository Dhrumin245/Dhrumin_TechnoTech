import express from 'express';
import nodemailer from 'nodemailer';
import { Resend } from 'resend';
import dns from 'dns';
import Contact from '../models/contact.js';
import { isDisposableEmail } from '../utils/disposableEmails.js';
import { createOTP, verifyOTP } from '../utils/otpStore.js';
import { escapeHtml, sanitizeHeader } from '../utils/escapeHtml.js';
import { issueVerificationToken, consumeVerificationToken, restoreVerificationToken } from '../utils/verificationStore.js';

const router = express.Router();

const LIMITS = { name: 100, email: 254, message: 5000 };
const isNonEmptyString = (v, max) => typeof v === 'string' && v.trim().length > 0 && v.length <= max;
const isOtpFormat = (v) => typeof v === 'string' && /^\d{6}$/.test(v);

// ── Helpers ──────────────────────────────────────────────────────────

/**
 * Verify email authenticity: syntax check + DNS MX record lookup.
 */
export const verifyEmailAuthenticity = async (email) => {
  if (!email || typeof email !== 'string') return false;
  const trimmed = email.trim();
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  if (!emailRegex.test(trimmed)) return false;

  const domain = trimmed.split('@')[1];
  if (!domain) return false;

  try {
    const mxRecords = await dns.promises.resolveMx(domain);
    if (!mxRecords || mxRecords.length === 0) {
      return false;
    }
    return true;
  } catch (err) {
    if (err.code === 'ENOTFOUND' || err.code === 'ENODATA' || err.code === 'NXDOMAIN') {
      console.warn('Email authenticity check rejected a domain:', err.code);
      return false;
    }
    console.warn(`DNS lookup warning for domain ${domain} (${err.code || err.message}): proceeding with format validation.`);
    return true;
  }
};

/**
 * Send an email using Resend (preferred) or Nodemailer SMTP (fallback).
 * Returns true if successfully sent.
 */
const sendEmail = async ({ from, fromName, to, replyTo, subject, text, html }) => {
  const {
    RESEND_API_KEY,
    RESEND_FROM_EMAIL,
    SMTP_HOST,
    SMTP_PORT,
    SMTP_USER,
    SMTP_PASS,
    EMAIL_FROM,
  } = process.env;

  // Try Resend first
  if (RESEND_API_KEY) {
    try {
      const resend = new Resend(RESEND_API_KEY);
      const fromAddress = RESEND_FROM_EMAIL || 'onboarding@resend.dev';
      const resendResult = await resend.emails.send({
        from: fromName ? `"${fromName}" <${fromAddress}>` : fromAddress,
        to,
        replyTo,
        subject,
        text,
        html,
      });

      if (resendResult.error) {
        console.error('Resend API returned an error:', resendResult.error.message || resendResult.error);
      } else {
        console.log('Email sent via Resend');
        return true;
      }
    } catch (resendError) {
      console.error('Error sending email via Resend:', resendError);
    }
  }

  // Fallback to Nodemailer SMTP
  if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    try {
      const isSecure = process.env.SMTP_SECURE === 'true';
      const transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || '587', 10),
        secure: isSecure,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });

      await transporter.sendMail({
        from: EMAIL_FROM || (fromName ? `"${fromName}" <${SMTP_USER}>` : SMTP_USER),
        to,
        replyTo,
        subject,
        text,
        html,
      });
      console.log('Email sent via Nodemailer');
      return true;
    } catch (emailError) {
      console.error('Error sending email via Nodemailer:', emailError);
    }
  }

  console.warn('Email not sent: Neither RESEND_API_KEY nor SMTP settings are configured.');
  return false;
};

// ── Routes ───────────────────────────────────────────────────────────

/**
 * POST /api/contact/send-otp
 * Step 1: Validate email → send OTP verification code.
 */
router.post('/send-otp', async (req, res) => {
  const { email } = req.body;

  if (!isNonEmptyString(email, LIMITS.email)) {
    return res.status(400).json({ error: 'Email is required.' });
  }

  // Check for disposable/temp email
  if (isDisposableEmail(email)) {
    return res.status(400).json({ error: 'Temporary or disposable email addresses are not allowed. Please use a permanent email.' });
  }

  // Verify email authenticity (syntax + MX)
  const isAuthentic = await verifyEmailAuthenticity(email);
  if (!isAuthentic) {
    return res.status(400).json({ error: 'Please provide a valid email address.' });
  }

  // Generate OTP (with cooldown check)
  const { code, cooldown, remainingSeconds } = createOTP(email);
  if (cooldown) {
    return res.status(429).json({
      error: `Please wait ${remainingSeconds} seconds before requesting a new code.`,
    });
  }

  // Send the OTP email
  const sent = await sendEmail({
    to: email,
    subject: 'Your Verification Code — Dhrumin\'s Portfolio',
    text: `Your verification code is: ${code}\n\nThis code expires in 5 minutes. If you didn't request this, please ignore this email.`,
    html: `
      <div style="font-family: sans-serif; padding: 30px; color: #333; max-width: 480px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 12px; text-align: center;">
        <h2 style="color: #00bcd4; margin-top: 0;">Email Verification</h2>
        <p style="font-size: 16px; color: #555;">Your verification code is:</p>
        <div style="background: linear-gradient(135deg, #0a192f, #112240); color: #00bcd4; font-size: 36px; font-weight: bold; letter-spacing: 8px; padding: 20px; border-radius: 8px; margin: 20px 0;">
          ${code}
        </div>
        <p style="font-size: 14px; color: #888;">This code expires in <strong>5 minutes</strong>.</p>
        <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
        <p style="font-size: 12px; color: #aaa;">If you didn't request this code, you can safely ignore this email.</p>
      </div>
    `,
  });

  if (!sent) {
    return res.status(500).json({ error: 'Failed to send verification code. Please try again.' });
  }

  res.status(200).json({ message: 'Verification code sent to your email.' });
});

/**
 * POST /api/contact/verify-otp
 * Step 1b: Standalone OTP verification before form submission.
 */
router.post('/verify-otp', async (req, res) => {
  const { email, otp } = req.body;

  if (!isNonEmptyString(email, LIMITS.email) || !isNonEmptyString(otp, 6)) {
    return res.status(400).json({ error: 'Email and verification code are required.' });
  }

  // Verify OTP
  const otpResult = verifyOTP(email, otp);
  if (!otpResult.valid) {
    return res.status(400).json({ error: otpResult.error });
  }

  // One-time token (15 min) that must accompany the form submission for this email
  const verificationToken = issueVerificationToken(email);

  res.status(200).json({ message: 'Email verified successfully!', verificationToken });
});

/**
 * POST /api/contact
 * Step 2: Submit the contact form (requires verified email or valid OTP).
 */
router.post('/', async (req, res) => {
  const { name, email, message, otp } = req.body || {};

  if (!isNonEmptyString(email, LIMITS.email)) {
    return res.status(400).json({ error: 'A valid email is required.' });
  }

  // Check for disposable/temp email
  if (isDisposableEmail(email)) {
    return res.status(400).json({ error: 'Temporary or disposable email addresses are not allowed.' });
  }

  if (!isNonEmptyString(name, LIMITS.name) || !isNonEmptyString(message, LIMITS.message)) {
    return res.status(400).json({ error: 'Name and project brief are required (name max 100, brief max 5000 characters).' });
  }

  const { verificationToken } = req.body || {};
  let tokenUsed = null;

  if (verificationToken !== undefined && verificationToken !== null && verificationToken !== '') {
    // Normal path: the token handed out by /verify-otp, valid once, for this exact email.
    if (!consumeVerificationToken(email, verificationToken)) {
      return res.status(400).json({ error: 'Email verification expired or invalid. Please verify your email again.' });
    }
    tokenUsed = verificationToken;
  } else {
    // Fallback: a fresh, valid OTP sent together with the form.
    if (otp === undefined || otp === null || otp === '') {
      return res.status(400).json({ error: 'Email verification code is required.' });
    }
    if (!isOtpFormat(otp)) {
      return res.status(400).json({ error: 'Invalid code.' });
    }
    const otpResult = verifyOTP(email, otp);
    if (!otpResult.valid) {
      return res.status(400).json({ error: otpResult.error });
    }
  }

  try {
    const newContact = new Contact({ name, email, message });
    await newContact.save();

    // Send notification email to you
    const recipient = process.env.EMAIL_TO || 'dhrumintechnotech@gmail.com';
    const safeName = sanitizeHeader(name);
    const formattedSenderName = safeName ? `${safeName} via Portfolio` : 'Portfolio Contact';

    await sendEmail({
      fromName: formattedSenderName,
      to: recipient,
      replyTo: email,
      subject: `New Portfolio Project Brief from ${safeName || 'a visitor'}`,
      text: `You have received a new contact form submission:\n\nName: ${name}\nEmail: ${email}\n\nProject Brief:\n${message}`,
      html: `
        <div style="font-family: sans-serif; padding: 20px; color: #333; line-height: 1.6; max-width: 600px; margin: 0 auto; border: 1px solid #e0e0e0; border-radius: 8px;">
          <h2 style="color: #00bcd4; border-bottom: 2px solid #00bcd4; padding-bottom: 10px; margin-top: 0;">New Project Brief Submission</h2>
          <p><strong>Name:</strong> ${escapeHtml(name)}</p>
          <p><strong>Business Email:</strong> <a href="mailto:${escapeHtml(email)}">${escapeHtml(email)}</a></p>
          <p style="color: #27ae60;"><strong>✓ Email Verified via OTP</strong></p>
          <div style="background-color: #f9f9f9; padding: 15px; border-left: 4px solid #00bcd4; margin-top: 15px; border-radius: 4px;">
            <p style="margin: 0; white-space: pre-wrap;"><strong>Project Brief:</strong><br/>${escapeHtml(message)}</p>
          </div>
          <hr style="border: 0; border-top: 1px solid #eee; margin: 20px 0;" />
          <p style="font-size: 12px; color: #999; text-align: center;">Sent from your Portfolio contact form backend.</p>
        </div>
      `,
    });

    res.status(200).json({ message: 'Message sent successfully' });
  } catch (error) {
    console.error('Error saving contact:', error);
    // Server-side failure: give the one-time token back so the visitor can retry without re-verifying.
    if (tokenUsed) restoreVerificationToken(email, tokenUsed);
    res.status(500).json({ error: 'Failed to send message' });
  }
});

export default router;
