# AccessReady — WCAG Contrast Auditor

Audit websites for WCAG 2.2 AA color contrast violations. Powered by axe-core and Playwright. Screenshots and findings are saved and available for review.

## Prerequisites

- **Node.js** ≥ 18
- **ngrok** — install via `brew install ngrok` (macOS) or download from [ngrok.com](https://ngrok.com/download). Required for sharing the local app with teammates.
- **Google Chrome / Chromium** — Playwright needs a local browser. Run `npm run setup` after install.

## Quick Start (First-Time Setup)

```bash
# 1. Clone the repo
git clone <repo-url>
cd AccessReady

# 2. Install dependencies (auto-creates the SQLite database)
npm install

# 3. Configure environment
cp .env.example .env

# 4. Install Playwright Chromium (one-time, ~92 MB)
npm run setup

# 5. Authenticate ngrok (one-time, team token is in .env)
ngrok config add-authtoken 3HZZjJzIx5CLpAM0vZI5g1l5j0d_6jXoUB3M3MtQ3Za9NsWGz

# 6. Build production + start ngrok
npm run dev:ngrok
```

The app will be available at:
- **Local:** http://localhost:3000
- **Public:** The ngrok URL shown in the terminal

## Daily Development

```bash
# Local dev with hot reload (port 3001):
npm run dev

# Share via ngrok (builds production mode, starts ngrok):
npm run dev:ngrok
```

> **Why production mode for ngrok?** Next.js dev mode uses WebSocket-based HMR (Hot Module Replacement). Ngrok's free tier rejects WebSocket connections, which prevents React from hydrating. Production mode has no WebSockets and works through ngrok without issues.

## Available Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start dev server with HMR on port 3000 |
| `npm run build` | Build for production |
| `npm start` | Start production server on port 3000 |
| `npm run setup` | Install Playwright Chromium browser binary |
| `npm run dev:ngrok` | Build, start, and expose via ngrok |
| `npm run db:setup` | Manually create/update SQLite database tables |
| `npm test` | Run tests with Vitest |

## Environment Variables

Copy `.env.example` to `.env` — the defaults work for local development.

| Variable | Required | Description |
|----------|----------|-------------|
| `DATABASE_URL` | No (has fallback) | SQLite file path. Defaults to `file:./prisma/accessready-dev.db` |
| `NGROK_AUTH_TOKEN` | Yes (for ngrok) | Shared team ngrok auth token |
| `BROWSERLESS_WS_ENDPOINT` | No | Remote browser for serverless (falls back to local Chromium) |
| `NVIDIA_API_KEY` | No | Enables AI-powered image alt-text analysis |
| `TURSO_DATABASE_URL` | No | Production database (Turso/libsql) |

## Architecture

```
src/
├── app/
│   ├── layout.tsx          # Root layout + theme init
│   ├── page.tsx            # Home page (scan form + recent scans)
│   ├── globals.css         # Global styles
│   └── api/scans/          # Scan REST API routes
├── components/
│   ├── scan-form.tsx       # "Start A Scan" form (client component)
│   ├── theme-init.tsx      # Dark mode initializer (client component)
│   ├── theme-toggle.tsx    # Dark/light theme toggle button
│   └── ui/                 # Reusable UI primitives
├── lib/
│   ├── db.ts               # Prisma client (lazy proxy, local/Turso)
│   ├── scan.ts             # Playwright + axe-core scan engine
│   ├── contrast.ts         # WCAG contrast ratio math
│   └── scan-metadata.ts    # Product types, markets, industries
└── proxy.ts                # Ngrok interstitial bypass + CORS
```

## How Scans Work

1. User enters a URL + metadata (product type, target market, industry)
2. **POST /api/scans** → creates a scan record, returns ID
3. Client navigates to `/scans/[id]` while **POST /api/scans/[id]/process** runs the scan
4. Playwright (local Chromium or Browserless.io) opens the page, runs axe-core, takes screenshots
5. Results are saved to SQLite and displayed on the scan detail page

## License

Private — AccessReady team.
