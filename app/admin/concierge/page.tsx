"use client";

import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { HeadphonesIcon } from "lucide-react";

type Status = "new" | "contacted" | "in_progress" | "completed" | "cancelled";

interface Lead {
  id: string;
  school_name: string;
  contact_name: string;
  contact_phone: string;
  contact_email: string;
  district: string | null;
  student_count: number | null;
  current_system: string | null;
  status: Status;
  created_at: string;
}

const STATUS_BADGE: Record<Status, string> = {
  new: "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400",
  contacted: "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400",
  in_progress: "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400",
  completed: "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400",
  cancelled: "bg-bg-tertiary text-muted",
};

const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "new", label: "New" },
  { key: "in_progress", label: "In Progress" },
  { key: "completed", label: "Completed" },
];

const NEXT_STATUSES: Status[] = ["contacted", "in_progress", "completed", "cancelled"];

export default function AdminConciergePage() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [filter, setFilter] = useState("all");

  // SECURITY/FUNCTIONAL (audit 12.x): the previous useCallback + useEffect
  // pattern had three problems:
  //   1. setState synchronously inside an effect (lint rejects it).
  //   2. No cancellation — a slow response landed after the user
  //      switched filter and overwrote leads with stale data.
  //   3. The cancelled flag was missing entirely.
  // useQuery handles all three: auto-cancellation, dedup, isLoading,
  // and the queryKey automatically refires when the filter changes.
  const { data: leads = [], isLoading: loading } = useQuery<Lead[]>({
    queryKey: ["concierge-leads", filter],
    queryFn: async () => {
      const res = await fetch(`/api/admin/concierge?status=${filter}`);
      if (!res.ok) return [];
      const json = await res.json();
      return (json.data?.leads ?? []) as Lead[];
    },
  });

  async function setStatus(lead: Lead, status: Status) {
    // Optimistic update via the query cache. We snapshot the previous
    // list so we can roll back on error, and we invalidate after
    // success so the server-truth overwrites our optimistic value.
    const previous = queryClient.getQueryData<Lead[]>(["concierge-leads", filter]);
    queryClient.setQueryData<Lead[]>(["concierge-leads", filter], (old) =>
      (old ?? []).map((l) => (l.id === lead.id ? { ...l, status } : l)),
    );
    try {
      const res = await fetch(`/api/admin/concierge/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Updated", description: `Lead marked ${status}.`, variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["concierge-leads"] });
    } catch (err) {
      if (previous) {
        queryClient.setQueryData(["concierge-leads", filter], previous);
      }
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <HeadphonesIcon className="w-6 h-6 text-warning-600" /> Concierge Leads
        </h1>
        <p className="text-muted text-sm">Paid setup service requests.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${ filter === f.key ? "bg-warning-50 text-warning-600" : "text-muted hover:bg-card-hover" }`}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <Skeleton className="h-64 rounded-xl" />
      ) : (
        <Card className="bg-card">
          <CardHeader><CardTitle className="text-lg">Leads</CardTitle></CardHeader>
          <CardContent>
            {leads.length === 0 ? (
              <p className="text-sm text-muted py-6 text-center">No leads.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-muted border-b border-border">
                      <th className="py-2 pr-4">School</th>
                      <th className="py-2 pr-4">Contact</th>
                      <th className="py-2 pr-4">Phone</th>
                      <th className="py-2 pr-4">Students</th>
                      <th className="py-2 pr-4">System</th>
                      <th className="py-2 pr-4">Date</th>
                      <th className="py-2 pr-4">Status</th>
                      <th className="py-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {leads.map((l) => (
                      <tr key={l.id} className="border-b border-border">
                        <td className="py-2 pr-4">{l.school_name}</td>
                        <td className="py-2 pr-4">{l.contact_name}</td>
                        <td className="py-2 pr-4">{l.contact_phone}</td>
                        <td className="py-2 pr-4">{l.student_count ?? "-"}</td>
                        <td className="py-2 pr-4">{l.current_system ?? "-"}</td>
                        <td className="py-2 pr-4">{new Date(l.created_at).toLocaleDateString()}</td>
                        <td className="py-2 pr-4"><Badge className={STATUS_BADGE[l.status]}>{l.status}</Badge></td>
                        <td className="py-2">
                          <select
                            value=""
                            onChange={(e) => e.target.value && setStatus(l, e.target.value as Status)}
                            className="rounded-lg bg-bg-tertiary border border-border px-2 py-1 text-xs"
                          >
                            <option value="">Change status</option>
                            {NEXT_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}
    </div>
  );
}
