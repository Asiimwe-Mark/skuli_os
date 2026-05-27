"use client";

import { Suspense, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
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
import { Loader2, ArrowLeft, Mail } from "lucide-react";

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

  const supabase = createBrowserClient();

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");

    const { data, error: authError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    // Get user role for redirect
    const { data: userData } = await supabase
      .from("users")
      .select("role")
      .eq("id", data.user.id)
      .single();

    const roleRedirects: Record<string, string> = {
      SUPER_ADMIN: "/admin",
      SCHOOL_ADMIN: "/dashboard",
      BURSAR: "/dashboard",
      TEACHER: "/dashboard/attendance",
      PARENT: "/portal",
    };

    const roleRedirect = roleRedirects[userData?.role || ""] || "/dashboard";
    const isValidReturn = returnUrl && returnUrl.startsWith("/") && !returnUrl.startsWith("//");
    const destination = isValidReturn ? returnUrl : roleRedirect;
    router.push(destination);
  };

  const handleMagicLink = async () => {
    if (!email) {
      setError("Enter your email to receive a magic link");
      return;
    }
    setMagicLinkLoading(true);
    setError("");

    const { error: magicError } = await supabase.auth.signInWithOtp({
      email,
      options: {
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(returnUrl || "/dashboard")}`,
      },
    });

    if (magicError) {
      setError(magicError.message);
    } else {
      setMagicLinkSent(true);
    }
    setMagicLinkLoading(false);
  };

  return (
    <div className="min-h-screen bg-navy flex items-center justify-center p-4">
      {/* Background gradient */}
      <div className="fixed inset-0 bg-gradient-to-br from-navy via-navy-300 to-navy opacity-50" />
      <div className="fixed top-1/4 left-1/4 w-96 h-96 bg-amber/5 rounded-full blur-3xl" />
      <div className="fixed bottom-1/4 right-1/4 w-96 h-96 bg-emerald/5 rounded-full blur-3xl" />

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
        className="relative z-10 w-full max-w-md"
      >
        {/* Back to home */}
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-6 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Home
        </Link>

        <Card className="border-navy-50/50 bg-navy-100/80 backdrop-blur-xl">
          <CardHeader className="text-center">
            <Link href="/" className="inline-block mb-4">
              <h1 className="text-3xl font-display font-bold text-foreground">
                SK<span className="text-amber">U</span>LI
              </h1>
            </Link>
            <CardTitle className="text-2xl">Welcome Back</CardTitle>
            <CardDescription>
              Sign in to manage your school
            </CardDescription>
          </CardHeader>

          <CardContent>
            {errorParam === "auth_callback_failed" && (
              <div className="mb-4 p-3 bg-rose/10 border border-rose/20 rounded-lg text-rose text-sm">
                Authentication failed. Please try again.
              </div>
            )}

            {magicLinkSent ? (
              <motion.div
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                className="text-center py-8"
              >
                <div className="w-16 h-16 bg-emerald/10 rounded-full flex items-center justify-center mx-auto mb-4">
                  <Mail className="w-8 h-8 text-emerald" />
                </div>
                <h3 className="text-lg font-semibold mb-2">Check your email</h3>
                <p className="text-muted-foreground text-sm">
                  We sent a magic link to <strong>{email}</strong>. Click the
                  link to sign in.
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
                      className="text-xs text-amber hover:text-amber-300 transition-colors"
                    >
                      {magicLinkLoading ? "Sending..." : "Use magic link"}
                    </button>
                  </div>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
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
                    className="text-rose text-sm"
                  >
                    {error}
                  </motion.p>
                )}

                <Button
                  type="submit"
                  className="w-full"
                  size="lg"
                  disabled={loading}
                >
                  {loading ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Signing in...
                    </>
                  ) : (
                    "Sign In"
                  )}
                </Button>
              </form>
            )}
          </CardContent>

          <CardFooter className="flex flex-col gap-4">
            <div className="text-sm text-muted-foreground text-center">
              Don&apos;t have an account?{" "}
              <Link
                href="/onboard"
                className="text-amber hover:text-amber-300 font-medium transition-colors"
              >
                Start free trial
              </Link>
            </div>
          </CardFooter>
        </Card>
      </motion.div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense>
      <LoginForm />
    </Suspense>
  );
}
