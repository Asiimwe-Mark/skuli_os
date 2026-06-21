# SKULI OS — School Management Platform

A multi-tenant SaaS platform for Ugandan private schools, enabling school administrators, bursars, teachers, and parents to manage academics, fees, attendance, payroll, and communication from a single dashboard.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router) |
| UI | React 19, Tailwind v4, shadcn/ui, Framer Motion |
| Backend | Supabase (Postgres + Auth + Realtime + Storage) |
| State | Zustand (with persist middleware) |
| SMS/Voice | Africa's Talking |
| Payments | Pesapal (3.0 API + Openfloat B2C disbursements) |
| Email | Resend |
| PDF | @react-pdf/renderer |

---

## User Roles & Portal Routes

| Role | Portal | Access |
|------|--------|--------|
| `SUPER_ADMIN` | `/admin` | All schools, revenue, platform settings |
| `SCHOOL_ADMIN` | `/dashboard` | Full school management |
| `BURSAR` | `/dashboard` | Fees, payments, expenses, communication |
| `TEACHER` | `/teacher` | Marks, attendance, timetable, notices |
| `PARENT` | `/portal` | Child results, fees, attendance, messages |
| `GROUP_ADMIN` | `/group` | Multi-school group analytics |

Routing is enforced by **Supabase middleware** (`middleware.ts`) which checks the user's role on every request and redirects to the correct section.

---

## Environment Variables

Create a `.env.local` file in the project root:

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Africa's Talking (SMS)
AFRICAS_TALKING_API_KEY=your-api-key
AFRICAS_TALKING_USERNAME=your-username
AFRICAS_TALKING_SENDER_ID=SKULI

# Pesapal (Payments & Payroll disbursements)
PESAPAL_CONSUMER_KEY=your-consumer-key
PESAPAL_CONSUMER_SECRET=your-consumer-secret
PESAPAL_SANDBOX=true          # set false in production
PESAPAL_IPN_ID=               # populated automatically after first IPN registration
NEXT_PUBLIC_APP_URL=https://skuli.app

# Resend (Email)
RESEND_API_KEY=your-resend-api-key
RESEND_FROM_EMAIL=noreply@yourdomain.com

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
```

---

## Development Setup

```bash
# 1. Clone and install
git clone https://github.com/your-org/skuli-os.git
cd skuli-os
npm install

# 2. Set up environment variables (see above)
cp .env.example .env.local

# 3. Run database migrations
npm run migrate

# 4. (Optional) Seed initial data
npm run seed:admin     # Creates a SUPER_ADMIN account
npm run seed:data      # Seeds a demo school with sample data

# 5. Start development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

---

## Database Migrations

Migrations live in `/supabase/migrations/`. To apply them:

```bash
# Using Supabase CLI
supabase db push

# Or via npm script
npm run migrate
```

---

## Project Structure

```
app/
├── (marketing)/          # Landing page, pricing
├── admin/                # SUPER_ADMIN portal
├── dashboard/            # SCHOOL_ADMIN + BURSAR portal
│   ├── academics/
│   ├── attendance/
│   ├── communication/
│   ├── fees/
│   ├── library/
│   ├── settings/
│   ├── staff/
│   └── students/
├── teacher/              # TEACHER portal (PWA-ready)
├── portal/               # PARENT portal
├── group/                # GROUP_ADMIN portal
├── login/                # Auth pages
├── onboard/              # School onboarding flow
└── api/                  # API routes (every route uses lib/http)

components/
├── dashboard/            # Sidebar, Topbar, Command Palette
├── teacher/              # Teacher-specific components
├── portal/               # Parent portal components
├── shared/               # EmptyState, DataTable, StatCard
└── ui/                   # shadcn/ui primitives

lib/
└── http/                 # The route() wrapper + Zod / RBAC / cache
                           # helpers. Every app/api/**/route.ts imports
                           # from here; @/lib/api-helpers is forbidden
                           # by eslint.config.mjs.

store/
├── school.ts             # School context (Zustand)
└── ui.ts                 # UI state with localStorage persistence
```

---

## API Route Contract

Every `app/api/**/route.ts` follows the same shape:

```ts
import { route } from "@/lib/http";
import { mySchema } from "@/lib/validations/...";

export const POST = route({
  roles: ["SCHOOL_ADMIN"],
  schema: mySchema,
  handler: async (ctx, body) => {
    // ctx.profile.school_id is guaranteed non-null for non-SUPER_ADMIN
    // ctx.supabase is the user's session-bound client
    return await doWork(ctx, body);
  },
});
```

The `route()` wrapper composes:

1. **Auth + RBAC** — `getSupabaseAndUser()` and role gating, applied before
   the handler runs. Handlers that need cross-tenant access (e.g. SUPER_ADMIN
   on `/api/admin/*`) set `noSchoolRequired: true`.
2. **Body validation** — Zod schemas passed as `schema:` are parsed before
   the handler. The handler's second argument is the typed `body`.
3. **Error envelope** — handlers throw `AuthError("...", 404)` for known
   client errors or return a value for success. Unhandled exceptions route
   through `handleRouteError` and never leak PG messages.

`publicRoute()` is the same shape but without Supabase auth — used by
`/api/webhooks/*`, `/api/auth/callback`, `/api/concierge/request`,
`/api/onboard`, `/api/referral/validate`, and `/api/push/process-queue`.
Webhooks verify HMAC inside the handler.

ESLint enforces the contract: `app/api/**/route.ts` cannot import
`@/lib/api-helpers` (the source of the old hand-rolled pattern) or
`@supabase/supabase-js` directly. See `eslint.config.mjs`.

---

## Deployment

### Vercel (recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Deploy
vercel --prod
```

Add all environment variables in the Vercel project settings under **Settings → Environment Variables**.

### Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run migrations: `supabase db push`
3. Configure Auth providers (Email/Password enabled by default)
4. Set up Row Level Security (RLS) policies per the migration files
5. Enable Realtime for `in_app_notifications` table

---

## Key Features

- **Multi-tenant** — each school is isolated by `school_id` with RLS
- **Role-based routing** — middleware enforces portal separation
- **Offline-ready attendance** — teacher attendance syncs from localStorage when online
- **Realtime notifications** — Supabase Realtime channels for in-app alerts
- **PDF generation** — report cards, fee receipts, payslips via @react-pdf/renderer
- **SMS integration** — Africa's Talking for fee reminders and school notices
- **Mobile-first** — responsive at 375px+ with mobile hamburger sidebars

---

## License

Private — All rights reserved.
