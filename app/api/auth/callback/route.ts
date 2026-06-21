import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { publicRoute } from "@/lib/http";

export const GET = publicRoute(async (request) => {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const rawNext = searchParams.get("next") ?? "/dashboard";
  // Prevent open redirect: only allow same-relative paths
  const next = rawNext.startsWith("/") && !rawNext.startsWith("//") ? rawNext : "/dashboard";

  if (!code) {
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }

  try {
    const cookieStore = await cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll();
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options);
            });
          },
        },
      },
    );

    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      return NextResponse.redirect(`${origin}${next}`);
    }
    console.error(
      "[auth/callback] exchangeCodeForSession returned error:",
      error.message,
    );
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  } catch (err) {
    // exchangeCodeForSession can throw on network timeouts, malformed
    // tokens, or Supabase Auth being unreachable. Without a catch, an
    // unhandled promise rejection surfaces as a raw 500 + Next.js
    // error page. Redirect with a friendly signal instead.
    console.error("[auth/callback] exchangeCodeForSession threw:", err);
    return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`);
  }
});