import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import contactRoutes from './routes/contactRoutes.js';
import resumeRoutes from './routes/resumeRoutes.js';

/**
 * Build the Express app. No database connection or listening happens here,
 * so the app can be imported by tests. See server.js for startup.
 */
export function createApp() {
  const app = express();

  // Hosted behind one reverse proxy (Railway / Render / Koyeb): needed for correct client IPs.
  app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(helmet());

  // Production site origins are always allowed. Add more (e.g. a specific Vercel preview URL)
  // through the ALLOWED_ORIGINS env var as exact, comma-separated origins - no wildcards.
  const allowedOrigins = new Set([
    'https://www.dhrumintechnotech.in',
    'https://dhrumintechnotech.in',
    ...(process.env.ALLOWED_ORIGINS || '')
      .split(',')
      .map((o) => o.trim().replace(/\/+$/, ''))
      .filter(Boolean),
  ]);

  app.use(
    cors({
      origin(origin, callback) {
        // Allow server-to-server requests (no origin)
        if (!origin) return callback(null, true);

        const isAllowed =
          allowedOrigins.has(origin) ||
          /^http:\/\/localhost(:\d+)?$/.test(origin) ||
          /^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin);

        if (isAllowed) return callback(null, true);
        const err = new Error('CORS: origin not allowed');
        err.status = 403;
        return callback(err);
      },
      credentials: true,
    })
  );

  // The contact form only ever sends a few short text fields.
  app.use(express.json({ limit: '10kb' }));

  const limiter = (windowMs, limit) =>
    rateLimit({
      windowMs,
      limit,
      standardHeaders: 'draft-7',
      legacyHeaders: false,
      message: { error: 'Too many requests. Please try again later.' },
    });

  app.use('/api', limiter(15 * 60 * 1000, 200));
  app.use('/api/contact/send-otp', limiter(60 * 60 * 1000, 10));
  app.use('/api/contact/verify-otp', limiter(15 * 60 * 1000, 20));
  app.post('/api/contact', limiter(60 * 60 * 1000, 10));

  app.get('/api/health', (req, res) => res.status(200).json({ status: 'ok' }));

  app.use('/api/contact', contactRoutes);
  app.use('/api/resume', resumeRoutes);

  app.use((req, res) => res.status(404).json({ error: 'Not found' }));

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const status = err.status || err.statusCode || 500;
    if (status >= 500) console.error('Unhandled error:', err.message);
    const messages = { 400: 'Invalid request.', 403: 'Forbidden.', 413: 'Request body too large.' };
    res.status(status).json({ error: messages[status] || (status >= 500 ? 'Internal server error.' : 'Request failed.') });
  });

  return app;
}

export default createApp();
