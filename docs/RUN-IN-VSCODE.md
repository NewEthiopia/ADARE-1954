# Running the Adare Platform in VS Code

## What you need installed on your computer

| Tool | Version | Download |
|---|---|---|
| Node.js | 20 or newer | https://nodejs.org (LTS) |
| PostgreSQL | 14 or newer | https://www.postgresql.org/download/ (Windows: EDB installer) |
| VS Code | latest | https://code.visualstudio.com |
| Git (optional) | any | https://git-scm.com |

> **Windows tip:** during PostgreSQL installation remember the password you set
> for the `postgres` superuser — you need it once, in step 2.

---

## Step 1 — Open the project

1. Copy the `adare-platform` folder to your computer.
2. In VS Code: **File → Open Folder…** → select `adare-platform`.
3. Open the integrated terminal: **Terminal → New Terminal** (`` Ctrl+` ``).

---

## Step 2 — Create the database (one time)

Open a terminal that can run `psql` (Windows: "SQL Shell (psql)" from the Start
menu, or add PostgreSQL's `bin` folder to PATH; macOS/Linux: any terminal).

```sql
-- connect as the postgres superuser, then:
CREATE USER agh WITH PASSWORD 'AghDevPg2026';
CREATE DATABASE adare_platform OWNER agh;
```

Then load the schema + data (run from the project folder):

```bash
# Windows (SQL Shell or after adding psql to PATH)
psql -U postgres -d adare_platform -f server/db/001_schema.sql
psql -U postgres -d adare_platform -f server/db/002_seed.sql
psql -U postgres -d adare_platform -f server/db/003_leadership.sql
psql -U postgres -d adare_platform -f server/db/004_campaign.sql
psql -U postgres -d adare_platform -f server/db/005_years_ec.sql
psql -U postgres -d adare_platform -f server/db/006_real_doctors.sql
psql -U postgres -d adare_platform -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO agh; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO agh;"
```

(macOS/Linux: prefix with `sudo -u postgres` instead of `-U postgres` if needed.)

---

## Step 3 — Configure the server

Create `server/.env` (copy from `server/.env.example`):

```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://agh:AghDevPg2026@127.0.0.1:5432/adare_platform
JWT_SECRET=any-long-random-string-change-me
REFRESH_TOKEN_SECRET=another-long-random-string-change-me
SECURE_COOKIES=0
```

---

## Step 4 — Install dependencies & seed accounts

In the VS Code terminal:

```bash
cd server
npm install
node scripts/seed-dev.js     # creates the dev staff accounts
cd ../web
npm install
```

*(Or run VS Code tasks: **Terminal → Run Task…** → tasks 1, 2, 3.)*

---

## Step 5 — Run it

**Option A — two dev servers (recommended while coding, gives hot reload):**

Terminal 1:
```bash
cd server && node src/index.js        # API on http://localhost:4000
```

Terminal 2:
```bash
cd web && npx vite                    # site on http://localhost:5173 (proxies /api to 4000)
```

Open **http://localhost:5173** in your browser.

**Option B — single server (production-style):**

```bash
cd web && npx vite build              # builds web/dist
cd ../server && node src/index.js     # serves API + built site
```

Open **http://localhost:4000**.

*(Or **Terminal → Run Task… → "Run both (API + web dev)"**.)*

---

## Step 6 — Sign in

| Where | URL | Account |
|---|---|---|
| Public site | `/` | no login needed |
| Patient portal | `/portal` | register with any phone + password |
| Staff app | `/staff` | `admin` / `AdareAdmin#2026` (see docs/README.md for all roles) |

---

## Debugging in VS Code

- Press **F5** → "Debug API server" (breakpoints in `server/src/**` work).
- Frontend: run task 5, then use the browser DevTools, or install the
  "JavaScript Debugger" browser launch config if you prefer breakpoints in VS Code.

## Everyday commands

| What | Where | Command |
|---|---|---|
| Run API | `server/` | `node src/index.js` |
| Run web w/ hot reload | `web/` | `npx vite` |
| Production build | `web/` | `npx vite build` |
| Re-seed dev accounts | `server/` | `node scripts/seed-dev.js` |
| E2E tests (Linux/WSL/Git Bash) | project root | `bash tests/e2e.sh` |
| Create production admin | `server/` | `node scripts/create-admin.js admin "Full Name"` |

## Common problems

| Symptom | Fix |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL isn't running — start the service (Windows: services.msc → postgresql; macOS: `brew services start postgresql`) |
| `password authentication failed for user "agh"` | Recreate the user/password from Step 2, or fix `DATABASE_URL` in `server/.env` |
| `relation "users" does not exist` | You skipped the migration files in Step 2 — run all six `.sql` files in order |
| Port 4000/5173 already in use | Change `PORT` in `server/.env` / `server.port` in `web/vite.config.js` |
| Photos 404 | Ensure `server/storage/uploads/leaders` and `.../news` folders came with the project copy |
| `bash tests/e2e.sh` fails on Windows | Use Git Bash or WSL; the test script also needs local `psql` access for its reset step |
