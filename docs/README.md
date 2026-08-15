# Adare General Hospital — Digital Hospital Platform

Full-stack hospital management and patient-service platform for
**Adare General Hospital, Hawassa, Sidama Region, Ethiopia**.

```
adare-platform/
├── web/                    React 18 + Vite SPA (public site, portal, staff app)
│   ├── src/pages/          Home, Services, Doctors, Departments, About, News,
│   │                       Appointment, Contact, Emergency, HealthEducation,
│   │                       Portal (patient), Staff (receptionist/finance/admin/CMS)
│   ├── src/components/     Layout (header/nav/footer/search/theme/language)
│   └── src/lib/            api.js (client + token refresh + SSE), i18n.js (6 languages)
├── server/                 Node 20 + Express REST API
│   ├── src/routes/         auth, public, appointments, patients, payments, admin
│   ├── src/                config, db (pg pool + tx + reference counters),
│   │                       auth (JWT/refresh/RBAC/lockout/audit), notify (SSE + providers)
│   ├── db/                 001_schema.sql (24 tables), 002_seed.sql (reference data)
│   ├── scripts/            seed-dev.js (dev accounts), create-admin.js (production)
│   ├── docs/openapi.json   Swagger/OpenAPI 3 documentation
│   └── .env.example        environment template (never commit real secrets)
├── tests/e2e.sh            64 end-to-end workflow tests
├── docker-compose.yml      postgres + api + nginx
├── Dockerfile              multi-stage build (SPA → API image)
└── nginx/adare.conf        reverse proxy with SSE + security headers
```

## Quick start (development)

```bash
# database
sudo -u postgres psql -c "CREATE USER agh WITH PASSWORD '...'" \
                     -c "CREATE DATABASE adare_platform OWNER agh"
sudo -u postgres psql -d adare_platform -f server/db/001_schema.sql
sudo -u postgres psql -d adare_platform -f server/db/002_seed.sql

# server
cd server && cp .env.example .env   # fill DATABASE_URL + secrets
npm install && node scripts/seed-dev.js && node src/index.js

# web (dev mode w/ proxy)  — or `npx vite build` and the API serves dist/
cd web && npm install && npx vite
```

## Production (Docker)

```bash
export DB_PASSWORD=… JWT_SECRET=… REFRESH_TOKEN_SECRET=…
docker compose up -d --build
docker compose exec api node scripts/create-admin.js admin "Hospital Administrator"
```

## Dev/test accounts (created by seed-dev.js — NEVER use in production)

| username    | role            | password              |
|-------------|-----------------|-----------------------|
| admin       | hospital_admin  | AdareAdmin#2026       |
| reception1  | receptionist    | AdareReception#2026   |
| doctor1     | doctor          | AdareDoctor#2026      |
| nurse1      | nurse           | AdareNurse#2026       |
| finance1    | finance         | AdareFinance#2026     |
| content1    | content_manager | AdareContent#2026     |

## Key API endpoints (full docs: `/api/docs/openapi.json`)

| Endpoint | Purpose |
|---|---|
| `POST /api/auth/login` · `/register` · `/refresh` · `/logout` | JWT auth, rotating refresh cookie |
| `GET /api/services` · `/doctors` · `/departments` · `/leaders` · `/news` · `/health-articles` · `/search` · `/settings` | Public content (database-driven) |
| `POST /api/appointments` → `AGH-APT-…` | Real booking; `GET /status`, staff `GET`/`PATCH` workflow |
| `GET/PATCH /api/patients/me` | Patient portal |
| `POST /api/payments` → `AGH-PAY-…` | Payment submission; finance verify/refund; CSV export |
| `GET /api/admin/dashboard` · `/users` · `/news` · `/audit` · `/reports/*` · `/settings` | Staff dashboards + CMS |
| `GET /api/events` | SSE real-time stream (appointments, payments, notifications) |
| `GET /api/health` | Health check |

## Appointment lifecycle
`PENDING → CONFIRMED → CHECKED_IN → IN_CONSULTATION → COMPLETED`
with `RESCHEDULED`, `CANCELLED`, `REJECTED`, `NO_SHOW`; all transitions
server-guarded (409 on invalid), recorded in `appointment_status_history`,
audited, SSE-broadcast, and notified to patient + SMS queue.

## Payment lifecycle
`PENDING → PROCESSING → SUCCESSFUL | FAILED | CANCELLED`, `SUCCESSFUL → REFUNDED`.
Every change appends to `payment_transactions`. No provider configured ⇒
manual finance verification only — nothing is ever fake-confirmed.

## Security checklist (implemented)
- bcrypt password hashing (cost 11) + automatic rehash path
- JWT access (15 min) + rotating refresh tokens (HTTP-only, SameSite, path-scoped cookie)
- Account lockout: 5 failures → 15 min lock; per-route rate limiting
- RBAC enforced server-side on every protected endpoint (401/403)
- 100 % parameterized SQL (pg), zod validation on every input
- HTML sanitizer (allow-list) for CMS bodies — script/iframe/event-handler stripping
- helmet security headers + CSP; generic error messages (no stack traces/SQL)
- Audit log: user, role, action, entity, result, IP, timestamp
- Secrets only in `.env` (template provided); SMS/payment/AI providers are
  config-dependent interfaces — never simulated

## Backups
```bash
# nightly cron
0 2 * * * docker compose exec -T db pg_dump -U agh adare_platform | gzip > /backups/agh-$(date +\%F).sql.gz
# retention
0 3 * * * find /backups -name 'agh-*.sql.gz' -mtime +30 -delete
# restore
gunzip < backup.sql.gz | docker compose exec -T db psql -U agh adare_platform
```

## Ethiopian context
- Phone validation accepts `09…` / `+2519…` formats
- Canonical dates stored as ISO/UTC in PostgreSQL; Ethiopian-calendar
  presentation can be layered in the UI without touching stored data
- Languages: English, Amharic, Afaan Oromoo, Sidaamu Afoo, Arabic (RTL), French
- Payment methods: Telebirr, bank transfer, card, cash, CBHI — providers pluggable

## Remaining configuration-dependent integrations (clean interfaces, no fakes)
| Integration | Where | Behaviour when unconfigured |
|---|---|---|
| SMS provider | `server/src/notify.js` → `sendSms()` | Logged as skipped; nothing marked sent |
| Email/SMTP | `.env` `SMTP_*` | Disabled |
| Telebirr gateway | `payments` provider_ref + manual verification | Finance verifies manually |
| Object storage | `.env` `STORAGE_*` | Local `storage/` directory |
| Maps API | Contact page uses OpenStreetMap links | Works without key |

## Leadership Heritage Carousel (homepage)

Premium "From Adare Primary Hospital to Adare General Hospital" section:
3-up coverflow carousel (center manager dominant at scale 1.05, neighbours
0.82/65 % opacity, ±2 peek), infinite modular loop with no rewind jump,
5 s autoplay pausing on hover/touch/focus/interaction (resumes after 5 s),
pointer drag/swipe with 60 px threshold, ArrowLeft/Right/Home/End keys,
dots, aria-live info card, `cubic-bezier(0.22,1,0.36,1)` transform/opacity
animation, `prefers-reduced-motion` fallback, and a 1954 → current-leadership
historical timeline (no invented years).

Photos are the **real hospital-provided portraits** — baked-in name banners
cropped out, faces untouched — served as WebP + JPEG from
`/uploads/leaders/*` with 30-day immutable cache; only the active slide
loads eagerly.

### Leadership API (CMS-managed, audited)
| Endpoint | Auth | Purpose |
|---|---|---|
| `GET /api/leadership` | public | Active leaders (drives the carousel) |
| `GET /api/leadership?all=1` | staff | Full list incl. hidden (CMS) |
| `GET /api/leadership/:id` | public | Single leader |
| `POST /api/leadership` | content_manager+ | Add leader |
| `PATCH /api/leadership/:id` | content_manager+ | Edit / reorder / `is_current` (exclusive) / show-hide |
| `DELETE /api/leadership/:id` | content_manager+ | Soft-hide (history preserved) |
| `POST /api/leadership/:id/photo` | content_manager+ | Upload portrait (magic-byte validated JPEG/PNG/WebP) |

Staff app → **Leadership** view provides the full admin UI
(add, edit, photo upload, mark current, ordering, hide/show).
