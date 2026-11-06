# Restaurant ERP

A restaurant operations platform built with **React, Vite, TypeScript, Tailwind CSS, Supabase, PostgreSQL, and Gemini**.

It connects point of sale, orders, kitchen display, menu and recipe costing, inventory, expenses, employees, activity auditing, reporting, offline sync, and AI-assisted analysis on one shared data model.

> **Status:** the application and database schema are implemented in this repository. A Supabase project must be connected before the app can start — there are no committed credentials or live database. `npm run build`, `npm run lint`, and `npm test` pass. The migrations and seed were also applied to a temporary PostgreSQL 16 instance with Supabase-compatible stubs, and the core order/payment/inventory RPC flow was smoke-tested. Apply the migrations to your own Supabase project and follow the setup below.

---

## Contents

- [What is included](#what-is-included)
- [Architecture](#architecture)
- [Repository layout](#repository-layout)
- [Quick start](#quick-start)
- [Local Supabase with Docker](#local-supabase-with-docker)
- [Environment variables](#environment-variables)
- [Roles and permissions](#roles-and-permissions)
- [Core business rules](#core-business-rules)
- [Offline behaviour](#offline-behaviour)
- [AI assistant and reports](#ai-assistant-and-reports)
- [Deployment to Hostinger](#deployment-to-hostinger)
- [Scripts](#scripts)
- [Database migrations](#database-migrations)
- [Validation and tests](#validation-and-tests)
- [Known limitations and next steps](#known-limitations-and-next-steps)
- [Troubleshooting](#troubleshooting)

---

## What is included

| Module | Capabilities |
|---|---|
| **Point of Sale** | Category/search browsing, cart, dine-in / takeaway / delivery fields, discounts, tax and service charge, cash/card/wallet payments, send-to-kitchen, pay-and-send, receipt printing |
| **Orders & invoices** | Search and filters, status and payment history, line items, payments, invoices, refunds, cancellation, receipt reprint |
| **Kitchen display** | Realtime tickets, new / preparing / ready flow, elapsed timers, order notes, kitchen-only permissions |
| **Menu & recipes** | Categories, meals, prices, availability, images, recipe builder, ingredient quantities, live production cost and margin |
| **Inventory** | Stock balances, purchases, waste, adjustments, stocktakes, suppliers, low-stock alerts, ledger consistency checks |
| **Expenses** | Categories, dated expenses, receipt upload, filtering, voiding, charts |
| **Owner dashboard** | Revenue, orders, average order value, gross profit, net result, sales trend, payment mix, top items, employee performance, expenses, low stock |
| **Employees** | Staff accounts, roles, activation, HR details, role permission matrix, invite flow |
| **Activity log** | Append-only audit trail for sensitive actions and configuration changes |
| **Settings** | Restaurant identity, currency/timezone, tax, service charge, discount limits, inventory deduction point, negative stock, offline card policy, invoice prefix, receipt footer |
| **Offline sync** | IndexedDB outbox, idempotent RPC replay, retry/backoff, per-operation status, conflict-safe unique operation IDs |
| **AI** | Permission-aware Gemini assistant and daily report generation through Supabase Edge Functions |

The schema also includes branches, payment methods, order type rules, storage buckets, realtime publication entries, and RLS verification helpers.

---

## Architecture

```text
┌──────────────────────────────────────────────────────────────┐
│ Presentation: React 18 + Vite + TypeScript + Tailwind       │
│ Recharts · React Router · TanStack Query · Sonner            │
└──────────────────────────────┬───────────────────────────────┘
                               │ supabase-js
┌──────────────────────────────▼───────────────────────────────┐
│ Supabase                                                     │
│  Auth (staff sessions)                                       │
│  PostgreSQL (schema, constraints, triggers, RPCs, views)     │
│  Row Level Security (permission checks in the database)      │
│  Realtime (orders, kitchen, inventory, menu)                 │
│  Storage (menu images, receipts, documents)                  │
│  Edge Functions (Gemini assistant and daily reports)         │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│ Browser offline layer: IndexedDB outbox + catalog cache      │
│ Queue → retry/backoff → idempotent RPC replay                │
└──────────────────────────────────────────────────────────────┘
```

**Trust boundaries**

- The browser never calculates authoritative totals. `create_order` re-prices every line from `menu_items` and applies tax, service charge, and discount rules in PostgreSQL.
- Financial writes (`create_order`, `pay_order`, `set_order_status`, `refund_order`) and stock movements are RPC-only. Direct table writes are revoked for those tables.
- Catalog and expense edits use direct PostgREST writes, but every table has RLS and an audit trigger where appropriate.
- The Gemini API key exists only in Supabase Edge Function secrets. AI queries use the caller's JWT, so RLS applies to the data retrieved for the prompt.

---

## Repository layout

```text
D:\ERP
├── src/
│   ├── app/                  # Routes, layout, guards
│   ├── components/           # Shared UI primitives
│   ├── context/              # Auth, settings, sync providers
│   ├── lib/                  # Supabase client, formatting, receipts
│   ├── modules/              # POS, orders, kitchen, menu, inventory, ...
│   ├── offline/              # IndexedDB cache and outbox worker
│   ├── realtime/             # Realtime invalidation helpers
│   ├── services/             # Supabase data access
│   └── types/                # Shared TypeScript types
├── supabase/
│   ├── config.toml           # Local Supabase CLI configuration
│   ├── functions/            # Gemini assistant, daily report, admin invite
│   ├── migrations/           # 001–014, applied in order
│   └── seed.sql              # Reference data and demo menu/recipes
├── public/                   # Favicon, robots.txt, Hostinger .htaccess
├── restaurant_erp_documentation.md
└── README.md
```

---

## Quick start

### Requirements

- Node.js 20+ and npm 10+
- A Supabase project (cloud) **or** Docker Desktop for local Supabase
- Supabase CLI (`npx supabase` works without a global install)

### 1. Install dependencies

```bash
npm install
```

### 2. Configure the frontend

```bash
copy .env.example .env
```

Fill in the public values from **Supabase → Project Settings → API**:

```env
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_ANON_KEY
VITE_APP_NAME=Restaurant ERP
```

Only the **anon** key belongs in the browser. Never put the service-role key or the Gemini key in `VITE_*` variables.

### 3. Link and apply the database

```bash
npx supabase login
npx supabase link --project-ref YOUR_PROJECT_REF
npx supabase db push
```

Then run the seed in the Supabase SQL editor, or from a database URL:

```bash
psql "$SUPABASE_DB_URL" -f supabase/seed.sql
```

`seed.sql` is idempotent. It creates permissions, roles, the role matrix, settings, payment methods, order type rules, expense categories, menu categories, ingredients, menu items, recipes, and a supplier.

The seed intentionally does **not** create opening inventory balances or auth users. Before preparing a real order, open **Inventory → Receive stock** (or call `record_purchase`) so the recipe ingredients have stock. With the default `allow_negative_stock = true`, the system will otherwise allow the balance to go negative rather than block the sale.

### 4. Create the first owner

1. In **Supabase → Authentication → Users**, create a user with a password.
2. Run this in the SQL editor, replacing the email:

```sql
update public.profiles
set role_id = (select id from public.roles where code = 'owner'),
    is_active = true
where email = 'owner@restaurant.com';
```

New auth users are created **inactive** by the `handle_new_user` trigger. This prevents a public sign-up from gaining access. The owner must be promoted and activated once. After that, use the Employees module to invite staff.

### 5. Run the app

```bash
npm run dev
```

Open <http://localhost:5173>. The app routes to `/setup` when Supabase environment variables are missing.

### 6. Sign in

Sign in with the owner account. The first screen is the owner dashboard; the sidebar is filtered by the permissions attached to the account's role.

---

## Local Supabase with Docker

Docker Desktop is required for the local stack.

```bash
npx supabase start
npx supabase db reset      # applies migrations + seed.sql
npx supabase status        # prints the local API URL and anon key
```

Use the printed values in `.env`:

```env
VITE_SUPABASE_URL=http://127.0.0.1:54321
VITE_SUPABASE_ANON_KEY=<local anon key>
```

The generated `supabase/config.toml` exposes the API on `54321`, PostgreSQL on `54322`, and Studio on `54323`. It is configured to load `supabase/seed.sql` after a database reset.

To stop the stack:

```bash
npx supabase stop
```

If Docker is not available in your environment, use a hosted Supabase project and `supabase db push` as described above.

---

## Environment variables

### Frontend (`.env`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_SUPABASE_URL` | Yes | Supabase project URL |
| `VITE_SUPABASE_ANON_KEY` | Yes | Public anon key |
| `VITE_APP_NAME` | No | Optional display name override |

### Edge Functions (`supabase/functions/.env` for local development)

| Variable | Required | Purpose |
|---|---|---|
| `GEMINI_API_KEY` | For AI | Google Gemini API key |
| `GEMINI_MODEL` | No | Model name; defaults to `gemini-2.0-flash` |
| `ALLOWED_ORIGIN` | No | CORS origin; defaults to `*` |

Production secrets:

```bash
npx supabase secrets set GEMINI_API_KEY=... GEMINI_MODEL=gemini-2.0-flash ALLOWED_ORIGIN=https://your-domain.example
npx supabase functions deploy ai-assistant ai-daily-report admin-invite-user
```

`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected into Edge Functions by Supabase. The service-role key used by `admin-invite-user` must remain a server-side secret.

---

## Roles and permissions

The seed installs five roles:

| Role | Intended scope |
|---|---|
| **Owner** | Full access, including employees, settings, refunds, and AI reports |
| **Manager** | POS, orders, kitchen, menu, inventory, expenses, dashboard, activity, AI |
| **Cashier** | POS, order viewing, order status updates |
| **Kitchen** | Kitchen display only |
| **Inventory** | Stock, purchasing, and expense creation |

Permissions are data, not hard-coded checks. They live in `permissions`, `role_permissions`, and `profiles.role_id`. The UI filters navigation with `has_permission_public`, while RLS and RPCs enforce the same permission codes in PostgreSQL. Changing a role takes effect on the next database check; inactive accounts are rejected immediately by `app.has_permission`.

The permission matrix is visible in **Employees → Role permission matrix**.

---

## Core business rules

### Order lifecycle

```text
draft ──► new ──► preparing ──► ready ──► served ──► completed
  │         │          │           │          │
  └─────────┴──────────┴───────────┴──────────┴──► cancelled
```

- `draft` is created by `create_order`; sending to the kitchen moves it to `new`.
- `completed` requires `payment_status = 'paid'`.
- Cancellation requires a reason and reverses inventory if it was already deducted.
- Every transition is checked against `order_status_transitions` and the caller's permission.
- Allowed transitions are deliberately narrow; invalid jumps raise `INVALID_TRANSITION`.

### Money

- `subtotal` is recomputed from database prices, never trusted from the client.
- Discounts are percentage or fixed amount, capped by `max_cashier_discount_percent` unless the user has `orders.cancel` (manager/owner).
- Tax is `(subtotal − discount) × tax_percent`.
- Service charge is `(subtotal − discount) × service_charge_percent`.
- Grand total is `subtotal − discount + tax + service charge`.
- Payments can be partial. An invoice is generated when the paid total reaches the grand total.
- Historical order lines keep a `unit_cost` snapshot so later ingredient price changes do not rewrite past profit.

### Inventory

- `inventory.quantity` is maintained only by the `inventory_transactions` trigger. Balances are a ledger, not an editable field.
- Recipe consumption is deducted once per order. `orders.inventory_deducted_at` is the guard.
- The deduction point is controlled by `restaurant_settings.inventory_deduct_on` (`new` or `preparing`); completion also triggers deduction if it has not happened yet.
- Cancellation creates `reversal` transactions. If the kitchen already used the ingredients, `waste` can be recorded instead.
- Purchases update a weighted-average ingredient cost. Menu production costs are derived from current ingredient costs.
- `allow_negative_stock` is enforced by the stock RPC. When false, a movement that would go below zero is rejected.
- `inventory_consistency()` compares each balance with the ledger sum; the Sync/health tooling can surface drift.

### Payments and refunds

- Payment methods are configured in `payment_methods`. Card and wallet methods require a terminal/gateway reference.
- `pay_order` is idempotent by `client_operation_id`; replaying the same operation returns the original result.
- `refund_order` marks settled payments refunded and sets the order payment status to `refunded`. Stock is not automatically returned on refund; use cancellation with an explicit waste decision if the food was prepared.
- There is **no online card gateway** in this repository. Card and wallet are recorded as terminal/manual references; integrate Paymob/Stripe/etc. behind an Edge Function before taking live online payments.

### Security and audit

- RLS is enabled on protected tables; the browser cannot bypass it with the anon key.
- Financial and stock tables are RPC-only for authenticated users.
- The activity log is append-only for application roles and records actor, action, table, record, details, and timestamp.
- Storage buckets: `menu-images` public read, `expense-receipts` private, `documents` restricted to `settings.manage`.
- The AI key is server-side only. AI prompts are built from the caller's RLS-filtered data and include a data-only instruction boundary.

---

## Offline behaviour

Supported offline operations:

1. **Create order / send to kitchen**
2. **Create order + take payment + send to kitchen**
3. **Take payment on an existing order**
4. **Status transition** (where queued)

The browser stores the operation in IndexedDB with a UUID generated once. On reconnect, the worker replays it with exponential backoff. The server-side `sync_operations` ledger makes retries idempotent, so a repeated `create_order`, `pay_order`, or status change cannot create a duplicate order or charge.

The catalog and settings are cached in IndexedDB so the POS can still render a menu during an outage. Offline card payments can be disabled in Settings; if disabled, the UI refuses to queue a card/wallet payment while offline.

The **Sync** page shows the local outbox, server ledger, pending/failed counts, and retry controls.

---

## AI assistant and reports

Two Edge Functions are included:

- `ai-assistant` — answers questions from the last 30 days of RLS-filtered KPIs, item sales, expenses, low stock, and today's metrics.
- `ai-daily-report` — generates a structured daily summary for a selected date.

Safeguards:

- `has_permission_public('ai.use')` is checked before any model call.
- `ai_consume_quota` limits each user to 30 AI calls per hour.
- The prompt instructs the model to treat the data block as untrusted data, not instructions.
- Responses are stored in `ai_messages` / `ai_reports` with RLS.
- The model name and API key are server-side secrets.

To test locally:

```bash
cp supabase/functions/.env.example supabase/functions/.env
# add GEMINI_API_KEY
npx supabase functions serve --env-file supabase/functions/.env
```

---

## Deployment to Hostinger

The frontend is a static SPA. Supabase remains the backend.

1. Set production values in `.env` (only public Supabase values).
2. Build:

```bash
npm run build
```

3. Upload the **contents** of `dist/` to Hostinger's `public_html` (or the target subdirectory).
4. Keep `public/.htaccess` in the upload. Vite copies it to `dist/`. It provides SPA fallback, compression, cache headers, and basic security headers. If the app is served from a subfolder, update `RewriteBase`.
5. In Supabase → Authentication → URL Configuration:
   - Set **Site URL** to the production URL.
   - Add the production URL to **Redirect URLs**.
6. Apply migrations and deploy Edge Functions (see above).
7. Verify the health of the deployment:
   - Sign in as owner.
   - Create a test order and send it to the kitchen.
   - Open the kitchen display in another tab and confirm the ticket arrives without a refresh.
   - Take payment and confirm the invoice and dashboard update.
   - Check the activity log and the Sync page.

Because environment variables are baked into the Vite build, changing `VITE_SUPABASE_URL` or the anon key requires a rebuild.

---

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Vite on port 5173 |
| `npm run build` | Type-check and build production assets to `dist/` |
| `npm run preview` | Preview the production build |
| `npm run typecheck` | TypeScript project build check |
| `npm run lint` | ESLint over `.ts` and `.tsx` |
| `npm test` | Vitest unit tests |
| `npm run db:push` | Push local migrations to the linked Supabase project |
| `npm run db:reset` | Reset local Supabase and apply migrations + seed |
| `npm run gen:types` | Generate TypeScript types from local Supabase |
| `npm run functions:serve` | Serve Edge Functions locally |
| `npm run functions:deploy` | Deploy Edge Functions |

---

## Database migrations

| Migration | Contents |
|---|---|
| `001_extensions_and_helpers.sql` | Extensions, `app` schema, timestamps, idempotency ledger, service-role helper |
| `002_auth_profiles_rbac.sql` | Roles, permissions, profiles, employees, new-user trigger, admin RPCs |
| `003_settings.sql` | Branches, restaurant settings, payment methods, order types, expense categories |
| `004_menu_recipes.sql` | Categories, ingredients, menu items, recipes, live cost view |
| `005_orders_payments.sql` | Orders, items, status history, payments, invoices, transitions, RPCs, RLS |
| `006_inventory.sql` | Suppliers, balances, ledger trigger, consumption/reversal, purchasing, stocktake, views |
| `007_expenses.sql` | Expense register and voiding |
| `008_audit.sql` | Append-only activity log and generic audit triggers |
| `009_dashboard_views.sql` | KPI views and reporting functions |
| `010_sync.sql` | Sync health/reporting support |
| `011_ai.sql` | AI messages, reports, and metrics |
| `012_rls_verification_storage_realtime.sql` | Anon lockout, storage buckets/policies, realtime publication, RLS inventory |
| `013_api_wrappers.sql` | PostgREST wrappers for reporting functions |
| `014_ai_quota.sql` | Per-user hourly AI quota |

Apply in order. `supabase db push` and `supabase db reset` handle ordering automatically.

---

## Validation and tests

Current checks in this workspace:

- `npm run build` — passes.
- `npm run typecheck` — passes as part of the build.
- `npm run lint` — passes with ESLint + TypeScript rules.
- `npm test` — 6 Vitest unit tests for formatting and permission-independent helpers pass.
- `npm audit --omit=dev` — reports 0 production-dependency vulnerabilities. The remaining advisories are confined to the local build/test/lint toolchain (Vite 5, Vitest 2, and ESLint's `minimatch` chain); they do not ship in `dist/`.
- **SQL verification** — migrations 001–014 and `seed.sql` were applied to a temporary PostgreSQL 16 database with Supabase-compatible `auth`, `storage`, role, and realtime stubs. The following were exercised successfully:
  - `create_order` database pricing, tax, service charge, and grand total.
  - `set_order_status` progression `draft → new → preparing → ready → completed`.
  - Inventory deduction at `preparing`, ledger rows, and cancellation reversal back to the original balance.
  - `pay_order` full payment, invoice creation, and idempotent replay by `client_operation_id`.
  - Menu-cost view, daily KPI view, and the RLS inventory view (`v_tables_without_rls` returned 0 rows).

The repository does **not** yet contain a committed, automated integration test suite against a running Supabase instance. Recommended next tests:

1. RLS matrix tests for every role/table/action pair.
2. SQL transaction tests for `create_order`, `pay_order`, cancellation/reversal, and stocktake.
3. Offline replay tests that simulate duplicate operation IDs.
4. Playwright end-to-end tests for POS → KDS → payment → invoice.
5. Migration smoke test in CI using `supabase db reset`.

The activity log and `v_tables_without_rls` view are intended to support those checks.

---

## Known limitations and next steps

- **No live Supabase project is configured in this repository.** The app intentionally stops at `/setup` until `.env` is provided.
- **No online payment gateway.** Card and wallet payments are manual/terminal references. Add a gateway Edge Function with signed webhooks and idempotency before handling live money.
- **Single-branch UI.** The schema carries a `branches` table and branch IDs, but the current UI assumes one active branch/settings row.
- **English UI, Arabic-capable data.** Menu and ingredient names have Arabic fields; the interface is not yet RTL/localized.
- **AI scheduling is manual.** `ai_report_time` exists in settings, but the daily report is generated from the UI. Configure Supabase Cron + an HTTP call if you want automatic reports.
- **No customer-facing ordering, delivery dispatch, or loyalty module.**
- **No automated database integration tests yet.** See the recommended list above.
- **Tax/service/discount rules are intentionally simple.** Multi-tax, per-item tax, split bills, tips, and compound discounts are not implemented.
- **Offline support covers supported POS operations**, not full offline administration. Conflict handling is explicit/idempotent rather than a general CRDT merge.

---

## Troubleshooting

| Symptom | Likely cause | Fix |
|---|---|---|
| Redirected to `/setup` | `.env` missing or still contains placeholder values | Create `.env` from `.env.example` and restart Vite |
| Sign-in succeeds but modules are hidden | Profile missing, inactive, or no role | Promote/activate the profile with the SQL in step 4 |
| `SETTINGS_MISSING` | Migrations applied but seed/settings row absent | Run `supabase/seed.sql` |
| `INVALID_TRANSITION` | Status jump not allowed, or stale order state | Refresh the order and use the displayed allowed action |
| `REFERENCE_REQUIRED` | Card/wallet payment without a terminal reference | Enter the terminal or wallet reference |
| `INSUFFICIENT_STOCK` | Negative stock is disabled and a movement would go below zero | Receive stock or enable negative stock in Settings |
| Orders not appearing on KDS | Realtime publication missing or wrong project | Re-apply migration 012 and check Realtime is enabled |
| AI returns 503 | `GEMINI_API_KEY` not set | Set the secret and redeploy the Edge Functions |
| Images do not load | Storage bucket/policy missing | Re-apply migration 012 and check the `menu-images` bucket |
| Direct route 404 on Hostinger | `.htaccess` missing or `RewriteBase` wrong | Upload `dist/.htaccess`; set the correct base path |

---

## Documentation

- Original requirements: [`restaurant_erp_documentation.md`](./restaurant_erp_documentation.md)
- SQL schema: [`supabase/migrations`](./supabase/migrations)
- Seed data: [`supabase/seed.sql`](./supabase/seed.sql)
- Frontend source: [`src`](./src)

The codebase is intentionally organized around the document's phases: foundation and RBAC, catalog and costing, POS/orders/payments, kitchen, inventory, expenses/dashboard, audit/settings, offline sync, AI, and deployment.
