"use client";

import { useEffect, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { Store, Star } from "lucide-react";

interface AdminTemplate {
  id: string;
  category: string;
  name: string;
  description: string | null;
  use_count: number;
  is_featured: boolean;
}

export default function AdminMarketplacePage() {
  const { toast } = useToast();
  const [rows, setRows] = useState<AdminTemplate[]>([]);
  const [loading, setLoading] = useState(true);

  function load() {
    fetch("/api/admin/marketplace")
      .then((r) => r.json())
      .then((res) => setRows(res.data?.templates ?? []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }

  useEffect(load, []);

  async function toggleFeatured(t: AdminTemplate) {
    const res = await fetch("/api/admin/marketplace", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id: t.id, is_featured: !t.is_featured }),
    });
    if (res.ok) {
      setRows((prev) => prev.map((r) => (r.id === t.id ? { ...r, is_featured: !r.is_featured } : r)));
    } else {
      toast({ title: "Error", description: "Failed to update", variant: "destructive" });
    }
  }

  if (loading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="w-6 h-6 text-warning-600" /> Marketplace
        </h1>
        <p className="text-muted text-sm">Manage curated templates and featured status.</p>
      </div>

      <Card className="bg-card">
        <CardHeader><CardTitle className="text-lg">All templates</CardTitle></CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-muted border-b border-border">
                  <th className="py-2 pr-4">Name</th>
                  <th className="py-2 pr-4">Category</th>
                  <th className="py-2 pr-4">Uses</th>
                  <th className="py-2 pr-4">Featured</th>
                  <th className="py-2">Actions</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((t) => (
                  <tr key={t.id} className="border-b border-border">
                    <td className="py-2 pr-4">{t.name}</td>
                    <td className="py-2 pr-4"><Badge className="bg-bg-tertiary text-muted text-[10px]">{t.category}</Badge></td>
                    <td className="py-2 pr-4">{t.use_count}</td>
                    <td className="py-2 pr-4">{t.is_featured ? <Star className="w-4 h-4 text-warning-600" /> : "-"}</td>
                    <td className="py-2">
                      <Button size="sm" variant="outline" onClick={() => toggleFeatured(t)}>
                        {t.is_featured ? "Unfeature" : "Feature"}
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
