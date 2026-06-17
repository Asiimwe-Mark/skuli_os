import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            request.cookies.set({ name, value, ...options })
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set({ name, value, ...options })
          );
        },
      },
    }
  );

  // CRITICAL: any redirect we build must carry over the cookies that Supabase
  // may have just refreshed (rotated access/refresh tokens land on
  // supabaseResponse via setAll above). Building a NextResponse.redirect()
  // without copying these cookies drops the refreshed session, so the next
  // request arrives with a stale token and gets bounced to /login — the
  // redirect-loop bug. Always route redirects through this helper.
  const redirectTo = (pathname: string, searchParams?: Record<string, string>) => {
    const url = request.nextUrl.clone();
    url.pathname = pathname;
    // Clear any inherited query params unless explicitly provided.
    url.search = '';
    if (searchParams) {
      for (const [k, v] of Object.entries(searchParams)) url.searchParams.set(k, v);
    }
    const redirect = NextResponse.redirect(url);
    for (const cookie of supabaseResponse.cookies.getAll()) {
      redirect.cookies.set(cookie);
    }
    return redirect;
  };

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes — no auth needed
  const publicRoutes = ['/', '/login', '/onboard', '/api/auth', '/api/onboard'];
  const publicWebhookPaths = [
    '/api/webhooks/pesapal',
    '/api/webhooks/africas-talking/mm',
    '/api/webhooks/africas-talking/sms',
  ];
  const isPublicRoute =
    publicRoutes.some(route => pathname === route || pathname.startsWith(route + '/')) ||
    publicWebhookPaths.some(path => pathname === path);

  // If on a public route, return
  if (isPublicRoute) {
    return supabaseResponse;
  }

  // If no user and on protected route, redirect to login
  if (!user) {
    return redirectTo('/login', { returnUrl: pathname });
  }

  // Get user's role from the users table.
  // Use maybeSingle() — .single() throws PGRST116 when no row is found,
  // causing a spurious redirect to /login on the very first request after
  // sign-in (before the DB write fully propagates or when RLS is evaluated
  // with a freshly-minted JWT).
  const { data: userData, error: userError } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .maybeSingle();

  const role = userData?.role;

  // If the DB call itself errored (network blip, RLS timing, JWT edge-case),
  // let the request through rather than kicking the authenticated user.
  // The client-side layout has its own auth guard and will handle it.
  if (userError && !pathname.startsWith('/api/')) {
    return supabaseResponse;
  }

  // If user profile is genuinely missing on a protected page, redirect to login.
  // API routes handle their own auth via getSupabaseAndUser().
  if (!role && !pathname.startsWith('/api/')) {
    return redirectTo('/login');
  }

  // Default redirect for wrong-section access: send each role to their own home.
  // Bursar's home is /dashboard/fees because they're locked out of every other
  // /dashboard sub-page anyway; sending them to /dashboard just causes an
  // immediate second redirect to /dashboard/fees.
  const roleHome: Record<string, string> = {
    SUPER_ADMIN: '/admin',
    SCHOOL_ADMIN: '/dashboard',
    BURSAR: '/dashboard/fees',
    TEACHER: '/teacher',
    PARENT: '/portal',
    GROUP_ADMIN: '/group',
  };
  const home = roleHome[role || ''] || '/login';

  // ── Section guards ──────────────────────────────────────────────────
  // Each role may only access their own section. The sidebar handles
  // fine-grained page filtering within a section.
  // If the role query failed (e.g. JWT refresh edge case), let the
  // request through — the client-side layout has its own auth guard.

  if (pathname.startsWith('/admin') && role && role !== 'SUPER_ADMIN') {
    return redirectTo(home);
  }

  if (pathname.startsWith('/portal') && role && role !== 'PARENT') {
    return redirectTo(home);
  }

  if (pathname.startsWith('/group') && role && role !== 'GROUP_ADMIN' && role !== 'SUPER_ADMIN') {
    return redirectTo(home);
  }

  if (pathname.startsWith('/teacher') && role && role !== 'TEACHER') {
    return redirectTo(home);
  }

  if (pathname.startsWith('/dashboard') && role && !['SCHOOL_ADMIN', 'BURSAR'].includes(role)) {
    return redirectTo(home);
  }

  // ── Sub-page restrictions within a section ──────────────────────────
  // IMPORTANT: the Bursar restriction must run BEFORE the broad
  // /dashboard check below, otherwise a BURSAR hitting
  // /dashboard/students would pass the broad /dashboard gate (line
  // ~138) and then fail at the page-level permission check, showing
  // the user an empty / forbidden state. Audit 6.9.

  // Bursar: only financial pages (fees, communication)
  if (role === 'BURSAR' && pathname.startsWith('/dashboard')) {
    const allowed = ['/dashboard/fees', '/dashboard/communication'];
    const isAllowed = allowed.some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
    if (!isAllowed) {
      return redirectTo('/dashboard/fees');
    }
  }

  return supabaseResponse;
}
