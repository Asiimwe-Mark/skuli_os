import { useQuery } from '@tanstack/react-query';
"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { useSchoolStore } from "@/store/school";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { FileBarChart, FileText, Sheet, Loader2 } from "lucide-react";
import type { EmisData } from "@/lib/emis/aggregate";

interface TermOption { id: string; name: string; academic_year_id: string }

export default function EmisPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();

  const [termId, setTermId] = useState<string>("");
  const [data, setData] = useState<EmisData | null>(null);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [downloading, setDownloading] = useState<"pdf" | "xlsx" | null>(null);

  // AP-1 fix: useQuery replaces useEffect+supabase.from('terms')
  const { data: terms = [] } = useQuery<TermOption[]>({
    queryKey: ["terms", school?.id],
    queryFn: async () => {
      const res = await fetch("/api/terms", { credentials: "same-origin" });
      if (!res.ok) throw new Error("Failed to load terms");
      const json = await res.json();
      return json.data ?? [];
    },
    enabled: !!school?.id,
    staleTime: 2 * 60_000,
    select: (list) => {
      // Auto-select current term on first load
      const current = list.find((t) => (t as TermOption & { is_current?: boolean }).is_current) ?? list[0];
      if (current && !termId) setTermId(current.id);
      return list;
    },
  });

  async function generatePreview() {
    setLoadingPreview(true);
    try {
      const res = await fetch(`/api/analytics/emis/data?term_id=${termId}`);
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to load EMIS data");
      setData(json.data);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setLoadingPreview(false);
    }
  }

  async function download(kind: "pdf" | "xlsx") {
    setDownloading(kind);
    try {
      const term = terms.find((t) => t.id === termId);
      const res = await fetch(`/api/analytics/emis/${kind}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ term_id: termId || undefined, academic_year_id: term?.academic_year_id }),
      });
      if (!res.ok) throw new Error("Export failed");
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `EMIS_Report.${kind}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast({ title: "Error", description: e instanceof Error ? e.message : "Failed", variant: "destructive" });
    } finally {
      setDownloading(null);
    }
  }

  return (
    <div className="space-y-6">
      <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }}>
        <h1 className="text-2xl font-bold flex items-center gap-2">
          <FileBarChart className="w-6 h-6 text-warning-600" /> EMIS Enrolment Report
        </h1>
        <p className="text-muted text-sm">Uganda Ministry of Education format</p>
      </motion.div>

      <Card className="bg-card">
        <CardContent className="flex flex-col sm:flex-row items-stretch sm:items-end gap-3 py-5">
          <div className="flex-1">
            <label className="text-xs text-muted mb-1 block">Term</label>
            <select
              value={termId}
              onChange={(e) => setTermId(e.target.value)}
              className="w-full rounded-lg bg-bg-tertiary border border-border px-3 py-2 text-sm"
            >
              {terms.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
          <Button onClick={generatePreview} disabled={loadingPreview || !termId}>
            {loadingPreview ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Generate Preview
          </Button>
          <Button variant="outline" onClick={() => download("pdf")} disabled={downloading !== null || !termId}>
            {downloading === "pdf" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <FileText className="w-4 h-4 mr-2" />}
            Download PDF
          </Button>
          <Button variant="outline" onClick={() => download("xlsx")} disabled={downloading !== null || !termId}>
            {downloading === "xlsx" ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Sheet className="w-4 h-4 mr-2" />}
            Download XLSX
          </Button>
        </CardContent>
      </Card>

      {loadingPreview && <Skeleton className="h-64 rounded-xl" />}

      {data && !loadingPreview && (
        <div className="space-y-4">
          <Section title="Section A - School Identification">
            <KV k="School Name" v={data.school.name} />
            <KV k="District" v={data.school.district || "-"} />
            <KV k="School Code" v={data.school.schoolCode} />
            <KV k="School Type" v={data.school.schoolType || "-"} />
          </Section>

          <Section title="Section B - Enrolment by Class and Gender">
            <EmisTable
              head={["Class", "Boys", "Girls", "Total"]}
              rows={data.enrolmentByClass.map((r) => [r.className, r.boys, r.girls, r.total])}
              footer={["Total", data.totals.boys, data.totals.girls, data.totals.total]}
            />
          </Section>

          <Section title="Section C - Enrolment by Age Group">
            <EmisTable
              head={["Age group", "Boys", "Girls", "Total"]}
              rows={data.enrolmentByAge.map((r) => [r.bracket, r.boys, r.girls, r.total])}
            />
          </Section>

          <Section title="Section D - Teacher Statistics">
            <KV k="Total active staff" v={String(data.staff.totalActive)} />
            <KV k="Qualified teachers" v={String(data.staff.qualifiedTeachers)} />
            <KV k="Teacher:pupil ratio" v={data.staff.teacherPupilRatio} />
          </Section>

          <Section title="Section E - Attendance Summary">
            <KV k="Days present" v={String(data.attendance.daysPresent)} />
            <KV k="Days possible" v={String(data.attendance.daysPossible)} />
            <KV k="Attendance rate" v={`${data.attendance.rate}%`} />
          </Section>
        </div>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card className="bg-card">
      <CardHeader><CardTitle className="text-base">{title}</CardTitle></CardHeader>
      <CardContent className="space-y-2">{children}</CardContent>
    </Card>
  );
}

function KV({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex justify-between text-sm border-b border-border py-1.5">
      <span className="text-muted">{k}</span>
      <span className="font-medium">{v}</span>
    </div>
  );
}

function EmisTable({
  head,
  rows,
  footer,
}: {
  head: string[];
  rows: (string | number)[][];
  footer?: (string | number)[];
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-muted border-b border-border">
            {head.map((h) => <th key={h} className="py-2 pr-4">{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} className="border-b border-border">
              {r.map((c, j) => <td key={j} className="py-1.5 pr-4">{c}</td>)}
            </tr>
          ))}
        </tbody>
        {footer && (
          <tfoot>
            <tr className="font-bold border-t border-warning-100">
              {footer.map((c, j) => <td key={j} className="py-2 pr-4">{c}</td>)}
            </tr>
          </tfoot>
        )}
      </table>
    </div>
  );
}
