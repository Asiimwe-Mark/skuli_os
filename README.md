# SKULI OS

A multi-tenant school management SaaS built for Ugandan private schools. Manages students, fees, academics, attendance, communication, and more across six role-based portals.

## Tech Stack

- **Framework:** Next.js 16 (App Router, RSC)
- **UI:** React 19, Tailwind CSS v4, shadcn/ui, Framer Motion
- **State:** Zustand (persisted)
- **Database:** Supabase (PostgreSQL, Auth, Storage, Edge Functions)
- **Charts:** Recharts
- **PDF:** @react-pdf/renderer
- **SMS:** Africa's Talking
- **Payments:** Flutterwave (STK Push)
- **Email:** Resend

## Environment Variables

Create a `.env.local` file with:

```bash
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Africa's Talking (SMS)
AFRICAS_TALKING_API_KEY=your-api-key
AFRICAS_TALKING_USERNAME=your-username

# Flutterwave (Payments)
FLUTTERWAVE_SECRET_KEY=your-secret-key
FLUTTERWAVE_PUBLIC_KEY=your-public-key

# Resend (Email)
RESEND_API_KEY=your-api-key
```

## Development Setup

```bash
# Install dependencies
pnpm install

# Run database migrations
npx supabase db push

# Seed admin user
npm run seed:admin

# Seed sample data
npm run seed:data

# Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000).

## User Roles & Portal Routes

| Role | Route | Description |
|------|-------|-------------|
| `SUPER_ADMIN` | `/admin` | Platform administration, manages all schools |
| `SCHOOL_ADMIN` | `/dashboard` | Full school management (students, fees, academics, reports) |
| `BURSAR` | `/dashboard/fees` | Fee collection, payments, financial reports |
| `TEACHER` | `/teacher` | Marks entry, attendance, timetable, meetings |
| `PARENT` | `/portal` | View child's fees, results, attendance, communicate with school |
| `GROUP_ADMIN` | `/group` | Multi-school group oversight and analytics |

## Database

### Migrations

```bash
# Apply all migrations
npx supabase db push

# Create a new migration
npx supabase migration new migration_name
```

### Seeding

```bash
# Seed admin user (required first)
npm run seed:admin

# Seed sample data (students, classes, fees, etc.)
npm run seed:data
```

## Project Structure

```
app/
  admin/          # SUPER_ADMIN portal
  dashboard/      # SCHOOL_ADMIN + BURSAR portal
  teacher/        # TEACHER portal
  portal/         # PARENT portal
  group/          # GROUP_ADMIN portal
  api/            # API routes
  login/          # Auth pages
components/
  dashboard/      # Shared dashboard components (sidebar, topbar)
  teacher/        # Teacher-specific components
  ui/             # shadcn/ui primitives
  shared/         # Cross-portal shared components
store/            # Zustand stores (school, ui)
lib/              # Utilities, Supabase clients, hooks
supabase/
  migrations/     # SQL migration files
```

## Deployment

### Vercel

1. Connect your GitHub repository to Vercel
2. Set environment variables in Vercel dashboard
3. Deploy — Vercel auto-detects Next.js

### Supabase

1. Create a project at [supabase.com](https://supabase.com)
2. Run migrations: `npx supabase db push`
3. Seed data via the SQL editor or seed scripts
4. Enable Auth providers (Email magic link is default)

## Design System

Dark-first theme with:
- **Background:** Navy (#0A1628)
- **Surface:** #0F1F3D
- **Accent:** Amber (#F5A623)
- **Secondary:** Emerald
- **Text:** White/foreground with opacity variants

All portals are fully responsive (mobile-first with lg: breakpoints).
