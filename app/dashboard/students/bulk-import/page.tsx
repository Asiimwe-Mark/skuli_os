'use client';

import { useState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { createBrowserClient } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download, Eye } from 'lucide-react';

interface ParsedRow {
  row: number;
  full_name: string;
  admission_number: string;
  date_of_birth: string;
  gender: string;
  parent_name: string;
  parent_phone: string;
  parent_email: string;
  class_name: string;
  valid: boolean;
  error?: string;
}

interface ImportResult {
  success: number;
  failed: number;
  errors: string[];
}

export default function BulkImportPage() {
  const router = useRouter();
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [previewData, setPreviewData] = useState<ParsedRow[] | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'text/csv') {
      setFile(selected);
      setResult(null);
      setPreviewData(null);
    } else {
      toast({ title: 'Please select a CSV file', variant: 'destructive' });
    }
  };

  const downloadTemplate = () => {
    const template = 'full_name,admission_number,date_of_birth,gender,parent_name,parent_phone,parent_email,class_name\nJohn Doe,ADM-00001,2015-03-15,male,Jane Doe,0712345678,jane@example.com,Class 1';
    const blob = new Blob([template], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'student_import_template.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  const handlePreview = async () => {
    if (!file) return;

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const parsedHeaders = lines[0].split(',').map(h => h.trim().toLowerCase());
      setHeaders(parsedHeaders);

      const requiredHeaders = ['full_name', 'parent_name', 'parent_phone'];
      const missing = requiredHeaders.filter(h => !parsedHeaders.includes(h));
      if (missing.length > 0) {
        toast({ title: `Missing required columns: ${missing.join(', ')}`, variant: 'destructive' });
        return;
      }

      const rows: ParsedRow[] = [];
      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        parsedHeaders.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        const valid = !!(row.full_name && row.parent_name && row.parent_phone);
        rows.push({
          row: i + 1,
          full_name: row.full_name || '',
          admission_number: row.admission_number || '',
          date_of_birth: row.date_of_birth || '',
          gender: row.gender || '',
          parent_name: row.parent_name || '',
          parent_phone: row.parent_phone || '',
          parent_email: row.parent_email || '',
          class_name: row.class_name || '',
          valid,
          error: valid ? undefined : 'Missing required fields (full_name, parent_name, parent_phone)',
        });
      }

      setPreviewData(rows);
    } catch (err: any) {
      toast({ title: 'Failed to parse CSV', description: err.message, variant: 'destructive' });
    }
  };

  const handleImport = async () => {
    if (!file || !school || !previewData) return;

    setImporting(true);
    const supabase = createBrowserClient();

    try {
      const validRows = previewData.filter(r => r.valid);
      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      // Get classes for mapping
      const { data: classes } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', school.id);

      const classMap = new Map(classes?.map((c: any) => [c.name.toLowerCase(), c.id]) || []);

      // Get current student count for admission number generation
      const { count } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id);

      let seq = (count ?? 0) + 1;

      for (const row of validRows) {
        try {
          const admissionNumber = row.admission_number || `ADM-${String(seq).padStart(5, '0')}`;
          const classId = row.class_name ? classMap.get(row.class_name.toLowerCase()) : null;

          const { error } = await supabase.from('students').insert({
            school_id: school.id,
            full_name: row.full_name,
            admission_number: admissionNumber,
            date_of_birth: row.date_of_birth || null,
            gender: row.gender || null,
            parent_name: row.parent_name,
            parent_phone: row.parent_phone,
            parent_email: row.parent_email || null,
            current_class_id: classId,
            enrollment_date: new Date().toISOString().split('T')[0],
            status: 'active',
          });

          if (error) throw new Error(error.message);

          success++;
          seq++;
        } catch (err: any) {
          failed++;
          errors.push(`Row ${row.row}: ${err.message || 'Unknown error'}`);
        }
      }

      // Count skipped invalid rows
      const skipped = previewData.length - validRows.length;
      if (skipped > 0) {
        errors.push(`${skipped} row(s) skipped due to validation errors`);
      }

      setResult({ success, failed, errors });

      // Audit log
      await supabase.from('audit_logs').insert({
        school_id: school.id,
        action: 'bulk_import',
        entity_type: 'student',
        new_value: { success, failed, skipped, filename: file.name },
      });

      if (success > 0) {
        toast({ title: `Imported ${success} students successfully` });
      }
    } catch (err: any) {
      toast({ title: 'Import failed', description: err.message, variant: 'destructive' });
    } finally {
      setImporting(false);
    }
  };

  const validCount = previewData?.filter(r => r.valid).length || 0;
  const invalidCount = previewData?.filter(r => !r.valid).length || 0;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Bulk Import Students</h1>
        <p className="text-muted-foreground">Import students from a CSV file</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Upload CSV File</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="w-10 h-10 mx-auto text-muted-foreground mb-4" />
              <Label htmlFor="csv-file" className="cursor-pointer">
                <span className="text-primary hover:underline">Click to upload</span>
                <span className="text-muted-foreground"> or drag and drop</span>
              </Label>
              <Input
                ref={fileRef}
                id="csv-file"
                type="file"
                accept=".csv"
                className="hidden"
                onChange={handleFileChange}
              />
              <p className="text-xs text-muted-foreground mt-2">CSV files only</p>
            </div>

            {file && (
              <div className="flex items-center gap-3 p-3 bg-muted rounded-lg">
                <FileSpreadsheet className="w-5 h-5 text-primary" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{file.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {(file.size / 1024).toFixed(1)} KB
                  </p>
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
              <Button onClick={handlePreview} disabled={!file} className="w-full">
                <Eye className="w-4 h-4 mr-2" />
                Preview Data
              </Button>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2 text-sm">
                  <span className="text-green-600">{validCount} valid</span>
                  {invalidCount > 0 && <span className="text-red-600">{invalidCount} invalid</span>}
                </div>
                <Button onClick={handleImport} disabled={importing || validCount === 0} className="w-full">
                  {importing ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      Importing...
                    </>
                  ) : (
                    <>
                      <Upload className="w-4 h-4 mr-2" />
                      Import {validCount} Students
                    </>
                  )}
                </Button>
                <Button variant="outline" onClick={() => setPreviewData(null)} className="w-full">
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
            <p className="text-sm text-muted-foreground">
              Download the CSV template to see the required format for importing students.
            </p>

            <Button variant="outline" onClick={downloadTemplate} className="w-full">
              <Download className="w-4 h-4 mr-2" />
              Download Template
            </Button>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Required Columns:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- full_name</li>
                <li>- parent_name</li>
                <li>- parent_phone</li>
              </ul>
            </div>

            <div className="space-y-2">
              <h4 className="text-sm font-medium">Optional Columns:</h4>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>- admission_number (auto-generated if empty)</li>
                <li>- date_of_birth (YYYY-MM-DD)</li>
                <li>- gender (male/female)</li>
                <li>- parent_email</li>
                <li>- class_name (must match existing class)</li>
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
                <thead className="sticky top-0 bg-background">
                  <tr className="border-b">
                    <th className="text-left p-2">Row</th>
                    <th className="text-left p-2">Name</th>
                    <th className="text-left p-2">Admission #</th>
                    <th className="text-left p-2">Parent</th>
                    <th className="text-left p-2">Phone</th>
                    <th className="text-left p-2">Class</th>
                    <th className="text-left p-2">Status</th>
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row) => (
                    <tr key={row.row} className={`border-b ${!row.valid ? 'bg-red-50' : ''}`}>
                      <td className="p-2 text-muted-foreground">{row.row}</td>
                      <td className="p-2 font-medium">{row.full_name || '—'}</td>
                      <td className="p-2 text-muted-foreground">{row.admission_number || 'Auto'}</td>
                      <td className="p-2">{row.parent_name || '—'}</td>
                      <td className="p-2">{row.parent_phone || '—'}</td>
                      <td className="p-2 text-muted-foreground">{row.class_name || '—'}</td>
                      <td className="p-2">
                        {row.valid ? (
                          <span className="text-green-600 text-xs">Valid</span>
                        ) : (
                          <span className="text-red-600 text-xs" title={row.error}>Invalid</span>
                        )}
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
            <div className="grid gap-4 md:grid-cols-2">
              <div className="flex items-center gap-3 p-4 bg-green-500/10 rounded-lg">
                <CheckCircle className="w-5 h-5 text-green-500" />
                <div>
                  <p className="text-2xl font-bold">{result.success}</p>
                  <p className="text-sm text-muted-foreground">Students imported</p>
                </div>
              </div>
              <div className="flex items-center gap-3 p-4 bg-red-500/10 rounded-lg">
                <XCircle className="w-5 h-5 text-red-500" />
                <div>
                  <p className="text-2xl font-bold">{result.failed}</p>
                  <p className="text-sm text-muted-foreground">Failed rows</p>
                </div>
              </div>
            </div>

            {result.errors.length > 0 && (
              <div className="mt-4 p-4 bg-red-500/5 rounded-lg">
                <h4 className="text-sm font-medium mb-2">Errors:</h4>
                <ul className="text-sm text-muted-foreground space-y-1 max-h-40 overflow-y-auto">
                  {result.errors.map((err, i) => (
                    <li key={i}>{err}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button onClick={() => router.push('/dashboard/students')} className="mt-4">
              View Students
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
