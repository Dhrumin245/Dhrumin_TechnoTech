# CI/CD Pipeline

GitHub Actions validates every change and deploys the frontend to Vercel from `main`.
Files: `.github/workflows/ci-cd.yml`, `.github/workflows/codeql.yml`, `.github/dependabot.yml`.

## What runs

| Job | When | What it does |
| :--- | :--- | :--- |
| **Backend - test** | every push / PR | `npm ci`, syntax-checks `server.js` + `app.js`, runs the backend test suite (unit **and security tests**). |
| **Frontend - lint, test, build** | every push / PR | `npm ci`, ESLint, Vitest, production build. Then two guards: no admin/CMS code in the bundle, and the CSP hash in `vercel.json` matches the built `index.html`. Uploads the `dist` artifact. |
| **Security - dependency audit** | every push / PR | `npm audit --omit=dev --audit-level=high` for Backend and my-app. Fails on high/critical advisories in production dependencies. |
| **Deploy - Vercel (production)** | push to `main`/`master`, after the three jobs above pass | `vercel pull` → `vercel build --prod` → `vercel deploy --prebuilt --prod`. **Skipped automatically** until the three Vercel secrets exist. |
| **Smoke test - API health** | after deploy, only if `API_HEALTH_URL` is set | Calls your backend's `/api/health` up to 5 times. |
| **CodeQL** (separate workflow) | push / PR / weekly | GitHub's static security analysis (`security-extended` queries). |

Dependabot opens weekly PRs for npm dependencies and monthly PRs for GitHub Actions.

## Setup (Settings → Secrets and variables → Actions)

**Secrets** (only needed for the Vercel deploy job):

| Name | Where to find it |
| :--- | :--- |
| `VERCEL_TOKEN` | Vercel → Account Settings → Tokens |
| `VERCEL_ORG_ID`, `VERCEL_PROJECT_ID` | `.vercel/project.json` after running `npx vercel link` once |

**Variables** (optional):

| Name | Purpose |
| :--- | :--- |
| `VITE_API_URL` | Backend URL baked into the CI build check |
| `API_HEALTH_URL` | e.g. `https://your-backend.example.com/api/health` - enables the smoke test |

## Notes

- **Backend deploys** are not done by this workflow. Keep using your host's GitHub integration (Railway/Render/Koyeb); it will deploy from `main`. Make sure its health check points to `/api/health`.
- **Double deploys:** if Vercel's own Git integration is already enabled for this repo, either disable it or leave the secrets unset so only one of the two deploys.
- **Vercel Root Directory:** the workflow runs the Vercel CLI from the repo root. If your Vercel project has *Root Directory = `my-app`*, that works as-is (the CLI reads the project setting). If it has no Root Directory set, add `working-directory: my-app` to the three Vercel steps.
- **Backend CORS** only trusts `https://www.dhrumintechnotech.in`, `https://dhrumintechnotech.in` and localhost by default. If the site is ever served from another origin (a Vercel project URL, a preview, staging), add that exact origin to the backend's `ALLOWED_ORIGINS` env var (comma-separated, no wildcards) - otherwise the contact form will get a 403.
- **GitHub Pages** is no longer part of the pipeline: the site is a BrowserRouter SPA served from a custom domain on Vercel, which Pages cannot host correctly without extra routing workarounds.
- **Changing your backend URL?** The CSP in `my-app/vercel.json` only lets the browser talk to your API origin (`connect-src`). Update it there when the backend moves; if the repo variable `VITE_API_URL` is set, CI fails when it isn't allowed.
- **Editing `index.html`'s inline analytics script?** The CSP in `my-app/vercel.json` pins its SHA-256. The frontend test `csp.test.js` and the CI guard will fail until you update the hash in `vercel.json`.
- Run the same checks locally: `npm test --prefix Backend`, `npm run lint --prefix my-app`, `npm test --prefix my-app`, `npm run build --prefix my-app`.
