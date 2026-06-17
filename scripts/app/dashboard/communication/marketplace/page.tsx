"use client";

import { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useToast } from "@/components/ui/use-toast";
import { Store, Eye, Download, Star, Loader2 } from "lucide-react";

type Category = "sms_template" | "fee_structure" | "report_comment";

interface Template {
  id: string;
  category: Category;
  name: string;
  description: string | null;
  body: Record<string, unknown>;
  variables: string[];
  tags: string[];
  use_count: number;
  is_featured: boolean;
}

interface ClassOption { id: string; name: string }
interface TermOption { id: string; name: string }

const TABS: { key: "all" | Category; label: string }[] = [
  { key: "all", label: "All" },
  { key: "sms_template", label: "SMS Templates" },
  { key: "fee_structure", label: "Fee Structures" },
  { key: "report_comment", label: "Report Comments" },
];

export default function MarketplacePage() {
  const { school } = useSchoolStore();
  const supabase = useSupabaseBrowser();
  const { toast } = useToast();

  const [tab, setTab] = useState<"all" | Category>("all");
  const [search, setSearch] = useState("");
  const [preview, setPreview] = useState<Template | null>(null);
  const [importing, setImporting] = useState<Template | null>(null);
  const [importBusy, setImportBusy] = useState(false);
  const [classId, setClassId] = useState("");
  const [termId, setTermId] = useState("");

  const { data: templates = [], isLoading } = useQuery({
    queryKey: ["marketplace-templates", school?.id],
    queryFn: async (): Promise<Template[]> => {
      const r = await fetch("/api/marketplace");
      const res = await r.json();
      return (res.data?.templates ?? []) as Template[];
    },
    enabled: !!school?.id,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["marketplace-classes", school?.id],
    queryFn: async (): Promise<ClassOption[]> => {
      if (!school) return [];
      const { data } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school.id);
      return (data ?? []) as ClassOption[];
    },
    enabled: !!school?.id,
  });

  const { data: terms = [] } = useQuery({
    queryKey: ["marketplace-terms", school?.id],
    queryFn: async (): Promise<TermOption[]> => {
      if (!school) return [];
      const { data } = await supabase
        .from("terms")
        .select("id, name")
        .eq("school_id", school.id);
      return (data ?? []) as TermOption[];
    },
    enabled: !!school?.id,
  });

  const filtered = useMemo(() => {
    return templates.filter((t) => {
      if (tab !== "all" && t.category !== tab) return false;
      if (search && !`${t.name} ${t.description ?? ""}`.toLowerCase().includes(search.toLowerCase())) return false;
      return true;
    });
  }, [templates, tab, search]);

  const featured = filtered.filter((t) => t.is_featured);
  const rest = filtered.filter((t) => !t.is_featured);

  async function doImport(t: Template, target: Category) {
    setImportBusy(true);
    try {
      const res = await fetch(`/api/marketplace/${t.id}/import`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          target,
          class_id: target === "fee_structure" ? classId : undefined,
          term_id: target === "fee_structure" ? termId : undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Import failed");
      toast({
        title: "Template imported",
        description:
          target === "fee_structure"
            ? `Imported ${json.data.imported} fee items.`
            : "Imported to your SMS Templates.",
        variant: "success",
      });
      setImporting(null);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setImportBusy(false);
    }
  }

  function startImport(t: Template) {
    if (t.category === "fee_structure") {
      setImporting(t);
    } else {
      doImport(t, t.category);
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-64" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <Store className="w-6 h-6 text-warning-600" /> Template Marketplace
        </h1>
        <p className="text-muted text-sm">Curated SMS templates and fee structures ready to import</p>
      </motion.div>

      <div className="flex flex-wrap gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-3 py-1.5 rounded-lg text-sm transition-colors ${ tab === t.key ? "bg-warning-50 text-warning-600" : "text-muted hover:bg-card-hover" }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search templates..."
        className="w-full sm:max-w-sm rounded-lg bg-bg-tertiary border border-border px-3 py-2 text-sm"
      />

      {featured.length > 0 && (
        <div className="space-y-3">
          <h2 className="text-sm font-semibold flex items-center gap-1.5 text-warning-600">
            <Star className="w-4 h-4" /> Featured
          </h2>
          <Grid items={featured} onPreview={setPreview} onImport={startImport} />
        </div>
      )}

      <div className="space-y-3">
        <h2 className="text-sm font-semibold text-muted">All templates</h2>
        {rest.length === 0 ? (
          <p className="text-sm text-muted">No templates found.</p>
        ) : (
          <Grid items={rest} onPreview={setPreview} onImport={startImport} />
        )}
      </div>

      {/* Preview dialog */}
      <Dialog open={!!preview} onOpenChange={(o) => !o && setPreview(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{preview?.name}</DialogTitle>
          </DialogHeader>
          <pre className="text-xs bg-bg-tertiary rounded-lg p-3 overflow-x-auto whitespace-pre-wrap">
            {JSON.stringify(preview?.body, null, 2)}
          </pre>
        </DialogContent>
      </Dialog>

      {/* Fee-structure import dialog */}
      <Dialog open={!!importing} onOpenChange={(o) => !o && setImporting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Import fee structure</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-muted mb-1 block">Class</label>
              <select value={classId} onChange={(e) => setClassId(e.target.value)} className="w-full rounded-lg bg-bg-tertiary border border-border px-3 py-2 text-sm">
                <option value="">Select class</option>
                {classes.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>
            <div>
              <label className="text-xs text-muted mb-1 block">Term</label>
              <select value={termId} onChange={(e) => setTermId(e.target.value)} className="w-full rounded-lg bg-bg-tertiary border border-border px-3 py-2 text-sm">
                <option value="">Select term</option>
                {terms.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button
              onClick={() => importing && doImport(importing, "fee_structure")}
              disabled={!classId || !termId || importBusy}
            >
              {importBusy ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
              Import
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function Grid({
  items,
  onPreview,
  onImport,
}: {
  items: Template[];
  onPreview: (t: Template) => void;
  onImport: (t: Template) => void;
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
      {items.map((t) => (
        <Card key={t.id} className="bg-card">
          <CardHeader>
            <CardTitle className="text-base flex items-start justify-between gap-2">
              <span>{t.name}</span>
              {t.is_featured && <Star className="w-4 h-4 text-warning-600 shrink-0" />}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-xs text-muted line-clamp-2">{t.description}</p>
            <div className="flex flex-wrap gap-1">
              {t.tags.map((tag) => (
                <Badge key={tag} className="bg-bg-tertiary text-muted text-[10px]">{tag}</Badge>
              ))}
            </div>
            <p className="text-[10px] text-muted">Used {t.use_count} times</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="flex-1" onClick={() => onPreview(t)}>
                <Eye className="w-3.5 h-3.5 mr-1" /> Preview
              </Button>
              <Button size="sm" className="flex-1" onClick={() => onImport(t)}>
                <Download className="w-3.5 h-3.5 mr-1" /> Import
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
