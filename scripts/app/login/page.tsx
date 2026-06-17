"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ThemeToggle } from "@/components/theme-toggle";
import {
  Loader2, ArrowLeft, Mail, Sparkles, ShieldCheck, Zap,
} from "lucide-react";

function LoginForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnUrl = searchParams.get("returnUrl");
  const errorParam = searchParams.get("error");

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [magicLinkLoading, setMagicLinkLoading] = useState(false);
  const [error, setError] = useState("");
  const [magicLinkSent, setMagicLinkSent] = useState(false);

  const supabase = useSupabaseBrowser();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      // Map common Supabase auth errors to user-friendly messages; the raw
      // message can leak which auth provider or which constraint failed.
      const msg = (authError.message || "").toLowerCase();
      if (msg.includes("invalid login") || msg.includes("invalid credentials")) {
        setError("Invalid email or password. Please try again.");
      } else if (msg.includes("email not confirmed")) {
        setError("Please confirm your email address before signing in. Check your inbox.");
      } else if (msg.includes("too many requests") || msg.includes("rate limit")) {
        setError("Too many sign-in attempts. Please wait a minute and try again.");
      } else if (msg.includes("user not found")) {
        setError("No account found with that email.");
      } else {
        setError("Sign-in failed. Please check your credentials and try again.");
      }
      setLoading(false);
      return;
    }

    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .maybeSingle();

    const roleRedirects: Record<string, string> = {
      SUPER_ADMIN: "/admin",
      SCHOOL_ADMIN: "/dashboard",
      BURSAR: "/dashboard/fees",
      TEACHER: "/teacher",
      PARENT: "/portal",
      GROUP_ADMIN: "/group",
    };

    const roleRedirect = roleRedirects[userData?.role || ""] || "/dashboard";
    const isValidReturn = returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//");
    const destination = isValidReturn ? returnUrl : roleRedirect;
    // Use router.push (not window.location) so React state survives and we
    // don't trigger a hard reload right after a successful sign-in. A hard
    // reload mid-hydration was the source of the auth redirect loop on the
    // live URL.
    router.push(destination);
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError("Enter your email to receive a magic link");
      return;
    }
    setMagicLinkLoading(true);
    setError("");

    const isValidReturn = returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//");
    const safeReturn = isValidReturn ? returnUrl : "/dashboard";
    const { error: magicError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(safeReturn)}`,
      },
    });

    if (magicError) {
      // Supabase's magic-link errors include the underlying auth reason. We
      // only surface a generic, actionable message to the caller.
      setError("We couldn't send a magic link to that email. Please check the address and try again.");
    } else {
      setMagicLinkSent(true);
    }
    setMagicLinkLoading(false);
  };

  return (
    <div className="relative min-h-screen flex items-center justify-center p-4 overflow-hidden">
      <div className="absolute top-6 right-6 z-20">
        <ThemeToggle />
      </div>

      <div className="relative z-10 w-full max-w-5xl grid lg:grid-cols-2 gap-8 items-center">
        {/* Left brand panel */}
        <motion.div
          initial={{ opacity: 0, x: -20 }}
          animate={{ opacity: 1, x: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="hidden lg:flex flex-col gap-6 text-heading"
        >
          <Link href="/" className="inline-flex items-center gap-2 group">
            <div className="relative">
              <div className="absolute -inset-1 rounded-2xl opacity-50 blur-md" />
              <div className="relative w-12 h-12 rounded-2xl flex items-center justify-center shadow-pop">
                <span className="font-display font-bold text-white text-lg">S</span>
              </div>
            </div>
            <span className="font-display text-2xl font-bold tracking-tight">
              <span className="">SKULI</span>
            </span>
          </Link>

          <h1 className="font-display text-4xl xl:text-5xl font-bold leading-[1.1] tracking-tight">
            The <span className="">operating system</span> for your school
          </h1>
          <p className="text-muted text-lg leading-relaxed max-w-md">
            Manage fees, track results, send SMS alerts, and run payroll - all from one beautifully simple platform.
          </p>

          <div className="flex flex-col gap-3 mt-2 max-w-sm">
            {[
              { icon: Zap,        label: "Built for Ugandan schools" },
              { icon: ShieldCheck,label: "Bank-grade security & daily backups" },
              { icon: Sparkles,   label: "Mobile Money & SMS in one place" },
            ].map((item) => (
              <div key={item.label} className="flex items-center gap-3 text-sm">
                <div className="h-9 w-9 rounded-xl bg-bg-tertiary text-primary ring-1 flex items-center justify-center shrink-0">
                  <item.icon className="h-4 w-4" />
                </div>
                <span className="text-heading-500 font-medium">{item.label}</span>
              </div>
            ))}
          </div>
        </motion.div>

        {/* Right form */}
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-md mx-auto"
        >
          <Link
            href="/"
            className="inline-flex items-center gap-2 text-muted hover:text-heading mb-5 transition-colors lg:hidden"
          >
            <ArrowLeft className="w-4 h-4" />
            Back to Home
          </Link>

          <Card className="shadow-pop">
            {/* Gradient top border */}
            <div className="absolute inset-x-0 top-0 h-1 rounded-t-2xl" />

            <CardHeader>
              <div className="flex items-center gap-2 mb-2">
                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-bg-tertiary text-primary text-[10px] font-semibold uppercase tracking-wider">
                  <Sparkles className="h-2.5 w-2.5" />
                  Welcome back
                </span>
              </div>
              <CardTitle className="text-2xl">Sign in to SKULI</CardTitle>
              <CardDescription>
                Enter your credentials to access your dashboard
              </CardDescription>
            </CardHeader>

            <CardContent>
              {errorParam === "auth_callback_failed" && (
                <motion.div
                  initial={{ opacity: 0, y: -5 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="mb-4 p-3 bg-danger-50 border border-danger-50 rounded-xl text-danger-600 dark:bg-danger-900/30 dark:text-danger-400 text-sm flex items-center gap-2"
                >
                  <span className="h-1.5 w-1.5 rounded-full bg-bg-tertiary" />
                  Authentication failed. Please try again.
                </motion.div>
              )}

              {magicLinkSent ? (
                <motion.div
                  initial={{ opacity: 0, scale: 0.95 }}
                  animate={{ opacity: 1, scale: 1 }}
                  className="text-center py-8"
                >
                  <div className="relative w-16 h-16 mx-auto mb-4">
                    <div className="absolute inset-0 rounded-full opacity-30 blur-xl" />
                    <div className="relative w-16 h-16 rounded-full flex items-center justify-center shadow-card">
                      <Mail className="w-7 h-7 text-white" />
                    </div>
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Check your email</h3>
                  <p className="text-muted text-sm">
                    We sent a magic link to <strong className="text-heading">{email}</strong>. Click the link to sign in.
                  </p>
                  <Button
                    variant="ghost"
                    className="mt-4"
                    onClick={() => setMagicLinkSent(false)}
                  >
                    Back to login
                  </Button>
                </motion.div>
              ) : (
                <form onSubmit={handleLogin} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="email">Email</Label>
                    <Input
                      id="email"
                      type="email"
                      placeholder="school@example.com"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      required
                      autoComplete="email"
                    />
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <Label htmlFor="password">Password</Label>
                      <button
                        type="button"
                        onClick={handleMagicLink}
                        disabled={magicLinkLoading}
                        className="text-xs text-primary hover:text-heading transition-colors font-medium"
                      >
                        {magicLinkLoading ? "Sending..." : "Use magic link"}
                      </button>
                    </div>
                    <Input
                      id="password"
                      type="password"
                      placeholder="?EUR??EUR??EUR??EUR??EUR??EUR??EUR??EUR?"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      required
                      autoComplete="current-password"
                    />
                  </div>

                  {error && (
                    <motion.p
                      initial={{ opacity: 0, y: -5 }}
                      animate={{ opacity: 1, y: 0 }}
                      className="text-danger-600 dark:text-danger-400 text-sm flex items-center gap-2"
                    >
                      <span className="h-1.5 w-1.5 rounded-full bg-bg-tertiary" />
                      {error}
                    </motion.p>
                  )}

                  <Button
                    type="submit"
                    variant="default"
                    className="w-full"
                    size="lg"
                    loading={loading}
                  >
                    {!loading && "Sign In"}
                  </Button>
                </form>
              )}
            </CardContent>

            <CardFooter className="flex flex-col gap-4">
              <div className="text-sm text-muted text-center">
                Don't have an account?{" "}
                <Link
                  href="/onboard"
                  className="text-primary hover:text-heading font-semibold transition-colors"
                >
                  Start free trial ?+'
                </Link>
              </div>
            </CardFooter>
          </Card>
        </motion.div>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginForm />
    </Suspense>
  );
}
