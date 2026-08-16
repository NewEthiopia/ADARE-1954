# Step-by-Step: Run & Update the Adare Platform in VS Code
### (including the image fix + pushing to GitHub)

---

## PART A — One-time setup

### Step 1. Install the tools
1. **Node.js 20 LTS** → https://nodejs.org → Download → Install (keep all defaults)
2. **PostgreSQL** → https://www.postgresql.org/download/ → Install
   - ⚠️ Write down the **postgres password** you choose during installation
3. **VS Code** → https://code.visualstudio.com

Check they work — open **Command Prompt / Terminal** and type:
```bash
node -v        # should print v20.x or higher
psql --version # should print psql (PostgreSQL) 14 or higher
```

### Step 2. Get the project into VS Code
**If you already extracted `adare-platform.tar.gz` before:** download the **new**
one from the workspace (it contains the image fix) and extract it again, replacing
the old folder — or, if you already pushed to GitHub, skip to Part D Step 12 to pull.

1. Download `adare-platform.tar.gz` from the chat workspace
2. Extract it (right-click → Extract All, or 7-Zip)
3. VS Code → **File → Open Folder…** → select the extracted `adare-platform` folder
4. If VS Code asks "Do you trust the authors?" → **Yes, I trust**

### Step 3. Open the terminal in VS Code
**Terminal → New Terminal** (shortcut: `` Ctrl+` ``).
All commands below are typed there.

### Step 4. Create the database
Open **SQL Shell (psql)** from the Windows Start menu
(press Enter 4 times to accept defaults, then type your postgres password):
```sql
CREATE USER agh WITH PASSWORD 'AghDevPg2026';
CREATE DATABASE adare_platform OWNER agh;
\q
```

Back in the **VS Code terminal**, load the schema (6 files, in order):
```bash
psql -U postgres -d adare_platform -f server/db/001_schema.sql
psql -U postgres -d adare_platform -f server/db/002_seed.sql
psql -U postgres -d adare_platform -f server/db/003_leadership.sql
psql -U postgres -d adare_platform -f server/db/004_campaign.sql
psql -U postgres -d adare_platform -f server/db/005_years_ec.sql
psql -U postgres -d adare_platform -f server/db/006_real_doctors.sql
psql -U postgres -d adare_platform -c "GRANT ALL ON ALL TABLES IN SCHEMA public TO agh; GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO agh;"
```
Each command asks for the postgres password.

> **"psql is not recognized"?** Add `C:\Program Files\PostgreSQL\16\bin`
> to Windows PATH (Start → "environment variables" → Path → Edit → New),
> then close and reopen the VS Code terminal.

### Step 5. Create the server settings file
In the VS Code file explorer (left side):
1. Right-click the **`server`** folder → **New File** → name it exactly: `.env`
2. Paste this inside and save (Ctrl+S):
```
NODE_ENV=development
PORT=4000
DATABASE_URL=postgres://agh:AghDevPg2026@127.0.0.1:5432/adare_platform
JWT_SECRET=change-me-to-any-long-random-text-123456
REFRESH_TOKEN_SECRET=change-me-too-another-random-text-654321
SECURE_COOKIES=0
```

### Step 6. Install packages + create staff accounts
In the VS Code terminal:
```bash
cd server
npm install
node scripts/seed-dev.js
cd ../web
npm install
cd ..
```
You should see: `+ created admin … reception1 … finance1 …`

---

## PART B — Run it (every time you work)

### Step 7. Start the API server (Terminal 1)
```bash
cd server
node src/index.js
```
✅ Wait for: `[adare-platform] API listening on 0.0.0.0:4000`
**Leave this terminal running.**

### Step 8. Start the website (Terminal 2)
Click the **`+`** button in the terminal panel (opens a second terminal):
```bash
cd web
npx vite
```
✅ Wait for: `Local: http://localhost:5173/`

### Step 9. Open the site
Browser → **http://localhost:5173**
- Photos of the 6 managers appear in the leadership carousel ✅
- Campaign banner appears under the quick actions ✅

Sign-ins:
| Page | URL | Account |
|---|---|---|
| Staff dashboard | http://localhost:5173/staff | `admin` / `AdareAdmin#2026` |
| Patient portal | http://localhost:5173/portal | register with any phone |

To stop: click a terminal and press **Ctrl+C** (do it in both).

---

## PART C — The image fix (why your deployed site had no photos)

On localhost the **Node server** serves `/uploads/...` photos. GitHub Pages
has no Node server, so those URLs 404'd.

**The fix is already in this version:** photos are also copied to
`web/public/uploads/`, so they get baked into the static build.

If you ever add new photos through the staff app and want them on a static
host too, copy them once and rebuild:
```bash
# from the project root
cp -r server/storage/uploads/* web/public/uploads/      (Windows: xcopy /E /I server\storage\uploads web\public\uploads)
cd web
npx vite build
```

⚠️ Remember: GitHub Pages shows only the static parts (design, photos).
Appointments, portal, dashboards need the Node server + PostgreSQL —
use Render.com / Railway / a VPS with the included Docker files for the full site.

---

## PART D — Push updates to GitHub from VS Code

### Step 10. First push (if you haven't yet)
1. Click the **Source Control** icon in the left bar (or `Ctrl+Shift+G`)
2. You'll see the repo is ready with commits — click **“Sync Changes”** or **“Publish Branch”**
3. A browser window opens → **Sign in to GitHub** → authorize → done
4. Check https://github.com/NewEthiopia/ADARE-1954 — your code is there

### Step 11. Every later change
1. Edit files → save
2. Source Control panel → type a short message (e.g. "update doctors") in the box
3. Click **✓ Commit**, then **Sync Changes**

### Step 12. Get updates on another computer
```bash
git clone https://github.com/NewEthiopia/ADARE-1954.git
cd ADARE-1954
```
…then do Steps 4–6 once (database + .env + npm install) and run with Steps 7–8.
If you already cloned before, just:
```bash
git pull
cd web && npm install && cd ../server && npm install
```

---

## Troubleshooting

| Problem | Solution |
|---|---|
| `ECONNREFUSED 127.0.0.1:5432` | PostgreSQL isn't running: Start menu → `services.msc` → find **postgresql** → Start |
| `password authentication failed for "agh"` | Redo Step 4's `CREATE USER` line, or fix the password in `server/.env` |
| `relation "users" does not exist` | You skipped Step 4's six `.sql` files — run them in order |
| `'psql' is not recognized` | Add PostgreSQL's `bin` folder to PATH (note under Step 4) |
| Port 4000 or 5173 busy | Change `PORT` in `server/.env`; restart both terminals |
| Blank page at :5173 | Both terminals must be running (API **and** vite) |
| Images missing on deployed site | Part C — rebuild after copying uploads, and remember static hosts can't run the API |
| `git push` asks for password | Use a GitHub Personal Access Token, or use the VS Code Sync button (browser sign-in) |
