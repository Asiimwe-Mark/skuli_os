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
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          );
        },
      },
    }
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const pathname = request.nextUrl.pathname;

  // Public routes — no auth needed
  const publicRoutes = ['/', '/login', '/onboard', '/api/auth', '/api/webhooks'];
  const isPublicRoute = publicRoutes.some(
    route => pathname === route || pathname.startsWith(route + '/')
  );

  // If on a public route, return
  if (isPublicRoute) {
    return supabaseResponse;
  }

  // If no user and on protected route, redirect to login
  if (!user) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('returnUrl', pathname);
    return NextResponse.redirect(url);
  }

  // Get user's role from the users table
  const { data: userData } = await supabase
    .from('users')
    .select('role, school_id')
    .eq('id', user.id)
    .single();

  const role = userData?.role;

  // Default redirect for wrong-section access: send each role to their own home
  const roleHome: Record<string, string> = {
    SUPER_ADMIN: '/admin',
    SCHOOL_ADMIN: '/dashboard',
    BURSAR: '/dashboard',
    TEACHER: '/teacher',
    PARENT: '/portal',
    GROUP_ADMIN: '/group',
  };
  const home = roleHome[role || ''] || '/login';

  // ── Section guards ──────────────────────────────────────────────────
  // Each role may only access their own section. The sidebar handles
  // fine-grained page filtering within a section.

  if (pathname.startsWith('/admin') && role !== 'SUPER_ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/portal') && role !== 'PARENT') {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/group') && role !== 'GROUP_ADMIN' && role !== 'SUPER_ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/teacher') && role !== 'TEACHER') {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/dashboard') && !['SCHOOL_ADMIN', 'BURSAR', 'SUPER_ADMIN'].includes(role || '')) {
    const url = request.nextUrl.clone();
    url.pathname = home;
    return NextResponse.redirect(url);
  }

  // ── Sub-page restrictions within a section ──────────────────────────

  // Bursar: only financial pages (fees, communication)
  if (role === 'BURSAR' && pathname.startsWith('/dashboard')) {
    const allowed = ['/dashboard/fees', '/dashboard/communication'];
    const isAllowed = allowed.some(
      (p) => pathname === p || pathname.startsWith(p + '/')
    );
    if (!isAllowed) {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/fees';
      return NextResponse.redirect(url);
    }
  }

  return supabaseResponse;
}
