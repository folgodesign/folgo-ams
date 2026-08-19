# Deploying Folgo Pulse to Railway

Folgo Pulse deploys as **one Railway service** (the Node server serves both the
API and the built React app) plus a **Railway Postgres** database. Everything is
same-origin, so the auth cookie and API calls work with no extra CORS config.

The repo already contains everything Railway needs: a `Dockerfile`, `railway.json`,
and a `start:prod` script that applies the database schema on boot.

---

## One-time setup (~10 minutes)

### 1. Create the project and database
1. Sign in at **https://railway.app** (GitHub login is easiest).
2. **New Project → Deploy from GitHub repo → `folgodesign/folgo-ams`.**
   Railway detects the `Dockerfile` and starts building.
3. In the project, click **New → Database → Add PostgreSQL.**

### 2. Set the service variables
Open your **app service → Variables** and add:

| Variable | Value |
|---|---|
| `DATABASE_URL` | `${{Postgres.DATABASE_URL}}` (references the Postgres plugin — type it exactly) |
| `NODE_ENV` | `production` |
| `JWT_ACCESS_SECRET` | a long random string (see below) |
| `JWT_REFRESH_SECRET` | a different long random string |
| `BOOTSTRAP_SECRET` | a secret only you know — gates the first-admin setup |
| `APP_BASE_URL` | your app's public URL (fill in after step 3) |

Generate the two JWT secrets locally with:
```bash
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```
(You don't need to set `PORT` — Railway provides it and the server reads it.)

### 3. Get your public URL
1. App service → **Settings → Networking → Generate Domain.**
2. Copy the URL (e.g. `https://folgo-pulse-production.up.railway.app`).
3. Put it in the `APP_BASE_URL` variable from step 2, then **redeploy** (Deployments → Redeploy) so invite links use the right domain.

### 4. Create the first founder account
Railway starts with an **empty** database (no demo data). On first visit the app
shows a one-time setup wizard:
1. Open your public URL.
2. The **First-run setup** screen appears. Enter the org name, your name, your email
   (any address, including Gmail), a password (12+ chars), and the `BOOTSTRAP_SECRET`
   you set.
3. This creates the first founder (Shahil) as super admin. The wizard then disables
   itself permanently.
4. Log in, go to **Members → Invite**, and invite the second founder (Nazil, as
   Admin) and your team — each gets an activation link to share.

That's it. The app is live.

---

## Everyday notes

- **Deploys:** every push to the branch Railway is watching triggers a rebuild. The
  schema is re-synced automatically on each boot (`prisma db push`), so schema changes
  ship with your code.
- **Cost:** Railway starts on a small free trial credit, then usage-based (~$5/mo for
  an app this size). The Postgres plugin is included in that.
- **Backups:** enable them on the Postgres plugin (its **Settings**) — this data feeds
  payroll, so keep backups on.
- **Logs & health:** the service exposes `/health`; Railway's health check uses it.
  View logs in the service's **Deployments** tab.

## Rolling back
Railway keeps prior deployments — open **Deployments**, find a known-good one, and
click **Redeploy**. Because the schema sync is additive, rolling back the app is safe
as long as you haven't made a destructive schema change.
