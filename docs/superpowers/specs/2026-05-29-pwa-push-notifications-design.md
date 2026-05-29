# PWA + Push Notifications — Design Spec

**Date:** 2026-05-29
**Step:** 12 of Skuli OS build plan

## Overview

Add Progressive Web App capabilities to the parent portal so parents can install SKULI on their home screen and receive push notifications for key school events: payments, report cards, absences, meeting reminders, and new messages.

## Scope

- Web app manifest + PWA icons
- Service worker for offline caching (static assets, offline fallback page)
- Push subscription storage (DB table + RLS)
- Push subscribe/unsubscribe API routes
- Push send API route (admin/internal)
- Shared `lib/push.ts` utility for sending pushes
- Integration into existing event flows (5 notification triggers)
- Notification opt-in UI on profile page

## Architecture Decisions

| Decision | Choice | Rationale |
|---|---|---|
| Service worker approach | Hand-written `sw.js` in `public/` | Portal is small, no build dependency, full control |
| Push sending pattern | Shared `lib/push.ts` utility, called inline | Follows existing SMS pattern, simple, works in both API routes and edge functions |
| Send triggers | Both API routes (immediate) and edge functions (batch/cron) | Immediate for payments/absences/messages, batch for meeting reminders and weekly summaries |
| Subscription storage | Dedicated `push_subscriptions` table with RLS | Clean separation, follows existing patterns |

## 1. Database — `00024_push_subscriptions.sql`

```sql
CREATE TABLE push_subscriptions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  school_id   uuid NOT NULL REFERENCES schools(id) ON DELETE CASCADE,
  user_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  endpoint    text NOT NULL,
  p256dh      text NOT NULL,
  auth        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  is_deleted  boolean NOT NULL DEFAULT false,
  UNIQUE(user_id, endpoint)
);

ALTER TABLE push_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "users_own_push_subscriptions" ON push_subscriptions FOR ALL
  USING (user_id = auth.uid());

CREATE POLICY "school_admin_view_push_subscriptions" ON push_subscriptions FOR SELECT
  USING (school_id = get_user_school_id() AND get_user_role() IN ('SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN'));

CREATE POLICY "super_admin_push_subscriptions" ON push_subscriptions FOR ALL
  USING (get_user_role() = 'SUPER_ADMIN');
```

- `UNIQUE(user_id, endpoint)` prevents duplicate subscriptions
- `is_deleted` follows existing soft-delete pattern
- `school_id` enables school-scoped queries for batch sends in edge functions
- RLS follows the 3-pattern rule: user own data, school admin scope, super admin full access

## 2. PWA Manifest + Icons

### `public/manifest.json`

```json
{
  "name": "SKULI School Portal",
  "short_name": "SKULI",
  "description": "Your school in your pocket",
  "start_url": "/portal",
  "display": "standalone",
  "background_color": "#0f1729",
  "theme_color": "#f59e0b",
  "orientation": "portrait",
  "icons": [
    { "src": "/icons/icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "/icons/icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ],
  "categories": ["education", "finance"]
}
```

### Icons

- `public/icons/icon-192.png` — amber "S" logo on navy background, 192x192
- `public/icons/icon-512.png` — same, 512x512 with maskable safe zone

### Link in layout

In `app/portal/layout.tsx`, add `<link rel="manifest" href="/manifest.json" />` to the JSX head.

## 3. Service Worker — `public/sw.js`

Two caching strategies:

- **Cache-first for static assets** — `/_next/static/`, `/icons/`, fonts. Pre-caches the offline page on install.
- **Network-first for API routes** — `/api/` GET requests fall back to cache if offline. POST/PUT/DELETE never cached.
- **Stale-while-revalidate for navigation** — serve cached page, fetch fresh copy in background.
- **Offline fallback** — redirect to `/offline` when both network and cache fail.

### `app/offline/page.tsx`

Simple branded page: SKULI logo, "You are offline" message, amber accent. No external dependencies (fully self-contained for offline use).

### Registration

`useEffect` in `app/portal/layout.tsx`:

```ts
useEffect(() => {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('/sw.js');
  }
}, []);
```

## 4. API Routes

### `app/api/push/subscribe/route.ts` (Pattern B — portal)

- `POST` — validates subscription object (endpoint, p256dh, auth)
- Upserts into `push_subscriptions` (reactivates if same user+endpoint was soft-deleted)
- Uses `createClient` from `lib/supabase/server.ts`
- RLS handles auth — user can only manage their own subscriptions

### `app/api/push/unsubscribe/route.ts` (Pattern B — portal)

- `POST` — soft-deletes subscription by endpoint for current user

### `app/api/push/send/route.ts` (Pattern A — admin)

- `POST` — accepts `{ userId, title, body, url }`
- Requires `SCHOOL_ADMIN` or higher role via `getSupabaseAndUser`
- Calls `sendPushToUser()` from `lib/push.ts`
- Returns `{ sent: number }`
- Primarily used internally by other routes/functions, not directly by the browser

## 5. Push Utility — `lib/push.ts`

```ts
import webpush from 'web-push';

webpush.setVapidDetails(
  'mailto:admin@skuli.app',
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!,
  process.env.VAPID_PRIVATE_KEY!
);

export async function sendPushToUser(
  supabase: SupabaseClient,
  userId: string,
  payload: { title: string; body: string; url?: string }
): Promise<{ sent: number }> {
  // 1. Fetch active (non-deleted) subscriptions for user
  // 2. Send webpush.sendNotification() to each
  // 3. On 410 Gone: soft-delete the subscription
  // 4. On other errors: log and continue
  // 5. Return count of successful deliveries
}
```

- Takes a Supabase client (works in both API routes and edge functions)
- Individual endpoint failures are caught, not thrown — one bad subscription doesn't block others
- Returns `{ sent: number }` for callers to log/track

## 6. Notification Triggers (5 events)

| Event | Where triggered | Push title | Push body | Push URL |
|---|---|---|---|---|
| Payment recorded | `app/api/fees/pay/route.ts` | "Payment Received" | "{amount} UGX for {student_name}" | `/portal/fees` |
| Report card published | Edge function or admin action | "Report Card Ready" | "{student_name}'s report card is available" | `/portal/results` |
| Absence recorded | `app/api/students/absence/route.ts` or edge function | "Absence Alert" | "{student_name} marked absent on {date}" | `/portal` |
| Meeting reminder | `supabase/functions/meeting-reminders/` | "Meeting Tomorrow" | "Meeting with {teacher} at {time}" | `/portal/meetings` |
| New message | `app/api/portal/messages/route.ts` (inbound) | "New Message" | "{sender_name}: {preview}" | `/portal` |

Each trigger:
1. Looks up the parent's `user_id` from the student record
2. Calls `sendPushToUser(supabase, parentId, { title, body, url })`
3. Continues normal flow (SMS, in-app notification, etc.) — push is additive

## 7. Profile Page — Notification Opt-in

Add a "Notifications" card to `app/portal/profile/page.tsx`:

- **Toggle** — "Get notified for payments, report cards, absences, meetings, and messages"
- **On enable:**
  1. Check `Notification.permission` — if `default`, call `Notification.requestPermission()`
  2. If `granted`, call `pushManager.subscribe()` with VAPID public key
  3. `POST` the subscription to `/api/push/subscribe`
  4. Show success toast
- **On disable:**
  1. `POST` to `/api/push/unsubscribe`
  2. Unsubscribe from `pushManager`
  3. Show success toast
- **If denied:** Show message explaining how to re-enable in browser settings

Follows existing card pattern: `Card > CardHeader > CardContent > toggle + description`.

## 8. VAPID Keys

- Generated via `npx web-push generate-vapid-keys`
- Stored in `.env.local`:
  - `NEXT_PUBLIC_VAPID_PUBLIC_KEY` — exposed to browser for subscription
  - `VAPID_PRIVATE_KEY` — server-side only, used by `lib/push.ts`
- `mailto:admin@skuli.app` as VAPID contact

## Dependencies to Install

- `web-push` — server-side VAPID + push sending
- `@types/web-push` — TypeScript types

## Files to Create

| File | Purpose |
|---|---|
| `public/manifest.json` | PWA manifest |
| `public/icons/icon-192.png` | PWA icon 192px |
| `public/icons/icon-512.png` | PWA icon 512px |
| `public/sw.js` | Service worker |
| `app/offline/page.tsx` | Offline fallback page |
| `lib/push.ts` | Shared push sending utility |
| `app/api/push/subscribe/route.ts` | Subscription create endpoint |
| `app/api/push/unsubscribe/route.ts` | Subscription delete endpoint |
| `app/api/push/send/route.ts` | Push send endpoint |
| `supabase/migrations/00024_push_subscriptions.sql` | DB table + RLS |

## Files to Modify

| File | Change |
|---|---|
| `app/portal/layout.tsx` | Add manifest link, SW registration, metadata |
| `app/portal/profile/page.tsx` | Add notification opt-in card |
| `app/api/fees/pay/route.ts` | Add push send after payment |
| `supabase/functions/meeting-reminders/index.ts` | Add push send alongside SMS |
| `.env.local` | Add VAPID keys |

## Testing

- Install as PWA on mobile — verify standalone mode, icons, splash screen
- Subscribe to push — verify subscription stored in DB
- Trigger each event — verify push received on device
- Go offline — verify offline page loads, cached pages work
- Unsubscribe — verify subscription soft-deleted
- Test on denied notification permission — verify graceful degradation
