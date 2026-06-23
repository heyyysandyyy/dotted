# rails-react-boilerplate

Production-ready Rails 8 API + React 19 starter. Clone, rename `myapp`, ship.

## Stack

| Layer | Technology |
|---|---|
| API | Rails 8.1, API-only, PostgreSQL |
| Auth | Rails 8 authentication generator, Bearer token + httpOnly cookie refresh |
| Frontend | React 19, Vite, TypeScript, Tailwind CSS v4 |
| UI | shadcn/ui, lucide-react |
| Routing | TanStack Router |
| Data fetching | TanStack Query |
| Serialization | Blueprinter |

## What's included

- Full auth: login, signup, logout, password reset with email
- JWT-style Bearer tokens stored in React memory (never localStorage)
- Silent session restore on page refresh via httpOnly cookie
- Role-based access (`user` / `admin`) with `require_admin` guard
- Protected routes with loading state handling
- MailCatcher for local email dev (no real emails sent)
- GitHub Actions CI (Rails tests + rubocop + brakeman + bundler-audit, React lint + build)
- Docker Compose (Postgres + MailCatcher)

## Rename from `myapp`

Before starting, do a global find-replace of `myapp` → your app name:

```bash
# macOS
grep -rl "myapp" . --include="*.yml" --include="*.rb" --include="*.tsx" --include="*.env*" \
  | xargs sed -i '' 's/myapp/yourapp/g'
```

Then update the `name` field in `web/package.json` and the page title in `web/src/App.tsx`.

## Prerequisites

- Ruby 3.3.6 (`rbenv` or `asdf`)
- Node 23.6.1 (`nvm` or `asdf`)
- Docker (for Postgres + MailCatcher)

## Setup

### 1. Start backing services

```bash
docker compose up -d
```

View caught emails at `http://localhost:1080`.

### 2. API

```bash
cd api
bundle install
cp .env.example .env
bin/rails db:create db:migrate db:seed
bin/rails server
```

### 3. Web

```bash
cd web
npm install
cp .env.example .env
npm run dev
```

API runs on `http://localhost:3000`, frontend on `http://localhost:5173`.

## Seed credentials

| Email | Password | Role |
|---|---|---|
| admin@example.com | password123456 | admin |

## API endpoints

| Method | Path | Auth | Description |
|---|---|---|---|
| POST | `/api/v1/session` | No | Login |
| GET | `/api/v1/session` | Cookie | Silent refresh |
| DELETE | `/api/v1/session` | Yes | Logout |
| POST | `/api/v1/users` | No | Register |
| GET | `/api/v1/me` | Yes | Current user |
| POST | `/api/v1/passwords` | No | Request password reset |
| PATCH | `/api/v1/passwords/:token` | No | Reset password |

## Auth flow

1. Login → API returns `{ token, user }` in body + sets `session_token` httpOnly cookie
2. Token stored in React memory (`AuthContext`) — never localStorage
3. Page refresh → silent `GET /api/v1/session` reads cookie → restores session
4. Any 401 → client silently retries refresh → retries request → clears session if refresh fails

## Running tests

```bash
cd api && bin/rails test
cd api && bin/ci        # full CI: rubocop + brakeman + bundler-audit + tests
cd web && npm run lint
