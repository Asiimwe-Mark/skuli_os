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

  // Role-based route protection
  if (pathname.startsWith('/dashboard') && !role) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/admin') && role !== 'SUPER_ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  if (pathname.startsWith('/portal') && role !== 'PARENT') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Group admin portal
  if (pathname.startsWith('/group') && role !== 'GROUP_ADMIN' && role !== 'SUPER_ADMIN') {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Teachers can only access /dashboard/classes, /dashboard/academics, /dashboard/attendance
  if (role === 'TEACHER') {
    const allowedPrefixes = [
      '/dashboard/classes',
      '/dashboard/academics',
      '/dashboard/attendance',
      '/dashboard/settings',
    ];
    const isAllowed = allowedPrefixes.some(prefix => pathname.startsWith(prefix));
    if (!isAllowed && pathname !== '/dashboard') {
      const url = request.nextUrl.clone();
      url.pathname = '/dashboard/classes';
      return NextResponse.redirect(url);
    }
  }

  // Bursar cannot access academic record editing
  if (role === 'BURSAR' && pathname.startsWith('/dashboard/academics/marks')) {
    const url = request.nextUrl.clone();
    url.pathname = '/dashboard/fees';
    return NextResponse.redirect(url);
  }

  return supabaseResponse;
}
