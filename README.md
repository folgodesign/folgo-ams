# Folgo Pulse

An internal attendance & work-status platform for a design agency — built to the
[Product Requirements Document](./folgoattendanceprd.md). Employees check in/out
with one tap, broadcast what they're working on, and admins see — live — who is
working, on what, and for how long. Self-reported status over covert monitoring.

> **Working title:** Folgo Pulse · **Scope of this build:** the PRD's Phase-1 MVP
> plus several Phase-2 items (leave, approvals, regularisation, audit log, task
> comments, wall display).

---

## What's implemented

| PRD area | Status |
|---|---|
| **§4.1 Auth** — invite-only (no public signup), Argon2id passwords, HIBP breach check, 15-min JWT + rotating refresh token with **reuse detection**, one-time super-admin bootstrap, versioned consent, deactivate/rehire | ✅ |
| **§4.2 Check-in/out** — server-stamped times, idempotent double-tap, breaks, per-employee timezone, auto-checkout sweep, no geolocation | ✅ |
| **§4.3 Task log** — one-keystroke start, single in-progress task, pause/complete/switch/carry-over, interval-based durations, suggestions, end-of-day summary, admin comments (read, never silently edit), **admin task assignment** | ✅ |
| **§4.4 Live board** — card grid with status rings, filter chips, 480px slide-over profile panel (Now/Attendance/Activity/Profile), **SSE realtime** with pulse animation + reconnect indicator, historical date snapshots, wall/kiosk mode | ✅ |
| **§4.5 Timesheets** — personal month view, team matrix, admin correction with reason + audit trail, regularisation requests | ✅ |
| **§4.6 Policies** — work schedules, automatic day classification, holidays, leave types & balances | ✅ |
| **§4.7 Reporting** — monthly summary, dashboard widgets, top-clients, **CSV export** | ✅ |
| **§4.9 Directory / §4.10 Audit log** | ✅ |
| **§7 Design system** — dark-first Folgo brand tokens, reserved Burnt Orange accent, redundant status ring encoding, tabular timers | ✅ |

Deliberately out of scope for this build (PRD Phase 2/3 or non-goals): Google SSO
is stubbed at the UI (the server-side hosted-domain check is specced but not wired
to a live Google client), email delivery (invite links are surfaced in-app instead
of emailed), TOTP 2FA, PWA offline sync, and native apps.

---

## Stack

- **Frontend:** React + TypeScript, Vite, TailwindCSS, TanStack Query, React Router.
- **Backend:** Node + TypeScript, Express, Prisma, Zod. Realtime via SSE.
- **Database:** SQLite for self-contained dev/demo. The Prisma schema is
  Postgres-portable — switch the `datasource` provider to `postgresql` and point
  `DATABASE_URL` at a Postgres instance (the PRD's production target, ap-south-1).

The recommended production stack in PRD §11 (NestJS/Postgres/Redis/BullMQ) maps
cleanly onto this structure; the in-memory rate limiter, SSE fan-out, and
`setInterval` job runner are the three pieces that would move to Redis/BullMQ.

---

## Running it

Two processes. From the repo root:

```bash
# 1. Backend  (http://localhost:4000)
cd server
cp .env.example .env
npm install
npm run prisma:generate
npm run prisma:push      # creates the SQLite schema
npm run seed             # demo org, users, and a populated live board
npm run dev

# 2. Frontend (http://localhost:5173) — in a second terminal
cd web
npm install
npm run dev
```

Open **http://localhost:5173**. The Vite dev server proxies `/api/*` to the
backend so the refresh cookie stays first-party.

### Demo logins (from the seed)

| Role | Email | Password | Sees |
|---|---|---|---|
| Founder / Admin | `shahil@folgo.studio` | `folgopulse2026` | Everything (complete view) |
| Founder / Admin | `nazil@folgo.studio` | `folgopulse2026` | Everything (complete view) |
| Employee | `rahul@folgo.studio` (or `priya@`, `tom@`, `sara@`, `meera@`) | `folgopulse2026` | Own data + limited live board |

**Who sees what.** The two founders (Shahil & Nazil) are the only admins and get the
complete view — the full live board with check-in times, everyone's attendance and
timesheets, reports, corrections, audit log, and invites. **Employees see a limited
live board: everyone's current status and active task only** — no check-in times, no
work-hours, no attendance history, and no access to anyone else's timesheet or task
log (those endpoints return 403). This is enforced server-side, not just hidden in the
UI, and the SSE realtime stream is redacted per viewer.

The login form is pre-filled with a founder's credentials. On a **fresh
database** (delete `server/prisma/dev.db` before seeding), the login screen shows
the one-time bootstrap wizard instead.

### Tests

```bash
cd server && npm test      # classification + token-hashing units
```

---

## Layout

```
server/
  prisma/schema.prisma      # PRD §5 data model
  prisma/seed.ts            # demo org + live board
  src/lib/                  # config, prisma, crypto, tokens, time, audit, realtime
  src/middleware/           # auth (JWT + role guards), rate limiting, errors
  src/services/             # attendance/classification, tasks, status, board, jobs
  src/routes/               # auth, me, live, users, settings, clients, activity,
                            #   attendance, reports, approvals, audit
web/
  src/lib/                  # api client (transparent refresh), auth context, format, status
  src/components/           # Avatar (status ring), MemberCard, ProfilePanel, AppLayout, ui
  src/pages/                # Login, Activate, Home, LiveBoard, Members, Timesheet,
                            #   Reports, Settings, Approvals, Audit, Wall
  tailwind.config.js        # Folgo design tokens (PRD §7.2 / §14.2)
```

## Notable design decisions

- **Refresh-token reuse detection** revokes the whole token family on replay of a
  spent token (PRD F-1.4) — a stolen cookie grants 15 minutes, not a month.
- **Durations are always derived from timestamps**, never typed (PRD §4.3). A task's
  time is the sum of its `TaskInterval` rows; starting a new task atomically pauses
  the current one, so two tasks can never be in progress at once.
- **Status ≠ task.** Availability (`WORKING`/`ON_BREAK`/…) is tracked separately from
  the work log, so going to lunch doesn't destroy a task record (PRD F-3.3).
- **Status is never colour alone** — every status carries a text label and a
  redundant ring style (solid/dashed/striped/none) so the board reads in greyscale
  and for colour-blind users (PRD §14.2).
- **Orange is reserved** for primary actions, active nav, and focus rings — never a
  status colour — to keep the board scannable (PRD §7.1).
```
