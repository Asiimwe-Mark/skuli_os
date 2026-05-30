"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { LayoutDashboard, Building2, DollarSign, Settings, LogOut, GraduationCap, Menu, X } from "lucide-react";

const NAV_ITEMS = [
  { label: "Overview", href: "/admin", icon: LayoutDashboard },
  { label: "Schools", href: "/admin/schools", icon: Building2 },
  { label: "Revenue", href: "/admin/revenue", icon: DollarSign },
  { label: "Settings", href: "/admin/settings", icon: Settings },
];

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const supabase = createBrowserClient();
  const [ready, setReady] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function check() {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (cancelled) return;
        if (!user) { router.push("/login"); return; }
        const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
        if (cancelled) return;
        if (profile?.role !== "SUPER_ADMIN") { router.push("/dashboard"); return; }
        setReady(true);
      } catch {
        // On error, still render the page — don't redirect to /login (causes loop)
        if (!cancelled) setReady(true);
      }
    }
    check();
    return () => { cancelled = true; };
  }, [supabase, router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-navy flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-amber border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-navy">
      {/* Mobile hamburger */}
      <button
        className="lg:hidden fixed top-3 left-3 z-50 p-2 rounded-lg bg-navy-100 border border-border-subtle text-muted-foreground hover:text-foreground"
        onClick={() => setMobileOpen(!mobileOpen)}
      >
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Mobile backdrop */}
      {mobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/60 lg:hidden"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside className={cn(
        "fixed left-0 top-0 bottom-0 w-64 bg-navy-100 border-r border-border-subtle flex flex-col z-40 transition-transform duration-300",
        "lg:translate-x-0",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        <div className="p-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-foreground" />
          </div>
          <span className="text-lg font-bold">SKULI <span className="text-xs text-amber">Admin</span></span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                pathname === item.href
                  ? "bg-amber/10 text-amber"
                  : "text-muted-foreground hover:text-foreground hover:bg-navy-50/50"
              )}
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="p-3">
          <button
            onClick={async () => { await supabase.auth.signOut(); router.push("/login"); }}
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-navy-50/50 w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="lg:ml-64 p-6">
        {children}
      </main>
    </div>
  );
}
