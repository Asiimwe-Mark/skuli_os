"use client";

import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Building2, Search } from "lucide-react";
import { useState } from "react";
import type { Database } from "@/types/database";

type SchoolRow = Database['public']['Tables']['schools']['Row'];

export default function AdminSchoolsPage() {
  const supabase = createBrowserClient();
  const [search, setSearch] = useState("");

  const { data: schools = [], isLoading } = useQuery<SchoolRow[]>({
    queryKey: ["admin-schools"],
    queryFn: async () => {
      const res = await fetch("/api/admin/schools");
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load schools");
      return (json.data?.schools || json.schools || []) as SchoolRow[];
    },
  });

  const filtered = schools.filter((s) => s.name?.toLowerCase().includes(search.toLowerCase()));

  const planPrices: Record<string, number> = { starter: 50000, growth: 120000, pro: 250000 };
  const planColors: Record<string, "default" | "success" | "warning"> = { starter: "default", growth: "success", pro: "warning" };

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-96 rounded-xl bg-white/5" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Schools</h1>
          <p className="text-white/60 text-sm">{schools.length} schools on the platform</p>
        </div>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/40" />
        <Input placeholder="Search schools..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-white/5 border-white/10 text-white" />
      </div>

      <Card className="border-white/10 bg-white/5">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-white/20" />
              <p className="text-white/40">No schools found</p>
            </div>
          ) : (
            <div className="divide-y divide-white/5">
              {filtered.map((s) => (
                <div key={s.id} className="flex items-center gap-4 p-4 hover:bg-white/5">
                  <div className="w-12 h-12 rounded-lg bg-amber-400/10 flex items-center justify-center text-amber-400 font-bold">
                    {s.name?.slice(0, 2).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-white truncate">{s.name}</p>
                    <p className="text-xs text-white/40">
                      {s.district || "—"} · {s.phone || "—"} · Created {formatDate(s.created_at)}
                    </p>
                  </div>
                  <Badge variant={planColors[s.subscription_plan] || "default"}>{s.subscription_plan}</Badge>
                  <Badge variant={s.subscription_status === "active" ? "success" : s.subscription_status === "trial" ? "warning" : "destructive"}>
                    {s.subscription_status}
                  </Badge>
                  <span className="text-sm text-white/60 min-w-[80px] text-right">
                    {formatUGX(planPrices[s.subscription_plan] || 0)}/mo
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
