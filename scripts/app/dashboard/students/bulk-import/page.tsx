'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useQueryClient } from '@tanstack/react-query';
import * as XLSX from 'xlsx';
import Papa from 'papaparse';
import { useSchoolStore } from '@/store/school';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/components/ui/use-toast';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download, Eye, AlertTriangle } from 'lucide-react';

interface RawRow {
  full_name?: string;
  first_name?: string;
  last_name?: string;
  admission_number?: string;
  date_of_birth?: string;
  enrollment_date?: string;
  gender?: string;
  parent_name?: string;
  parent_phone?: string;
  parent_email?: string;
  class_name?: string;
}

interface PreviewRow extends RawRow {
  row: number;
  displayName: string;
  error?: string;
  warning?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  skipped: number;
  errors: { row: number; reason: string }[];
}

const CHUNK_SIZE = 50;

function resolveName(r: RawRow): string {
  if (r.full_name?.trim()) return r.full_name.trim();
  return `${r.first_name?.trim() ?? ''} ${r.last_name?.trim() ?? ''}`.trim();
}

export default function BulkImportPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [parsing, setParsing] = useState(false);
  const [importing, setImporting] = useState(false);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<PreviewRow[] | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (!selected) return;
    const name = selected.name.toLowerCase();
    if (name.endsWith('.csv') || name.endsWith('.xlsx') || name.endsWith('.xls')) {
      setFile(selected);
      setResult(null);
      setPreviewData(null);
    } else {
      toast({ title: 'Please select a CSV or Excel file', variant: 'destructive' });
    }
  };

  const downloadTemplate = () => {
    const template =
      'full_name,admission_number,date_of_birth,enrollment_date,gender,parent_name,parent_phone,parent_email,class_name\n' +
      'Namugga Aisha,ADM-2025-0001,2015-03-15,2025-02-03,female,Nakato Sarah,0772345678,sarah.nakato@example.com,Primary 1\n' +
      'Okello Brian,,2014-08-22,2025-02-03,male,Okello Joseph,0701234567,,Primary 2';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  // Parse the file into CSV text (xlsx -> first sheet -> csv), then papaparse.
  async function parseFile(f: File): Promise<RawRow[]> {
    const name = f.name.toLowerCase();
    let csvText: string;
    if (name.endsWith('.xlsx') || name.endsWith('.xls')) {
      const buf = await f.arrayBuffer();
      const wb = XLSX.read(buf, { type: 'array' });
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      csvText = XLSX.utils.sheet_to_csv(firstSheet);
    } else {
      csvText = await f.text();
    }

    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transformHeader: (h) => h.trim().toLowerCase(),
    });

    return (parsed.data ?? []).map((row) => ({
      full_name: row.full_name?.trim(),
      first_name: row.first_name?.trim(),
      last_name: row.last_name?.trim(),
      admission_number: row.admission_number?.trim(),
      date_of_birth: row.date_of_birth?.trim(),
      enrollment_date: row.enrollment_date?.trim(),
      gender: row.gender?.trim()?.toLowerCase(),
      parent_name: row.parent_name?.trim(),
      parent_phone: row.parent_phone?.trim(),
      parent_email: row.parent_email?.trim(),
      class_name: row.class_name?.trim(),
    }));
  }

  const handlePreview = async () => {
    if (!file) return;
    setParsing(true);
    try {
      const rows = await parseFile(file);
      if (rows.length === 0) {
        toast({ title: 'No rows found in file', variant: 'destructive' });
        setParsing(false);
        return;
      }

      // Server-side validation (class existence + duplicate admission numbers).
      const res = await fetch('/api/students/bulk-import/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows }),
      });
      const json = await res.json();
      if (!res.ok) {
        toast({ title: 'Validation failed', description: json.error, variant: 'destructive' });
        setParsing(false);
        return;
      }

      const errorByRow = new Map<number, string>();
      const warnByRow = new Map<number, string>();
      for (const e of json.data.errors as { row: number; reason: string }[]) errorByRow.set(e.row, e.reason);
      for (const w of json.data.warnings as { row: number; reason: string }[]) warnByRow.set(w.row, w.reason);

      const preview: PreviewRow[] = rows.map((r, i) => ({
        ...r,
        row: i + 1,
        displayName: resolveName(r),
        error: errorByRow.get(i + 1),
        warning: warnByRow.get(i + 1),
      }));
      setPreviewData(preview);
    } catch (err) {
      toast({ title: 'Failed to parse file', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setParsing(false);
    }
  };

  const handleImport = async () => {
    if (!file || !school || !previewData) return;
    setImporting(true);
    setProgress(0);

    // Only rows without a blocking error are sent. Rows with warnings
    // (duplicate admission numbers) are still sent; the server skips them.
    const validRows = previewData
      .filter((r) => !r.error)
      .map((r) => ({
        full_name: r.full_name || undefined,
        first_name: r.first_name || undefined,
        last_name: r.last_name || undefined,
        admission_number: r.admission_number || undefined,
        date_of_birth: r.date_of_birth || undefined,
        enrollment_date: r.enrollment_date || undefined,
        gender: (r.gender as 'male' | 'female' | 'other') || undefined,
        parent_name: r.parent_name,
        parent_phone: r.parent_phone,
        parent_email: r.parent_email || undefined,
        class_name: r.class_name,
      }));

    const total = validRows.length;
    let imported = 0;
    let skipped = 0;
    const errors: { row: number; reason: string }[] = [];

    try {
      for (let i = 0; i < total; i += CHUNK_SIZE) {
        const chunk = validRows.slice(i, i + CHUNK_SIZE);
        const response = await fetch('/api/students/bulk-import', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: chunk }),
        });
        const json = await response.json();
        if (json.success) {
          imported += json.data.imported ?? 0;
          skipped += json.data.skipped ?? 0;
          for (const e of (json.data.errors ?? []) as { row: number; reason: string }[]) {
            errors.push({ row: i + e.row, reason: e.reason });
          }
        } else {
          errors.push({ row: i + 1, reason: json.error || 'Chunk failed' });
        }
        setProgress(Math.round(Math.min(i + CHUNK_SIZE, total) / total * 100));
      }

      setResult({ success: imported, failed: errors.length, skipped, errors });
      if (imported > 0) {
        // Audit 10.x: invalidate every consumer of the students list
        // and the dashboard KPIs so the next visit to /students or
        // /dashboard shows the new rows immediately, without a hard
        // navigation. Also nudge the Next App Router so any server
        // component rendering the count (header badges, etc.) re-fetches.
        queryClient.invalidateQueries({ queryKey: ["students"] });
        queryClient.invalidateQueries({ queryKey: ["classes"] });
        queryClient.invalidateQueries({ queryKey: ["dashboard"] });
        queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
        router.refresh();
        toast({ title: `Imported ${imported} students successfully` });
      }
    } catch (err) {
      toast({ title: 'Import failed', description: err instanceof Error ? err.message : undefined, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const downloadResults = () => {
    if (!result) return;
    const lines = ['row,reason', ...result.errors.map((e) => `${e.row},"${e.reason.replace(/"/g, '""')}"`)];
    const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'import_errors.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = previewData?.filter((r) => !r.error).length || 0;
  const errorCount = previewData?.filter((r) => r.error).length || 0;
  const warningCount = previewData?.filter((r) => r.warning).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk Import Students</h1>
        <p className="text-muted">Import students from a CSV or Excel file</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Upload File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-10 h-10 mx-auto text-muted mb-4" />
              <Label htmlFor="import-file" className="cursor-pointer">
                <span className="text-primary hover:underline">Click to upload</span>
                <span className="text-muted"> or drag and drop</span>
              </Label>
              <Input
                ref={fileRef}
                id="import-file"
                type="file"
                accept=".csv,.xlsx,.xls"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted mt-2">CSV, XLSX or XLS</p>
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 bg-bg-tertiary rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted">{(file.size / 1024).toFixed(1)} KB</p>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setFile(null);
                    setResult(null);
                    setPreviewData(null);
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                >
                  Remove
                </Button>
              </div>
            )}

            {!previewData ? (
              <Button onClick={handlePreview} disabled={!file || parsing} className="w-full">
                {parsing ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Eye className="w-4 h-4 mr-2" />}
                {parsing ? 'Validating...' : 'Preview Data'}
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex flex-wrap gap-3 text-sm">
                  <span className="text-success-600">{validCount} valid</span>
                  {errorCount > 0 && <span className="text-danger-600">{errorCount} errors</span>}
                  {warningCount > 0 && <span className="text-warning-600">{warningCount} warnings</span>}
                </div>
                {importing && <Progress value={progress} />}
                <Button onClick={handleImport} disabled={importing || validCount === 0} className="w-full">
                  {importing ? (
                    <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Importing {progress}%</>
                  ) : (
                    <><Upload className="w-4 h-4 mr-2" />Import {validCount} Students</>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setPreviewData(null)} className="w-full" disabled={importing}>
                  Reset
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Template & Instructions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <p className="text-sm text-muted">
              Download the CSV template to see the required format. Excel files are also supported.
            </p>
            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Required Columns:</h4>
              <ul className="text-sm text-muted space-y-1">
                <li>- full_name (or first_name + last_name)</li>
                <li>- parent_name</li>
                <li>- parent_phone</li>
                <li>- class_name (must match an existing class)</li>
              </ul>
            </div>
            <div className="space-y-2">
              <h4 className="text-sm font-medium">Optional Columns:</h4>
              <ul className="text-sm text-muted space-y-1">
                <li>- admission_number (auto-generated if empty)</li>
                <li>- date_of_birth (YYYY-MM-DD)</li>
                <li>- enrollment_date (defaults to today)</li>
                <li>- gender (male/female/other)</li>
                <li>- parent_email</li>
              </ul>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Preview Table */}
      {previewData && !result && (
        <Card>
          <CardHeader>
            <CardTitle>Preview ({previewData.length} rows)</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto max-h-96 overflow-y-auto">
              <table className="w-full text-sm">
                <thead className="sticky top-0 bg-bg">
                  <tr className="border-b">
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Admission #</th>
                    <th className="text-left p-2">Parent</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">Class</th>
                    <th className="text-left p-2">Status</th>
                    <th className="text-left p-2">Warnings</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row) => (
                    <tr key={row.row} className={`border-b ${row.error ? 'bg-danger-50' : row.warning ? 'bg-warning-50' : ''}`}>
                      <td className="p-2 text-muted">{row.row}</td>
                      <td className="p-2 font-medium">{row.displayName || '-'}</td>
                      <td className="p-2 text-muted">{row.admission_number || 'Auto'}</td>
                      <td className="p-2">{row.parent_name || '-'}</td>
                      <td className="p-2">{row.parent_phone || '-'}</td>
                      <td className="p-2 text-muted">{row.class_name || '-'}</td>
                      <td className="p-2">
                        {row.error ? (
                          <span className="text-danger-600 text-xs" title={row.error}>Invalid</span>
                        ) : (
                          <span className="text-success-600 text-xs">Valid</span>
                        )}
                      </td>
                      <td className="p-2">
                        {row.warning && (
                          <span className="text-warning-600 text-xs flex items-center gap-1" title={row.warning}>
                            <AlertTriangle className="w-3 h-3" /> {row.warning}
                          </span>
                        )}
                        {row.error && <span className="text-danger-600 text-xs">{row.error}</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}

      {result && (
        <Card>
          <CardHeader>
            <CardTitle>Import Results</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              <div className="flex items-center gap-3 p-4 bg-success-50 rounded-lg">
                <CheckCircle className="w-5 h-5 text-success-600" />
                <div>
                  <p className="text-2xl font-bold">{result.success}</p>
                  <p className="text-sm text-muted">Imported</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-warning-50 rounded-lg">
                <AlertTriangle className="w-5 h-5 text-warning-600" />
                <div>
                  <p className="text-2xl font-bold">{result.skipped}</p>
                  <p className="text-sm text-muted">Skipped (duplicates)</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-danger-50 rounded-lg">
                <XCircle className="w-5 h-5 text-danger-600" />
                <div>
                  <p className="text-2xl font-bold">{result.failed}</p>
                  <p className="text-sm text-muted">Failed rows</p>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 p-4 bg-danger-50 rounded-lg">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-medium">Errors:</h4>
                  <Button variant="outline" size="sm" onClick={downloadResults}>
                    <Download className="w-3.5 h-3.5 mr-1" /> Download Results
                  </Button>
                </div>
                <ul className="text-sm text-muted space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>Row {err.row}: {err.reason}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              onClick={() => {
                // Invalidate before navigating so the next page shows
                // the freshly imported students even if the cache is
                // still within the staleTime window.
                queryClient.invalidateQueries({ queryKey: ["students"] });
                queryClient.invalidateQueries({ queryKey: ["dashboard"] });
                router.push('/dashboard/students');
              }}
              className="mt-4"
            >
              View Students
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
