"use client";

import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Building2, Search, Plus, Eye, Shield, Loader2 } from "lucide-react";
import { useState } from "react";
import { useRouter } from "next/navigation";
import type { Database } from "@/types/database";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { useToast } from "@/components/ui/use-toast";

type SchoolRow = Database['public']['Tables']['schools']['Row'];

export default function AdminSchoolsPage() {
  const supabase = createBrowserClient();
  const router = useRouter();
  const { toast } = useToast();
  const [search, setSearch] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [addForm, setAddForm] = useState({ name: '', district: '', admin_email: '', admin_name: '', subscription_plan: 'starter' });
  const [adding, setAdding] = useState(false);
  const [impersonatingId, setImpersonatingId] = useState<string | null>(null);

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
        <Button onClick={() => setShowAddModal(true)} className="bg-amber-400 text-black hover:bg-amber-300">
          <Plus className="h-4 w-4 mr-1" /> Add School
        </Button>
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
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-amber-400/40 text-amber-400 hover:bg-amber-400/10"
                    disabled={impersonatingId === s.id}
                    onClick={async () => {
                      setImpersonatingId(s.id);
                      try {
                        const res = await fetch("/api/admin/impersonate", {
                          method: "POST",
                          headers: { "Content-Type": "application/json" },
                          body: JSON.stringify({ school_id: s.id }),
                        });
                        const d = await res.json();
                        if (d.success && d.data?.url) {
                          window.open(d.data.url, "_blank");
                        } else {
                          toast({ title: "Failed to impersonate", description: d.error, variant: "destructive" });
                        }
                      } catch {
                        toast({ title: "Failed to impersonate", variant: "destructive" });
                      } finally {
                        setImpersonatingId(null);
                      }
                    }}
                  >
                    {impersonatingId === s.id ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Shield className="h-4 w-4 mr-1" />
                    )}
                    {impersonatingId === s.id ? "Loading..." : "Impersonate"}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    className="border-white/10 text-white hover:bg-white/10"
                    onClick={() => router.push(`/admin/schools/${s.id}`)}
                  >
                    <Eye className="h-4 w-4 mr-1" /> View
                  </Button>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add School Modal */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New School</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <Label>School Name</Label>
              <Input
                value={addForm.name}
                onChange={(e) => setAddForm((f) => ({ ...f, name: e.target.value }))}
                placeholder="St. Mary's Primary School"
              />
            </div>
            <div className="space-y-1.5">
              <Label>District</Label>
              <Input
                value={addForm.district}
                onChange={(e) => setAddForm((f) => ({ ...f, district: e.target.value }))}
                placeholder="Kampala"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Admin Name</Label>
              <Input
                value={addForm.admin_name}
                onChange={(e) => setAddForm((f) => ({ ...f, admin_name: e.target.value }))}
                placeholder="John Doe"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Admin Email</Label>
              <Input
                type="email"
                value={addForm.admin_email}
                onChange={(e) => setAddForm((f) => ({ ...f, admin_email: e.target.value }))}
                placeholder="admin@school.com"
              />
            </div>
            <div className="space-y-1.5">
              <Label>Subscription Plan</Label>
              <select
                value={addForm.subscription_plan}
                onChange={(e) => setAddForm((f) => ({ ...f, subscription_plan: e.target.value }))}
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                <option value="starter">Starter</option>
                <option value="growth">Growth</option>
                <option value="pro">Pro</option>
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setShowAddModal(false)}>Cancel</Button>
            <Button
              disabled={!addForm.name || !addForm.admin_email || adding}
              onClick={async () => {
                setAdding(true);
                const res = await fetch('/api/admin/schools', {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify(addForm),
                });
                const result = await res.json();
                if (result.success) {
                  toast({ title: 'School created successfully' });
                  setShowAddModal(false);
                  setAddForm({ name: '', district: '', admin_email: '', admin_name: '', subscription_plan: 'starter' });
                  window.location.reload();
                } else {
                  toast({ title: 'Failed', description: result.error, variant: 'destructive' });
                }
                setAdding(false);
              }}
            >
              {adding ? 'Creating...' : 'Create School'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
