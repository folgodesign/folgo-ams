# Folgo Attendance & Work Status Platform
## Product Requirements Document

| Field | Value |
|---|---|
| Product name | Folgo Pulse (working title) |
| Document version | v1.1 (brand system applied) |
| Date | 19 August 2026 |
| Owner | Folgo Product / Ops |
| Status | Draft for review |

---

## 1. Overview

### 1.1 Summary
Folgo Pulse is an internal web application that lets agency employees check in and out of their workday, broadcast what they are currently working on, and lets admins see — live — who is working, on what, and for how long. It replaces informal Slack/WhatsApp stand-ups and manual timesheets with a single source of truth for attendance and work hours.

### 1.2 Problem
Today the agency has no reliable answer to three recurring questions:

1. **Who is working right now?** Managers ping people individually to find out.
2. **How many hours did someone actually work this month?** Attendance is reconstructed from memory, chat logs, or trust.
3. **What is everyone working on at this moment?** Client escalations require chasing people to find who is free or who owns a task.

The cost is manager time, payroll disputes, missed client SLAs, and no historical data to plan capacity.

### 1.3 Goals
- **G1** — Give every employee a one-click way to start, pause, and end their workday.
- **G2** — Give admins a real-time "who's live" board showing current status and current task.
- **G3** — Produce accurate, exportable timesheets with zero manual data entry.
- **G4** — Keep the daily interaction under 15 seconds so people actually use it.

### 1.4 Non-goals (v1)
- Not a project management tool. It records *what* someone is working on as free text or a linked task, but does not manage boards, sprints, or dependencies.
- Not a payroll processor. It exports data; it does not calculate salary or file taxes.
- Not a screenshot/keystroke surveillance tool. Folgo explicitly chooses self-reported status over covert monitoring. (See §11.3.)
- Not a client-facing time billing tool in v1 (see Phase 3 roadmap).

### 1.5 Success metrics

| Metric | Target (90 days post-launch) |
|---|---|
| Daily active check-in rate | ≥ 90% of active employees on working days |
| Status updates per active user per day | ≥ 2 |
| Missing/incomplete attendance records requiring admin correction | < 5% of records |
| Time to answer "who is available right now" | < 10 seconds (from ~5 min today) |
| Payroll-hour disputes per month | 0–1 (baseline: unmeasured, est. 3–5) |
| Median check-in interaction duration | < 15 seconds |

---

## 2. Users and roles

### 2.1 Personas

**Employee (Designer, Developer, Copywriter, Account Manager)**
Wants to log in, hit check in, type what they're doing, and get back to work. Resents anything that feels like surveillance or bureaucracy. Works from office some days, home others.

**Admin / Team Lead**
Needs to see the live floor, spot who is idle vs heads-down, catch chronic lateness early, approve leave, and pull a clean hours report at month end without chasing anyone.

**Owner / Super Admin**
Cares about capacity, billable-hour trends, and cost. Needs org-wide reports and control over who has admin rights.

### 2.2 Role permission matrix

| Capability | Employee | Team Lead | Admin | Super Admin |
|---|---|---|---|---|
| Check in / out, update own status | ✅ | ✅ | ✅ | ✅ |
| View own timesheet & history | ✅ | ✅ | ✅ | ✅ |
| Request leave / regularisation | ✅ | ✅ | ✅ | ✅ |
| View live board (own team) | ✅ (limited) | ✅ | ✅ | ✅ |
| View live board (all teams) | ❌ | ❌ | ✅ | ✅ |
| View others' full timesheets | ❌ | ✅ (own team) | ✅ | ✅ |
| Edit/correct attendance records | ❌ | ❌ | ✅ | ✅ |
| Approve leave & regularisation | ❌ | ✅ (own team) | ✅ | ✅ |
| Export reports | ❌ | ✅ (own team) | ✅ | ✅ |
| Invite / deactivate users | ❌ | ❌ | ✅ | ✅ |
| Manage roles, work policies, holidays | ❌ | ❌ | ✅ | ✅ |
| Billing, delete org, transfer ownership | ❌ | ❌ | ❌ | ✅ |
| View audit log | ❌ | ❌ | ✅ | ✅ |

> **Decision needed:** whether employees can see the full live board or only their own team. Default in v1: employees see the whole agency board (small team, transparency is a feature), toggleable in settings.

---

## 3. Core concepts and states

### 3.1 Attendance session
A **session** is one continuous check-in → check-out block. A day can contain multiple sessions (e.g. checked out for a client visit, checked back in).

```
                 ┌──────────────┐
   check in ────►│   WORKING    │◄──── resume
                 └──────┬───────┘
                        │ start break
                        ▼
                 ┌──────────────┐
                 │  ON BREAK    │
                 └──────┬───────┘
                        │ check out
                        ▼
                 ┌──────────────┐
                 │  CHECKED OUT │
                 └──────────────┘
```

### 3.2 Live status values

| Status | Meaning | Counts toward work hours | Set by |
|---|---|---|---|
| `WORKING` | Actively working | ✅ | Employee (check in) |
| `ON_BREAK` | Lunch, coffee, personal | ❌ | Employee |
| `IN_MEETING` | Call or meeting | ✅ | Employee |
| `FOCUS` | Do-not-disturb deep work | ✅ | Employee |
| `AWAY` | Stepped out, will return | ❌ | Employee or auto (idle) |
| `CHECKED_OUT` | Day ended | ❌ | Employee or auto |
| `ON_LEAVE` | Approved leave | ❌ | System (from leave record) |

### 3.3 Current task ("what I'm working on")
Free-text field, max 140 characters, optionally tagged with a **client** and a **project**. Shown on the live board next to the person's name. Every change is stored as a timestamped `status_update` record, producing a chronological activity log per person per day.

Example: `Revising homepage wireframes — Acme Corp · Website Redesign`

---

## 4. Feature requirements

### 4.1 Authentication & account management

**There is no public signup.** Records here feed payroll, so accounts exist only when an admin creates them. No `/signup` route exists; an uninvited visitor sees only a login form.

**F-1.1 Admin creates the account**
- Settings → People → Invite. Fields: work email, name, role, team, designation, employee code, reporting manager, work schedule, start date, timezone.
- CSV bulk import for the initial rollout of existing staff.
- Creates a `User` with status `invited` — visible in the directory as pending, cannot log in.

**F-1.2 Invitation token**
- 32-byte cryptographically random token, stored **hashed**, so a database leak does not yield working invite links.
- Single-use, expires in 7 days, resendable. Resending invalidates the prior token.
- Delivered by email; the link is the only activation path.

**F-1.3 Activation (first-time setup)**
Two credential paths:
- **Google Workspace SSO — primary.** The Google account must match the invited address exactly, and the hosted-domain claim is verified **server-side** against Folgo's Workspace domain. No password is created.
- **Email + password — fallback** for anyone outside Workspace (contractors, freelancers). Minimum 12 characters, checked against known-breach lists via the HIBP k-anonymity API, strength meter shown. No forced rotation and no symbol-composition rules — those produce worse passwords, not better ones.

Then:
- **Profile completion** — photo, phone, confirm designation. The photo matters more than in most tools because the live board is avatar-driven and an initials card is a visibly worse experience. Nudge for it; do not block on it.
- **Consent screen** — plain-language page stating what is recorded (check-in times, task log entries, IP address), who can see it, retention period, and the employee's right to view and export their own data. Acknowledgement is timestamped and **versioned**, so a later policy change tells you who agreed to what. This satisfies DPDP notice obligations and makes §10.1's trust principles concrete on day one.
- Land on the home screen with a first-run tooltip on the check-in button.

**F-1.4 Returning login**
- Google SSO or email + password.
- 15-minute JWT access token; rotating refresh token in an httpOnly, Secure, SameSite=Lax cookie, 30 days with "remember this device."
- **Refresh-token reuse detection:** replaying an already-spent refresh token means it was stolen, so the whole token family is revoked and re-authentication is forced. This is the difference between a stolen cookie granting a month of access versus fifteen minutes.
- Rate limit: 5 failed attempts per 15 minutes, keyed on **both** account and IP, exponential backoff.
- Login and forgot-password responses are **identical whether or not the email exists** — otherwise the form becomes an employee-directory enumerator.
- Password reset: 30-minute single-use token; a successful reset revokes every existing session.

**F-1.5 Two-factor**
- Optional TOTP for employees.
- **Mandatory for Admin and Super Admin.** An admin can edit attendance records, which means they can change what people are paid. That account needs a second factor.

**F-1.6 Deactivation & rehire**
- Admins deactivate, never delete. Historical data is retained and still appears in past reports; the person is greyed out in the directory.
- Active sessions terminate within 60 seconds of deactivation, and any open work session is auto-closed at that timestamp.
- **Rehire reactivates the original account.** Never create a second record, or the person's history detaches from them.

**F-1.7 Bootstrap**
- The first Super Admin is created by a one-time setup wizard on deployment, permanently disabled after first use.

**Edge-case behaviour**

| Situation | Behaviour |
|---|---|
| Expired invite | Clear page: "This invite has expired," with a button that notifies the admin to resend. Never a 404 |
| Already-activated user clicks invite again | Simply logs them in |
| Deactivated user attempts login | Generic "this account is not active — contact your admin." No further detail |
| Email change | Admin-initiated, verified at the new address before taking effect |

**Acceptance criteria**
- No route in the application allows account creation without a valid unexpired invite token.
- An SSO login whose Google domain does not match the configured Workspace domain is rejected server-side even if the email matches.
- Invite tokens are never stored in plaintext anywhere, including logs.
- Consent acknowledgement is recorded with policy version and timestamp before the user reaches the home screen.

---

### 4.2 Check-in / check-out (employee)

**F-2.1 Check in**
- Single primary button on the employee home screen: **Check in**.
- On tap: prompts for "What are you working on?" (skippable — do not block check-in on text entry).
- Records timestamp (server-side, UTC), device type, IP address, and — if enabled — geolocation.
- Button transforms into a running timer showing elapsed work time for the day.

**F-2.2 Check out**
- Confirmation modal: shows total hours worked, break time, and asks for an optional end-of-day note.
- Warns if checking out under the minimum day threshold (configurable, default 4 hours) — but allows it.

**F-2.3 Breaks**
- **Start break** button while working; a break type can be selected (Lunch, Short break, Personal). Break timer runs.
- **End break** returns status to `WORKING`.
- Break time is subtracted from net work hours.
- Configurable auto-deduct: e.g. deduct a fixed 45 min lunch regardless of logging (off by default).

**F-2.4 Location — cut from scope**

The v1.0 draft specced IP allowlisting and geofencing. **Both are removed.** The team is remote-first, so there is no office perimeter to check against, and a geofence on a remote workforce means asking people to hand over their home coordinates to their employer — which buys nothing operationally and costs real trust.

What replaces it:
- No geolocation is collected. At all.
- IP is recorded on the session purely as a security signal (impossible-travel detection, account-compromise investigation), is visible to the employee on their own record, and is never surfaced as a productivity or presence signal.
- No office/remote badge on the live board. Everyone is remote; the distinction carries no information.
- **Timezone per employee** replaces location as the meaningful field. The live board shows local time next to anyone whose timezone differs from the org default, so an admin in Kochi doesn't ping someone at 11pm their time.

**F-2.5 Forgot-to-check-out handling**
- If a session is still open at the configured cutoff (default 11:59 PM local), the system auto-checks-out at the last recorded activity timestamp and flags the record `AUTO_CLOSED`.
- The employee sees a prompt on their next login to confirm or correct the end time (creates a regularisation request).

**Acceptance criteria**
- Timestamps are always server-generated; client-supplied times are ignored for the authoritative record.
- Double-tapping check in does not create two sessions (idempotent within a 5-second window).
- Checking in twice without checking out is impossible — the UI only ever offers the valid next action.

---

### 4.3 Task log

The v1.0 draft treated "what I'm working on" as a status string. With a remote team and an admin who needs a record of work done, that isn't enough — a status string tells you the present moment and forgets it. This section replaces it with a **task log**: a durable, timestamped record of what each person worked on, how long it took, and whether it finished.

**The design constraint that governs everything here:** one task = one line of typing. The moment logging feels like filling in a form, remote staff will batch-write fiction at 6pm and the data becomes worthless. Duration is always derived from timestamps, never typed.

#### 4.3.1 Concept

A **Task** is a unit of work with a start and an end. Starting a task is how you say what you're doing; your current task *is* the in-progress one. There is no separate "status text" field.

```
  Start task ──► IN_PROGRESS ──┬── Complete ──► COMPLETED
                     ▲          │
                     │          ├── Pause ────► PAUSED ──► (resume)
                  resume        │
                     │          └── Carry over ► CARRIED_OVER (rolls to next day)
                     └──────────────────────────────┘
```

Only one task is `IN_PROGRESS` per person at a time. Starting a new one auto-pauses the current one — no bookkeeping required from the employee.

#### 4.3.2 Employee-facing behaviour

**F-3.1 Start a task**
- Single input on the home screen: "What are you working on?" Type, press Enter, done.
- Optional inline tagging: `@client` and `#project` typed directly in the field resolve against admin-managed lists, so tagging costs no extra clicks. Also selectable from dropdowns.
- Recent and carried-over tasks appear as one-tap suggestions — most work is continuous, so the common case should be tapping yesterday's task, not retyping it.
- Timer starts immediately.

**F-3.2 Complete, pause, or switch**
- ✓ **Complete** — marks done, stamps `ended_at`, prompts (skippable) for a one-line outcome note.
- ⏸ **Pause** — for interruptions; accumulated time is preserved and resumes on restart.
- **Switch** — starting a new task pauses the current one automatically.
- Anything left `IN_PROGRESS` at check-out is offered as complete / carry over / pause.

**F-3.3 Status (separate from tasks)**
- Quick selector: `WORKING` / `IN_MEETING` / `FOCUS` / `AWAY` / `ON_BREAK`, plus optional "back in X minutes" for `AWAY`.
- Status answers *availability*; tasks answer *work*. Keeping them separate means going for lunch doesn't destroy your task record, and being heads-down doesn't require inventing a task entry.

**F-3.4 End-of-day summary**
- At check-out, the system shows what it already knows: today's tasks, their durations, and completion states. The employee confirms, edits, or adds anything logged offline, plus an optional free-text note.
- This is the *only* moment the employee is asked to reflect on the whole day, and it takes seconds because the data is already there.
- Configurable: required, optional, or off. Default optional.

**F-3.5 Nudges**
- After N hours (default 3) on one unchanged in-progress task, a dismissible in-app nudge: "Still on this? Update or complete it." Maximum 2 per day, never blocking.
- No nudge is ever sent to a manager about an employee's logging behaviour. Nudges are between the employee and the app.

#### 4.3.3 Admin-facing views

**F-3.6 Person day log**
Vertical timeline for one person on one date: check-in, each task with start/end/duration/state, status changes, breaks, check-out, end-of-day note. This is the "Activity" tab in the profile side panel (§4.4.4).

**F-3.7 Person range log**
Same person across a date range, grouped by day, with per-task and per-day totals. Filterable by client, project, and completion state.

**F-3.8 Team activity feed**
Chronological org-wide or team-wide stream of task events: *"Rahul completed 'Acme homepage revisions' — 2h 40m."* Filterable by person, team, client, project, date. This is the screen that answers "what did the team actually do last week" without opening eleven profiles.

**F-3.9 Task search**
Full-text search across task titles and notes, scoped by permission. Useful for "when did we last touch the Acme brand guidelines."

**F-3.10 Task reports**
- Time by client, by project, by person, by date range
- Completed vs carried-over ratio per person (a workload signal — chronic carry-over usually means over-assignment, not slacking)
- Logged task time vs checked-in hours, as a **data-quality indicator only**, flagged to the employee first, not the manager

**F-3.11 Immutability & edits**
- Task entries are append-only in effect: edits are permitted within the same day, or later via the regularisation flow (§4.5.4), and every edit is versioned with before/after.
- Admins can **view** and comment on task logs. Admins **cannot silently edit** an employee's task text — the log is the employee's own account of their work. Admin corrections to *times* go through the audited attendance-correction path.

**Acceptance criteria**
- Starting a task requires exactly one field and one keystroke to commit.
- Two tasks can never be `IN_PROGRESS` for one user simultaneously; the transition is atomic server-side.
- Task durations sum correctly across pause/resume cycles and never exceed the session's elapsed time.
- Task events appear on the admin live board and activity feed within 5 seconds.
- Task text supports emoji, is stored as plain text, and is escaped on render.
- An employee can export their own complete task history at any time without asking an admin.

#### 4.3.4 A warning worth writing into the spec

Task logs on a remote team drift toward theatre. If people believe the log is being read as a productivity score, they will write to the score — padding entries, splitting one task into four, logging the visible work and omitting the thinking. The data degrades exactly as its perceived stakes rise.

Three mitigations are baked into the design above, and they should survive contact with the first manager who asks for a leaderboard:
1. **No ranking.** No per-person productivity score, no leaderboard, no comparative "tasks completed" chart in the standard reports.
2. **Logged-time-vs-hours discrepancies go to the employee, not the manager.** It's a reminder to log, not a gap to explain.
3. **Admins read, employees write.** An admin who wants a task record corrected asks for it; they don't rewrite it.

---

### 4.4 Live board (admin) — *primary screen, modelled on the reference design*

This is the screen the uploaded reference image maps to. Layout mirrors it deliberately: a filter bar, a card grid of people, and a right-hand slide-over profile panel.

**F-4.1 Grid of member cards**
Each card shows:
- Avatar photo (initials-on-colour fallback, as with "JD" in the reference)
- Name
- Current task text, truncated with ellipsis
- **Status ring / dot** around the avatar — colour-coded by status (green `WORKING`, blue `IN_MEETING`, purple `FOCUS`, amber `ON_BREAK`, grey `AWAY`/`CHECKED_OUT`, striped `ON_LEAVE`)
- Elapsed time in current status (e.g. "2h 14m")
- Check-in time
- Local time, shown **only** when the person's timezone differs from the org default

**F-4.2 Sorting & grouping**
- Default: currently working first, then on break, then away, then checked out, then on leave.
- Toggle: group by team, or flat list.
- Header count reads `Members (N)` with a live "N working now" sub-count.

**F-4.3 Filters** (chip row, matching the reference: `+ Name`, `+ Team`, `+ Status`, `+ Client`, `+ Location`, `+ Add filter`)
- Name search (typeahead)
- Team / department
- Status
- Client / project currently worked on
- Timezone (for distributed teams)
- Date (defaults to today; past dates render a historical snapshot of that day)

**F-4.4 Profile side panel**
Opens on card click, slides in from the right, closes with ✕ or Esc. Tabs:

- **Now** — current status, current task with running timer, check-in time, local time if different, today's timeline.
- **Attendance** — last 30 days: date, in, out, break, net hours, status (Present / Late / Half-day / Absent / Leave / Holiday).
- **Activity** — chronological list of status updates across a selected range.
- **Profile** — email, phone, designation, team, employee ID, date joined, reporting manager, work schedule assigned, tags.

Header actions (mirroring the reference's icon row): **Message** (opens Slack/email deep link), **Copy profile link**, **View timesheet**, **Edit** (admin only).

**F-4.5 Realtime behaviour**
- Board updates without refresh via WebSocket (or SSE). Fallback: poll every 30 seconds.
- A subtle animation on status change (card border pulses once) so admins notice movement.
- "Last synced" indicator; reconnect banner if the socket drops.

**F-4.6 TV / wall-display mode**
- Full-screen, chrome-free variant of the grid, larger type, auto-refreshing — for a monitor in the studio. Read-only, accessed via a signed link so it needs no login on the display device.

**Acceptance criteria**
- Board renders under 2 seconds with 100 members.
- Every card is keyboard-focusable; Enter opens the panel.
- With zero members checked in, an empty state reads "Nobody's checked in yet" rather than an empty grid.

---

### 4.5 Timesheets & attendance records

**F-5.1 Personal timesheet (employee)**
- Calendar month view with a colour per day status.
- Row detail: date, check-in, check-out, breaks, net hours, overtime, status, notes.
- Running totals: days present, total hours, average hours/day, late arrivals, leaves taken.

**F-5.2 Team timesheet (admin)**
- Table: rows = employees, columns = days of the selected month, cells = net hours with status colour.
- Click any cell to open and edit that record.
- Column totals and per-employee totals.

**F-5.3 Manual correction (admin)**
- Admin can edit check-in/out times on any record.
- Every edit requires a reason and is written to the audit log with before/after values.
- Edited records display an "edited" marker visible to the employee.

**F-5.4 Regularisation requests (employee)**
- Employee can request a correction for a missed/incorrect record: proposed times + reason.
- Routes to their manager, then reflects in the timesheet once approved.
- Configurable window: requests only allowed for the last N days (default 7).

**Acceptance criteria**
- Net hours = (sum of session durations) − (sum of break durations), computed server-side, never trusted from the client.
- A record can never have check-out earlier than check-in; validation blocks it with a clear message.

---

### 4.6 Attendance rules & policies (admin settings)

**F-6.1 Work schedules**
- Named schedules (e.g. "Standard 10–7", "Early shift", "Flexible 8h").
- Per schedule: working days, start time, end time, required daily hours, grace period for late arrival (default 15 min), half-day threshold, break allowance.
- Assign a schedule per employee or per team.

**F-6.2 Automatic day classification**

| Condition | Classification |
|---|---|
| Checked in within grace period, met required hours | Present |
| Checked in after grace period | Present (Late) |
| Hours ≥ half-day threshold but < required | Half-day |
| Hours > 0 but < half-day threshold | Short day (flagged) |
| No check-in, working day, no leave | Absent |
| Approved leave | On Leave |
| Configured holiday or non-working day | Holiday / Weekly off |
| Hours > required + overtime threshold | Overtime `Xh Ym` |

**F-6.3 Holiday calendar**
- Admin-managed list of holidays with date and name; supports region-specific sets. Holidays are excluded from absence calculations.

**F-6.4 Leave management (light)**
- Leave types with annual quotas (Casual, Sick, Earned, Unpaid, Comp-off).
- Employee applies with dates, type, half-day flag, and reason; manager approves or rejects with a note.
- Approved leave auto-populates the timesheet and shows on the live board.
- Balance tracker per employee per type.

---

### 4.7 Reporting & export

**F-7.1 Standard reports**
- Monthly attendance summary (per employee: present, absent, late, half-days, leaves, total hours, overtime)
- Daily attendance register
- Late arrival / early departure report
- Overtime report
- Time-by-client and time-by-project report (from status update tagging)
- Absence trend by employee and by team

**F-7.2 Export**
- CSV and XLSX for every report; PDF for the monthly summary (for payroll handoff and records).
- Scheduled email: monthly summary auto-sent to admins on the 1st of each month.

**F-7.3 Dashboard widgets (admin home)**
- Working now / total headcount
- Today: present, absent, late, on leave
- Average hours this week vs last week
- Attendance rate trend (30 days)
- Top clients by logged time this month

---

### 4.8 Notifications

| Trigger | Channel | Recipient |
|---|---|---|
| Not checked in 30 min after schedule start | In-app + email | Employee |
| Still checked in 1 hour after schedule end | In-app | Employee |
| Auto-checkout applied | Email | Employee + manager |
| Leave request submitted | In-app + email | Manager |
| Leave approved/rejected | In-app + email | Employee |
| Regularisation request submitted / decided | In-app + email | Manager / Employee |
| Employee absent with no leave, 1 hour after start | In-app | Manager |
| Monthly report ready | Email | Admins |

Every notification type is individually toggleable per user in preferences. Optional Slack integration posts a daily check-in summary to a channel (Phase 2).

---

### 4.9 Employee directory
A members grid identical in structure to the live board but sorted alphabetically and showing profile info rather than live status — this is the "Members (3)" view in the reference image. Serves as the agency's people directory: photo, name, designation, team, email, tags.

---

### 4.10 Audit log
Immutable record of: attendance edits, role changes, policy changes, user deactivation, leave approvals, export downloads, login events. Fields: actor, action, target, before/after, timestamp, IP. Admin-viewable, filterable, exportable. Retained 24 months.

---

## 5. Data model

```
Organisation
  id, name, logo_url, timezone, created_at, settings_json

User
  id, org_id, name, email, phone, avatar_url, employee_code,
  designation, team_id, manager_id, role (employee|lead|admin|super_admin),
  work_schedule_id, date_joined, status (active|invited|deactivated),
  password_hash, sso_provider, last_seen_at

Team
  id, org_id, name, lead_id

WorkSchedule
  id, org_id, name, working_days[], start_time, end_time,
  required_hours, grace_minutes, half_day_threshold_hours,
  break_allowance_minutes, auto_deduct_break_minutes

AttendanceDay              -- one per user per date, derived + cached
  id, user_id, date, first_check_in, last_check_out,
  total_worked_minutes, total_break_minutes, overtime_minutes,
  classification (present|late|half_day|short|absent|leave|holiday|weekly_off),
  is_edited, edited_by, edit_reason

Session                    -- one per check-in → check-out
  id, user_id, attendance_day_id, check_in_at, check_out_at,
  check_in_ip, check_out_ip, check_in_lat, check_in_lng,
  location_type (office|remote|out_of_bounds), device, 
  auto_closed (bool), note

Break
  id, session_id, started_at, ended_at, type (lunch|short|personal)

StatusUpdate                       -- availability only, not work content
  id, user_id, session_id, status, started_at, ended_at, note

Task                               -- the work log
  id, user_id, org_id, title, note, client_id, project_id,
  state (in_progress|paused|completed|carried_over|cancelled),
  started_at, ended_at, accumulated_seconds,
  carried_from_task_id, created_via (web|mobile|offline_sync),
  edited_at, edited_by

TaskInterval                       -- one row per start/resume → pause/complete
  id, task_id, started_at, ended_at

TaskComment                        -- admin/lead comment on a logged task
  id, task_id, author_id, body, created_at

DailySummary
  id, user_id, date, note, confirmed_at

Client / Project
  id, org_id, name, colour, is_active   (project has client_id)

LeaveType
  id, org_id, name, annual_quota, is_paid

LeaveRequest
  id, user_id, leave_type_id, start_date, end_date, is_half_day,
  reason, status (pending|approved|rejected|cancelled),
  decided_by, decided_at, decision_note

RegularisationRequest
  id, user_id, attendance_day_id, proposed_check_in, proposed_check_out,
  reason, status, decided_by, decided_at

Holiday
  id, org_id, date, name, region

Notification
  id, user_id, type, payload_json, read_at, created_at

AuditLog
  id, org_id, actor_id, action, entity_type, entity_id,
  before_json, after_json, ip, created_at
```

**Time handling:** all timestamps stored in UTC. Each organisation has a display timezone (default `Asia/Kolkata`); all rendering and day-boundary logic uses it. Daily aggregates are recomputed whenever an underlying session or break changes.

---

## 6. API surface (REST, illustrative)

```
POST   /auth/login
POST   /auth/google
POST   /auth/forgot-password
POST   /auth/reset-password

GET    /me
PATCH  /me
GET    /me/today                     -- current session, status, timers
POST   /me/check-in                  -- body: { first_task_title? }
POST   /me/check-out                 -- body: { note?, resolve_open_tasks[] }
POST   /me/breaks                    -- start break
PATCH  /me/breaks/:id                -- end break
POST   /me/status                    -- body: { status, back_in_minutes? }

POST   /me/tasks                     -- start: { title, client_id?, project_id? }
PATCH  /me/tasks/:id                 -- { state: paused|completed|carried_over, note? }
GET    /me/tasks?date= | ?from=&to=
GET    /me/tasks/suggestions         -- recent + carried-over, for one-tap restart
POST   /me/daily-summary             -- { date, note, confirmed: true }
GET    /me/export                    -- employee's own full data export

GET    /me/timesheet?month=YYYY-MM
POST   /me/regularisations
GET    /me/leave-balance
POST   /me/leave-requests

GET    /live                         -- live board payload
WS     /live/stream                  -- realtime status pushes

GET    /users?team=&status=&q=
POST   /users/invite
PATCH  /users/:id
DELETE /users/:id                    -- soft deactivate
GET    /users/:id/attendance?from=&to=
GET    /users/:id/tasks?date= | ?from=&to=
POST   /users/:id/tasks/:taskId/comments
GET    /activity?team=&client=&project=&from=&to=   -- team activity feed
GET    /tasks/search?q=&scope=

PATCH  /attendance/:dayId            -- admin correction, requires reason
GET    /reports/monthly?month=&team=
GET    /reports/export?type=&format=csv|xlsx|pdf

GET    /settings/schedules   POST /settings/schedules   PATCH /settings/schedules/:id
GET    /settings/holidays    POST /settings/holidays
GET    /settings/leave-types POST /settings/leave-types
GET    /clients              POST /clients
GET    /projects             POST /projects
GET    /audit-log?actor=&action=&from=&to=
```

Auth via short-lived JWT access token (15 min) + rotating refresh token in an httpOnly cookie. All endpoints scoped to the caller's organisation and role.

---

## 7. Screens

| # | Screen | Primary user | Notes |
|---|---|---|---|
| S1 | Login / SSO | All | Folgo logo, minimal |
| S2 | Employee home | Employee | Big check-in button, timer, task field, status selector, today's timeline |
| S3 | My timesheet | Employee | Month calendar + detail table |
| S4 | My leave | Employee | Balances, request form, history |
| S5 | **Live board** | Admin | Card grid + filters + side panel (per §4.4) |
| S6 | Member directory | All | Alphabetical grid |
| S7 | Profile side panel | Admin | Now / Attendance / Activity / Profile tabs |
| S8 | Team timesheet | Admin | Employee × day matrix |
| S9 | Reports | Admin | Report picker, preview, export |
| S10 | Approvals inbox | Lead/Admin | Leave + regularisation queue |
| S11 | Settings | Admin | Schedules, holidays, leave types, clients, location rules, roles |
| S12 | Audit log | Admin | Filterable table |
| S13 | Wall display | — | Signed-link kiosk view |
| S14 | Mobile check-in | Employee | Responsive; PWA-installable |

### 7.1 Design direction

**Layout** follows the uploaded reference: left icon rail for the org mark, top horizontal nav (Home · Live · Members · Timesheets · Reports), a content area with a filter chip row, a card grid, and a 480px right slide-over panel.

**Dark-first.** The Folgo brand kit is built on Dark Espresso and Pure Black surfaces with Burnt Orange as the single accent. The app inherits that: dark is the default theme, and a light theme (Warm Ivory surfaces) ships as an option in Phase 2. This is unusual for an HR tool and is the right call here — it makes the live board read as a studio wall display rather than a payroll spreadsheet, and it means the TV/kiosk mode (§4.4.6) works in a dim studio without glare.

**Member cards borrow from the Folgo ID card.** The brand kit's employee ID card already solves this exact composition: portrait photo over a warm gradient, name in white with the surname in Burnt Orange, role in muted grey below, wordmark anchored at the bottom. The live board card is that card, shrunk, with a status ring replacing the ID's decorative halo. This gives the product an identity that is unmistakably Folgo's rather than generic SaaS, at no extra design cost.

**Orange is reserved.** Burnt Orange (`#EB5E29`) is the accent for primary actions, the active nav state, brand marks, and focus rings — nothing else. It is deliberately *not* used as a status colour, because a "check in" button and an "on break" badge competing for the same orange would destroy the board's scannability. See §7.2.

**Status is never colour alone.** Every status shows a colour ring *and* a text label. Required for accessibility, and necessary anyway on a board scanned at distance.

**Typography:** Neue Montreal throughout, three weights (Regular 400, Medium 500, Bold 700). Tabular figures for all timers and timesheet numbers so digits don't jitter as they tick. Numerals in timers use Medium; body text Regular.

**Restraint.** The brand's gradients (§Brand Gradient in the kit) belong on the login screen, the empty states, and the kiosk header — not behind data. Grid, timesheet, and report surfaces stay flat so the numbers stay legible.

### 7.2 Design tokens

Derived from the Folgo brand kit (`01.pdf`). Brand primaries are fixed; the tints, greys, and status hues below are extensions created for UI needs the print-oriented kit does not cover.

**Brand primaries (from the kit — do not alter)**

| Token | Hex | RGB | Use |
|---|---|---|---|
| `--folgo-orange` | `#EB5E29` | 235, 94, 41 | Accent, primary buttons, active nav, focus ring |
| `--folgo-ivory` | `#F0ECE3` | 240, 236, 227 | Light-theme surface, primary text on dark |
| `--folgo-espresso` | `#2D2324` | 45, 35, 36 | Card and panel surfaces (dark theme) |
| `--folgo-black` | `#000000` | 0, 0, 0 | App background (dark theme) |

**Dark theme surface scale** (extension — interpolated between Black and Espresso so panels stack legibly)

| Token | Hex | Use |
|---|---|---|
| `--bg-base` | `#0A0808` | App background |
| `--bg-surface` | `#171213` | Cards, table rows |
| `--bg-surface-raised` | `#2D2324` | Side panel, modals, dropdowns (= Espresso) |
| `--bg-hover` | `#3A2E2F` | Row and card hover |
| `--border-subtle` | `#3A2E2F` | Dividers, card borders |
| `--border-strong` | `#524244` | Input borders, table outlines |

**Text scale**

| Token | Hex | Contrast on `--bg-surface` | Use |
|---|---|---|---|
| `--text-primary` | `#F0ECE3` | 15.4:1 | Names, headings, numbers |
| `--text-secondary` | `#B5ADA6` | 8.1:1 | Task text, labels, metadata |
| `--text-muted` | `#7D7570` | 4.1:1 | Timestamps, placeholders — **large text only** |
| `--text-on-orange` | `#FFFFFF` | 3.6:1 on orange | Button labels ≥16px Medium only |

> ⚠️ **Contrast note the build team must respect:** white on Burnt Orange is 3.6:1 — below the 4.5:1 AA threshold for body text. It passes only for large text (≥18.66px, or ≥14px bold). For small labels on an orange fill, use `--folgo-black` (`#000000`) instead, which gives 6.0:1. Do not put 12–14px white text on orange anywhere.

**Accent scale**

| Token | Hex | Use |
|---|---|---|
| `--accent` | `#EB5E29` | Default |
| `--accent-hover` | `#F4713F` | Hover |
| `--accent-pressed` | `#C94B1D` | Active/pressed |
| `--accent-subtle` | `rgba(235,94,41,0.14)` | Selected chip fill, active nav background |
| `--accent-ring` | `rgba(235,94,41,0.45)` | Focus ring |

**Typography scale** — Neue Montreal

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--text-display` | 40 / 44 | 700 | Login, kiosk header |
| `--text-h1` | 28 / 34 | 700 | Page titles ("Live now") |
| `--text-h2` | 20 / 26 | 500 | Section headings, panel name |
| `--text-body` | 15 / 22 | 400 | Default |
| `--text-sm` | 13 / 18 | 400 | Metadata, table cells |
| `--text-caption` | 11 / 14 | 500, +0.04em tracking, uppercase | Status labels, column headers |
| `--text-timer` | 15 / 20 | 500, `font-variant-numeric: tabular-nums` | All timers and durations |

**Spacing & shape**
4px base unit. Radius: `--radius-sm` 8px (chips, inputs), `--radius-md` 12px (buttons), `--radius-lg` 16px (cards — matching the brand kit's card treatment), `--radius-full` (avatars, status rings). Shadows are near-useless on near-black surfaces; use `--border-subtle` and the surface scale for elevation instead.

**Gradient** (login, empty states, kiosk header only)
`linear-gradient(180deg, #EB5E29 0%, #2D2324 62%, #000000 100%)` — the kit's 01→02→03 sequence. Ivory→Orange variant (`#F0ECE3` → `#EB5E29`) for the light theme.

---

## 8. Business rules & edge cases

1. **Day boundary** — a session that crosses midnight is attributed to the date it started, unless the org enables "split at midnight" for night shifts.
2. **Multiple sessions per day** — permitted and summed. Only the first check-in counts for lateness; only the last check-out counts for early departure.
3. **Concurrent devices** — a user checked in on mobile is checked in everywhere. All clients reflect one server-side state.
4. **Clock skew** — server time is authoritative; client clocks are never used for records.
5. **Retroactive schedule change** — changing a work schedule applies from the change date forward and does not retroactively reclassify past days.
6. **Leave overlapping an existing check-in** — approving leave for a day with recorded attendance requires explicit admin confirmation and warns about the conflict.
7. **Deleted client/project** — soft-deleted only; historical status updates keep their reference.
8. **Employee deactivated mid-day** — open session is auto-closed at deactivation time.
9. **Offline check-in** — PWA queues the action locally and syncs on reconnect, stamping the queued time and flagging the record `OFFLINE_SYNCED` for admin visibility.
10. **Idle detection** — optional: after 30 minutes of no browser activity while `WORKING`, prompt "Still there?"; if unanswered for 15 min, set `AWAY`. Off by default; must be disclosed to employees if enabled.

---

## 9. Non-functional requirements

**Performance**
- Live board initial load < 2s for 100 members; status propagation < 5s.
- Check-in API p95 < 300ms.
- Reports for a 12-month range generate in < 10s.

**Availability**
- 99.5% during business hours. Check-in must degrade gracefully: if realtime fails, the core check-in POST must still succeed.

**Scale**
- Design for 200 employees, 3 years of history (~150k sessions, ~2M status updates). Index on `(user_id, date)` and `(org_id, started_at)`.

**Browsers & devices**
- Latest two versions of Chrome, Safari, Edge, Firefox. Responsive from 360px. PWA installable on iOS and Android.

**Accessibility**
- WCAG 2.1 AA. Full keyboard navigation, visible focus rings, 4.5:1 contrast, status conveyed by text as well as colour, screen-reader labels on all icon-only buttons.

**Localisation**
- English only in v1. All strings externalised; date/time formatted per org timezone; 12/24-hour toggle.

---

## 10. Security & privacy

- Passwords hashed with Argon2id. Rate limiting on auth endpoints (5 attempts / 15 min).
- TLS everywhere; HSTS. Secrets in a managed secret store, never in the repo.
- Role checks enforced server-side on every endpoint — never relying on hidden UI.
- Multi-tenancy: every query scoped by `org_id`.
- Encryption at rest for the database and backups. Daily automated backups, 30-day retention, quarterly restore test.
- Geolocation stored only when the feature is enabled, only at check-in/out moments — never continuously tracked.
- Employees can view every piece of data recorded about them, and export it.
- Data retention: attendance data retained 3 years (configurable), then archived or purged.
- Personal data handling aligned with India's DPDP Act — purpose limitation, employee notice at onboarding, and a named data fiduciary contact.

### 10.1 Trust principles (product stance)
This tool works only if the team trusts it. Three commitments should be visible in the product itself, not just in policy:
1. **No covert monitoring** — no screenshots, keystroke logging, webcam, or app tracking. Ever.
2. **Symmetric visibility** — anything an admin can see about an employee, that employee can see about themselves, including who viewed and who edited their records.
3. **Disclosed automation** — any automatic action (auto-checkout, idle detection, location flagging) is announced in-app before it is enabled org-wide.

---

## 11. Recommended technical approach

*(Non-binding — for the build team's consideration.)*

- **Frontend:** React + TypeScript, Vite, TailwindCSS, TanStack Query, shadcn/ui. PWA via Workbox.
- **Backend:** Node.js (NestJS) or Django REST — team preference. Postgres as primary store.
- **Realtime:** WebSocket via Socket.IO or Postgres LISTEN/NOTIFY + SSE. Redis for presence and pub/sub fan-out.
- **Jobs:** BullMQ / Celery for auto-checkout sweeps, daily aggregate rollups, scheduled reports, notification dispatch.
- **Auth:** own JWT + Google OAuth.
- **Email:** Resend or SES. **Files:** S3-compatible storage for avatars and exports.
- **Hosting:** containerised, single region (Mumbai/ap-south-1 for latency and data residency).
- **Observability:** structured logs, Sentry, uptime monitoring on `/health` and the check-in endpoint specifically.

---

## 12. Release plan

### Phase 1 — MVP (target: 6–8 weeks)
Auth + invites (SSO, no public signup) · employee check-in/out with breaks · **task log: start / pause / complete / carry over** · status selector · end-of-day summary · live board with filters and side panel · person day log + range log · team activity feed · personal and team timesheets · admin corrections · monthly CSV export · basic settings (schedule, holidays) · responsive mobile web.

**MVP ships when:** an employee can complete a full day in under 30 seconds of interaction, and an admin can produce a correct month-end hours report with no manual editing.

### Phase 2 — Operations (4–6 weeks)
Leave management with balances · regularisation workflow · approvals inbox · notifications and reminders · client/project tagging and time-by-client reports · task search · task comments · audit log · wall-display mode · PWA offline check-in · light theme.

### Phase 3 — Depth (later)
Slack integration · geofence/IP policies · capacity and utilisation dashboards · billable vs non-billable hours · payroll export templates · native mobile apps · public holiday auto-import · API for third-party integration.

---

## 13. Open questions

1. **Headcount and growth** — how many employees today, and what should we design for in 24 months?
2. ~~**Office vs remote split**~~ ✅ **Resolved:** remote-first, no shared terminal. Location verification cut entirely (§4.2 F-2.4); check-in is trust-based.
3. **Shifts** — does anyone work night shifts or non-standard hours? This changes day-boundary logic.
4. **Existing tools** — is there a payroll system (Zoho, Keka, RazorpayX) that this must export to in a specific format?
5. **Live board visibility** — full transparency to all employees, or admin-only?
6. **Client/project list** — does one already exist somewhere that we can import?
7. **Leave policy** — do documented leave types and quotas exist, or does this PRD need to define them?
8. **Attendance-to-payroll link** — should half-days and absences feed salary calculation, or stay informational in v1?
9. **Idle detection** — acceptable to the team, or does it cross the surveillance line?
10. **Brand assets** — ~~logo files, brand colours~~ ✅ received; tokens applied in §7.2. Outstanding: SVG wordmark, square app mark, and confirmation of the Neue Montreal web licence (§14.3).
11. **Theme default** — dark-first is proposed (§7.1). Confirm, since it affects whether the light theme is MVP or Phase 2.
12. **Timezone spread** — are remote staff all in IST, or spread across zones? Determines whether the timezone handling in §4.4 is cosmetic or load-bearing.
13. **Task granularity** — should a task be roughly a half-day of work, or every discrete item? This is a norm to set at rollout, not a feature; but the team should agree on it, because mismatched granularity between people makes the logs incomparable.
14. **End-of-day summary** — required, optional, or off? (§4.3 F-3.4 defaults to optional.)
15. **Are task logs visible peer-to-peer**, or only to the person and their admin? Affects the activity feed's default scope.

---

## 14. Appendix

### 14.1 Sample user stories with acceptance criteria

**US-1** — *As an employee, I want to check in with one tap so that starting my day takes no effort.*
- Given I am logged in and not checked in, when I tap Check in, then my status becomes `WORKING` within 1 second and a timer starts.
- Given I tap Check in twice rapidly, then only one session is created.

**US-2** — *As an admin, I want to see who is working right now so that I can route an urgent client request.*
- Given 12 people are checked in, when I open the Live board, then I see 12 cards marked `WORKING` with their current task, sorted with working members first.
- Given someone changes their status, then my board reflects it within 5 seconds without a refresh.

**US-3** — *As an employee, I want to update what I'm working on so that my team knows my focus without asking.*
- Given I am checked in, when I edit my task text and blur the field, then it saves and appears on the live board.
- Given I change tasks 4 times, then my timeline shows 4 entries with correct durations summing to my session length.

**US-4** — *As an admin, I want to correct a wrong check-out time so that the timesheet is accurate.*
- Given a record with a missing check-out, when I set a time and enter a reason, then net hours recalculate and an audit entry is written with before/after values.
- Given I try to set check-out before check-in, then the save is blocked with an inline error.

**US-5** — *As an employee, I want to see my own hours so that I can verify my pay.*
- Given the month has 20 working days, when I open my timesheet, then I see per-day hours, a monthly total, and any admin edits clearly marked.

### 14.2 Status colour tokens

Revised from the v1.0 placeholders now that the brand is known. Two constraints drove the change: every hue must clear 4.5:1 on `#171213`, and none may sit near Burnt Orange in hue, or the board turns into an indistinguishable orange smear.

| Status | Token | Hex | Contrast on surface | Ring treatment |
|---|---|---|---|---|
| Working | `--status-working` | `#3DD68C` | 9.8:1 | Solid ring, 3px |
| In meeting | `--status-meeting` | `#5B9DFF` | 7.2:1 | Solid ring, 3px |
| Focus | `--status-focus` | `#B08CFF` | 7.9:1 | Solid ring + inner glow |
| On break | `--status-break` | `#F5C542` | 12.1:1 | Dashed ring |
| Away | `--status-away` | `#8A817C` | 4.6:1 | Solid ring, 2px, 60% opacity avatar |
| Checked out | `--status-out` | `#524244` | — | No ring, avatar at 45% opacity |
| On leave | `--status-leave` | `#6B8A9E` | 5.1:1 | Diagonal-striped ring |

**Design notes**
1. **Amber was the problem child.** The v1.0 "on break" amber (`#D97706`) is only 18° from Burnt Orange in hue — on a dark board it reads as brand chrome, not status. Replaced with a high-luminance yellow (`#F5C542`) that separates cleanly from orange at a glance and at distance on the kiosk display.
2. **Green was lightened.** `#16A34A` is too dark against near-black; `#3DD68C` keeps "working" as the brightest, most eye-catching state — correct, since that's the thing admins scan for.
3. **Ring style is redundant encoding.** Solid / dashed / striped / absent means the board stays readable in greyscale, for colour-blind users, and on a poorly calibrated wall monitor. Colour is never carrying the signal alone.
4. **Checked out recedes.** Reduced opacity on the avatar rather than a coloured ring — checked-out people should visually fall away so the working set pops.

### 14.3 Brand asset checklist

Received:
- ✅ Brand guidelines deck (`01.pdf`) — logo, colour, gradient, typography, ID card, app icon, business card
- ✅ Wordmark, white, PNG with transparency, 1993 × 728

Still needed before build starts:
- **Vector wordmark (SVG)** — the PNG will soften on retina displays and can't be recoloured in CSS. Needed in white, black, and orange.
- **Square app mark** for the left nav rail, favicon, and PWA install icon. The kit's macOS icon page shows a rounded-square "Folgo." lockup — the source file for that, exported at 512 × 512 and 192 × 192, would cover it.
- **Neue Montreal webfont licence.** It's a commercial face from Pangram Pangram; a desktop licence does not cover `@font-face` web embedding. Either buy the web licence or agree a fallback now. Nearest free substitutes if not: **Aeonik** (also paid), or **Inter** / **Geist** as an open fallback — both differ noticeably in the lowercase `g`, which is prominent in the wordmark, so the wordmark itself should stay as artwork rather than live text either way.
- **Confirmed favicon background** — orange fill or black fill.

### 14.4 Glossary
**Session** — a single check-in to check-out block. **Net hours** — worked minutes minus break minutes. **Regularisation** — an employee-requested correction to an attendance record. **Grace period** — minutes after schedule start before a check-in counts as late. **Classification** — the system-assigned label for a day (Present, Late, Absent, etc.).
