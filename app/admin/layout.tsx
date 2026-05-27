"use client";

import { useEffect, useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { LayoutDashboard, Building2, DollarSign, Settings, LogOut, GraduationCap } from "lucide-react";

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

  useEffect(() => {
    async function check() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { router.push("/login"); return; }
      const { data: profile } = await supabase.from("users").select("role").eq("id", user.id).single();
      if (profile?.role !== "SUPER_ADMIN") { router.push("/dashboard"); return; }
      setReady(true);
    }
    check();
  }, [supabase, router]);

  if (!ready) {
    return (
      <div className="min-h-screen bg-[#1A1A2E] flex items-center justify-center">
        <div className="w-12 h-12 border-2 border-amber-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#1A1A2E]">
      {/* Sidebar */}
      <aside className="fixed left-0 top-0 bottom-0 w-64 bg-[#12122A] border-r border-white/5 flex flex-col">
        <div className="p-4 flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-amber-400 flex items-center justify-center">
            <GraduationCap className="w-5 h-5 text-navy-950" />
          </div>
          <span className="text-lg font-bold">SKULI <span className="text-xs text-amber-400">Admin</span></span>
        </div>
        <nav className="flex-1 p-3 space-y-1">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "flex items-center gap-3 px-3 py-2 rounded-lg text-sm transition-colors",
                pathname === item.href
                  ? "bg-amber-400/10 text-amber-400"
                  : "text-white/60 hover:text-white hover:bg-white/5"
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
            className="flex items-center gap-3 px-3 py-2 rounded-lg text-sm text-white/60 hover:text-white hover:bg-white/5 w-full"
          >
            <LogOut className="w-4 h-4" />
            Sign Out
          </button>
        </div>
      </aside>

      {/* Main */}
      <main className="ml-64 p-6">
        {children}
      </main>
    </div>
  );
}
