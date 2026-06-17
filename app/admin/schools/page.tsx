"use client";

import { useQuery } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
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
  const supabase = useSupabaseBrowser();
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

  if (isLoading) return <div className="space-y-6"><Skeleton className="h-96 rounded-xl bg-bg-tertiary" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-heading">Schools</h1>
          <p className="text-muted text-sm">{schools.length} schools on the platform</p>
        </div>
        <Button onClick={() => setShowAddModal(true)} className="w-full sm:w-auto">
          <Plus className="h-4 w-4 mr-1" /> Add School
        </Button>
      </div>

      <div className="relative max-w-md">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
        <Input placeholder="Search schools..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-10 bg-bg-tertiary border-border text-heading" />
      </div>

      <Card className="border-border bg-bg-tertiary">
        <CardContent className="p-0">
          {filtered.length === 0 ? (
            <div className="p-12 text-center">
              <Building2 className="w-16 h-16 mx-auto mb-4 text-muted" />
              <p className="text-muted">No schools found</p>
            </div>
          ) : (
            <div className="divide-y divide-border/50">
              {filtered.map((s) => (
                <div key={s.id} className="flex flex-col sm:flex-row sm:items-center gap-3 sm:gap-4 p-4 hover:bg-card-hover">
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-lg bg-warning-50 flex items-center justify-center text-secondary font-bold shrink-0">
                      {s.name?.slice(0, 2).toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-heading truncate">{s.name}</p>
                      <p className="text-xs text-muted truncate">
                        {s.district || "-"} * {s.phone || "-"} * Created {formatDate(s.created_at)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-wrap sm:flex-nowrap">
                    <Badge variant={planColors[s.subscription_plan] || "default"}>{s.subscription_plan}</Badge>
                    <Badge variant={s.subscription_status === "active" ? "success" : s.subscription_status === "trial" ? "warning" : "destructive"}>
                      {s.subscription_status}
                    </Badge>
                    <span className="text-sm text-muted">
                      {formatUGX(planPrices[s.subscription_plan] || 0)}/mo
                    </span>
                    <Button
                      variant="outline"
                      size="sm"
                      className="border-warning-100 text-secondary hover:bg-card-hover"
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
                      className="border-border text-heading hover:bg-card-hover"
                      onClick={() => router.push(`/admin/schools/${s.id}`)}
                    >
                      <Eye className="h-4 w-4 mr-1" /> View
                    </Button>
                  </div>
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
                className="w-full rounded-lg border border-border bg-bg-tertiary px-3 py-2 text-sm text-heading focus:border-border-strong focus:outline-none focus:ring-1 focus:ring-brand-100"
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
                  // Soft refresh: invalidate the list query (if any) and
                  // ask the App Router to re-render server components.
                  // Avoids losing transient UI state from a hard reload.
                  router.refresh();
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
