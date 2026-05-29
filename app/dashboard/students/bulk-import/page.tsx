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
import { Upload, FileSpreadsheet, CheckCircle, XCircle, Loader2, Download } from 'lucide-react';

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

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected && selected.type === 'text/csv') {
      setFile(selected);
      setResult(null);
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

  const handleImport = async () => {
    if (!file || !school) return;

    setImporting(true);
    const supabase = createBrowserClient();

    try {
      const text = await file.text();
      const lines = text.split('\n').filter(line => line.trim());
      const headers = lines[0].split(',').map(h => h.trim().toLowerCase());

      const requiredHeaders = ['full_name', 'parent_name', 'parent_phone'];
      const missing = requiredHeaders.filter(h => !headers.includes(h));
      if (missing.length > 0) {
        toast({ title: `Missing required columns: ${missing.join(', ')}`, variant: 'destructive' });
        setImporting(false);
        return;
      }

      let success = 0;
      let failed = 0;
      const errors: string[] = [];

      // Get classes for mapping
      const { data: classes } = await supabase
        .from('classes')
        .select('id, name')
        .eq('school_id', school.id);

      const classMap = new Map(classes?.map((c: { name: string; id: string }) => [c.name.toLowerCase(), c.id]) || []);

      // Get current student count for admission number generation
      const { count } = await supabase
        .from('students')
        .select('*', { count: 'exact', head: true })
        .eq('school_id', school.id);

      let seq = (count ?? 0) + 1;

      for (let i = 1; i < lines.length; i++) {
        const values = lines[i].split(',').map(v => v.trim());
        const row: Record<string, string> = {};
        headers.forEach((h, idx) => {
          row[h] = values[idx] || '';
        });

        try {
          if (!row.full_name || !row.parent_name || !row.parent_phone) {
            throw new Error(`Row ${i + 1}: Missing required fields`);
          }

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
          errors.push(err.message || `Row ${i + 1}: Unknown error`);
        }
      }

      setResult({ success, failed, errors });

      // Audit log
      await supabase.from('audit_logs').insert({
        school_id: school.id,
        action: 'bulk_import',
        entity_type: 'student',
        new_value: { success, failed, filename: file.name },
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
                    if (fileRef.current) fileRef.current.value = '';
                  }}
                >
                  Remove
                </Button>
              </div>
            )}

            <Button onClick={handleImport} disabled={!file || importing} className="w-full">
              {importing ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Importing...
                </>
              ) : (
                <>
                  <Upload className="w-4 h-4 mr-2" />
                  Import Students
                </>
              )}
            </Button>
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
