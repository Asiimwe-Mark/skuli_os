'use client';

import { useState, useMemo, useCallback, useEffect } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { motion, AnimatePresence } from 'framer-motion';
import { useSupabaseBrowser } from '@/lib/supabase/client';
import { useSchoolStore } from '@/store/school';
import { cn } from '@/lib/utils/cn';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/components/ui/use-toast';
import {
  FileText,
  GraduationCap,
  CalendarCheck,
  CreditCard,
  ChevronRight,
  ChevronLeft,
  ArrowUp,
  ArrowDown,
  Plus,
  Trash2,
  Download,
  Save,
  Play,
  Loader2,
  FolderOpen,
} from 'lucide-react';

// ?"EUR?"EUR?"EUR Types ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

interface FieldDef {
  key: string;
  label: string;
  type: 'string' | 'number' | 'date';
}

interface FilterDef {
  field: string;
  operator: 'equals' | 'contains' | 'greater_than' | 'less_than' | 'between';
  value: string;
  value2?: string;
}

interface ReportConfig {
  source: string;
  columns: string[];
  filters: FilterDef[];
  date_from: string;
  date_to: string;
  sort_by: string;
  sort_dir: 'asc' | 'desc';
}

interface SavedReport {
  name: string;
  config: ReportConfig;
  savedAt: string;
}

// ?"EUR?"EUR?"EUR Data Source Definitions ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

const DATA_SOURCES = [
  {
    id: 'students-fees',
    title: 'Students & Fees',
    description: 'Combine student info with fee account data',
    icon: CreditCard,
    color: 'text-secondary',
    bg: 'bg-warning-50',
    border: 'border-warning-50',
  },
  {
    id: 'academics',
    title: 'Academic Marks',
    description: 'Subject marks by class, term, and exam type',
    icon: GraduationCap,
    color: 'text-secondary',
    bg: 'bg-bg-tertiary',
    border: 'border-border',
  },
  {
    id: 'attendance',
    title: 'Attendance',
    description: 'Attendance records with student details',
    icon: CalendarCheck,
    color: 'text-secondary',
    bg: 'bg-success-50',
    border: 'border-success-50',
  },
  {
    id: 'payments',
    title: 'Payments',
    description: 'All fee payments with student and receipt data',
    icon: FileText,
    color: 'text-secondary',
    bg: 'bg-bg-tertiary',
    border: 'border-border',
  },
];

const SOURCE_FIELDS: Record<string, FieldDef[]> = {
  'students-fees': [
    { key: 'student_name', label: 'Student Name', type: 'string' },
    { key: 'admission_number', label: 'Admission No.', type: 'string' },
    { key: 'class_name', label: 'Class', type: 'string' },
    { key: 'gender', label: 'Gender', type: 'string' },
    { key: 'parent_phone', label: 'Parent Phone', type: 'string' },
    { key: 'total_expected', label: 'Total Due', type: 'number' },
    { key: 'total_paid', label: 'Total Paid', type: 'number' },
    { key: 'balance', label: 'Balance', type: 'number' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
  academics: [
    { key: 'student_name', label: 'Student Name', type: 'string' },
    { key: 'class_name', label: 'Class', type: 'string' },
    { key: 'subject_name', label: 'Subject', type: 'string' },
    { key: 'exam_type', label: 'Exam Type', type: 'string' },
    { key: 'score', label: 'Score', type: 'number' },
    { key: 'max_score', label: 'Max Score', type: 'number' },
  ],
  attendance: [
    { key: 'student_name', label: 'Student Name', type: 'string' },
    { key: 'admission_number', label: 'Admission No.', type: 'string' },
    { key: 'class_name', label: 'Class', type: 'string' },
    { key: 'date', label: 'Date', type: 'date' },
    { key: 'status', label: 'Status', type: 'string' },
    { key: 'notes', label: 'Notes', type: 'string' },
  ],
  payments: [
    { key: 'student_name', label: 'Student Name', type: 'string' },
    { key: 'admission_number', label: 'Admission No.', type: 'string' },
    { key: 'amount', label: 'Amount', type: 'number' },
    { key: 'payment_method', label: 'Method', type: 'string' },
    { key: 'payment_date', label: 'Date', type: 'date' },
    { key: 'receipt_number', label: 'Receipt #', type: 'string' },
    { key: 'status', label: 'Status', type: 'string' },
  ],
};

const OPERATORS = [
  { value: 'equals', label: 'Equals' },
  { value: 'contains', label: 'Contains' },
  { value: 'greater_than', label: 'Greater than' },
  { value: 'less_than', label: 'Less than' },
  { value: 'between', label: 'Between' },
];

const SAVED_REPORTS_KEY = 'skuli-saved-reports';

// ?"EUR?"EUR?"EUR Helpers ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

function getNestedValue(obj: any, path: string): any {
  return path.split('.').reduce((acc, key) => acc?.[key], obj);
}

const fadeIn = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -12 },
};

// ?"EUR?"EUR?"EUR Main Page ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

export default function ReportBuilderPage() {
  const { toast } = useToast();
  const [step, setStep] = useState(1);
  const [config, setConfig] = useState<ReportConfig>({
    source: '',
    columns: [],
    filters: [],
    date_from: '',
    date_to: '',
    sort_by: '',
    sort_dir: 'asc',
  });

  const updateConfig = useCallback((patch: Partial<ReportConfig>) => {
    setConfig((prev) => ({ ...prev, ...patch }));
  }, []);

  const sourceLabel = DATA_SOURCES.find((s) => s.id === config.source)?.title || '';

  return (
    <div className="px-4 py-6 sm:p-8 max-w-[1200px] mx-auto">
      <motion.div {...fadeIn} className="mb-8">
        <h1 className="text-3xl font-bold text-secondary mb-2">Custom Report Builder</h1>
        <p className="text-muted">Generate custom reports by selecting data sources, columns, and filters.</p>
      </motion.div>

      {/* Step Indicator */}
      <div className="flex items-center gap-3 mb-8">
        {[
          { n: 1, label: 'Data Source' },
          { n: 2, label: 'Columns & Filters' },
          { n: 3, label: 'Preview & Export' },
        ].map((s, i) => (
          <div key={s.n} className="flex items-center gap-2">
            <button
              onClick={() => {
                if (s.n < step) setStep(s.n);
                if (s.n === 2 && config.source) setStep(2);
                if (s.n === 3 && config.source && config.columns.length > 0) setStep(3);
              }}
              className={cn(
                'w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold transition-colors',
                step === s.n
                  ? 'bg-bg-tertiary text-black'
                  : step > s.n
                  ? 'bg-warning-100 text-warning-700 cursor-pointer hover:bg-card-hover'
                  : 'bg-card border  text-heading'
              )}
            >
              {s.n}
            </button>
            <span className={cn('text-sm', step === s.n ? 'text-heading font-medium' : 'text-heading')}>
              {s.label}
            </span>
            {i < 2 && <ChevronRight className="w-4 h-4 text-heading mx-1" />}
          </div>
        ))}
      </div>

      {/* Step Content */}
      <AnimatePresence mode="wait">
        {step === 1 && (
          <motion.div key="step1" {...fadeIn}>
            <Step1Source selected={config.source} onSelect={(source) => { updateConfig({ source, columns: [], filters: [] }); setStep(2); }} />
          </motion.div>
        )}
        {step === 2 && (
          <motion.div key="step2" {...fadeIn}>
            <Step2Columns
              source={config.source}
              columns={config.columns}
              filters={config.filters}
              dateFrom={config.date_from}
              dateTo={config.date_to}
              sortBy={config.sort_by}
              sortDir={config.sort_dir}
              onChange={updateConfig}
              onNext={() => setStep(3)}
              onBack={() => setStep(1)}
            />
          </motion.div>
        )}
        {step === 3 && (
          <motion.div key="step3" {...fadeIn}>
            <Step3Preview config={config} sourceLabel={sourceLabel} onBack={() => setStep(2)} />
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Step 1: Choose Data Source ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

function Step1Source({ selected, onSelect }: { selected: string; onSelect: (id: string) => void }) {
  return (
    <div>
      <h2 className="text-lg font-semibold mb-4">Choose a Data Source</h2>
      <div className="grid gap-4 md:grid-cols-2">
        {DATA_SOURCES.map((source) => {
          const Icon = source.icon;
          const isSelected = selected === source.id;
          return (
            <button
              key={source.id}
              onClick={() => onSelect(source.id)}
              className={cn(
                'text-left p-6 rounded-lg border-2 transition-all hover:scale-[1.01]',
                isSelected
                  ? `${source.border} ${source.bg}`
                  : ' bg-card hover:border-foreground/20'
              )}
            >
              <div className="flex items-start gap-4">
                <div className={cn('p-3 rounded-lg', source.bg)}>
                  <Icon className={cn('w-6 h-6', source.color)} />
                </div>
                <div>
                  <h3 className="font-semibold text-lg">{source.title}</h3>
                  <p className="text-sm text-heading mt-1">{source.description}</p>
                </div>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Step 2: Configure Columns & Filters ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

function Step2Columns({
  source, columns, filters, dateFrom, dateTo, sortBy, sortDir, onChange, onNext, onBack,
}: {
  source: string;
  columns: string[];
  filters: FilterDef[];
  dateFrom: string;
  dateTo: string;
  sortBy: string;
  sortDir: 'asc' | 'desc';
  onChange: (patch: Partial<ReportConfig>) => void;
  onNext: () => void;
  onBack: () => void;
}) {
  const fields = SOURCE_FIELDS[source] || [];
  const available = fields.filter((f) => !columns.includes(f.key));
  const selected = columns.map((k) => fields.find((f) => f.key === k)).filter(Boolean) as FieldDef[];

  const toggleColumn = (key: string) => {
    if (columns.includes(key)) {
      onChange({ columns: columns.filter((c) => c !== key) });
    } else {
      onChange({ columns: [...columns, key] });
    }
  };

  const moveColumn = (idx: number, dir: -1 | 1) => {
    const newCols = [...columns];
    const target = idx + dir;
    if (target < 0 || target >= newCols.length) return;
    [newCols[idx], newCols[target]] = [newCols[target], newCols[idx]];
    onChange({ columns: newCols });
  };

  const addFilter = () => {
    onChange({ filters: [...filters, { field: fields[0]?.key || '', operator: 'equals', value: '' }] });
  };

  const updateFilter = (idx: number, patch: Partial<FilterDef>) => {
    const newFilters = [...filters];
    newFilters[idx] = { ...newFilters[idx], ...patch };
    onChange({ filters: newFilters });
  };

  const removeFilter = (idx: number) => {
    onChange({ filters: filters.filter((_, i) => i !== idx) });
  };

  return (
    <div className="space-y-6">
      {/* Column Selection */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* Available Fields */}
        <Card className="bg-card">
          <CardHeader><CardTitle className="text-sm">Available Fields</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {available.map((field) => (
              <label
                key={field.key}
                className="flex items-center gap-3 p-2 rounded-md hover:bg-card-hover cursor-pointer"
              >
                <Checkbox checked={false} onCheckedChange={() => toggleColumn(field.key)} />
                <span className="text-sm">{field.label}</span>
                <Badge variant="outline" className="text-xs ml-auto">{field.type}</Badge>
              </label>
            ))}
            {available.length === 0 && (
              <p className="text-sm text-heading py-4 text-center">All fields selected</p>
            )}
          </CardContent>
        </Card>

        {/* Selected Columns */}
        <Card className="bg-card">
          <CardHeader>
            <CardTitle className="text-sm">
              Selected Columns ({selected.length})
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-1.5">
            {selected.map((field, idx) => (
              <div
                key={field.key}
                className="flex items-center gap-2 p-2 rounded-md bg-warning-50 border border-warning-50"
              >
                <div className="flex flex-col gap-0.5">
                  <button
                    onClick={() => moveColumn(idx, -1)}
                    disabled={idx === 0}
                    className="p-0.5 hover:bg-card-hover rounded disabled:opacity-20"
                  >
                    <ArrowUp className="w-3 h-3" />
                  </button>
                  <button
                    onClick={() => moveColumn(idx, 1)}
                    disabled={idx === selected.length - 1}
                    className="p-0.5 hover:bg-card-hover rounded disabled:opacity-20"
                  >
                    <ArrowDown className="w-3 h-3" />
                  </button>
                </div>
                <span className="text-sm flex-1">{field.label}</span>
                <Badge variant="outline" className="text-xs">{field.type}</Badge>
                <button
                  onClick={() => toggleColumn(field.key)}
                  className="p-1 hover:bg-card-hover rounded text-secondary"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
            {selected.length === 0 && (
              <p className="text-sm text-heading py-4 text-center">Select fields from the left panel</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Date Range */}
      <Card className="bg-card">
        <CardHeader><CardTitle className="text-sm">Date Range (optional)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <div>
              <Label className="text-xs mb-1 block">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => onChange({ date_from: e.target.value })} className="w-40" />
            </div>
            <div>
              <Label className="text-xs mb-1 block">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => onChange({ date_to: e.target.value })} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">Filters</CardTitle>
            <Button size="sm" variant="outline" onClick={addFilter} className="h-7 text-xs">
              <Plus className="w-3 h-3 mr-1" /> Add Filter
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {filters.map((filter, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Select value={filter.field} onValueChange={(v) => updateFilter(idx, { field: v })}>
                <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {fields.map((f) => (
                    <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filter.operator} onValueChange={(v) => updateFilter(idx, { operator: v as any })}>
                <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
                <SelectContent>
                  {OPERATORS.map((op) => (
                    <SelectItem key={op.value} value={op.value}>{op.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Input
                placeholder="Value"
                value={filter.value}
                onChange={(e) => updateFilter(idx, { value: e.target.value })}
                className="flex-1"
              />
              {filter.operator === 'between' && (
                <Input
                  placeholder="And"
                  value={filter.value2 || ''}
                  onChange={(e) => updateFilter(idx, { value2: e.target.value })}
                  className="w-28"
                />
              )}
              <button onClick={() => removeFilter(idx)} className="p-2 hover:bg-card-hover rounded text-secondary">
                <Trash2 className="w-4 h-4" />
              </button>
            </div>
          ))}
          {filters.length === 0 && (
            <p className="text-sm text-heading py-2">No filters applied - all records will be included</p>
          )}
        </CardContent>
      </Card>

      {/* Sort */}
      <Card className="bg-card">
        <CardHeader><CardTitle className="text-sm">Sort By (optional)</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-4">
            <Select value={sortBy} onValueChange={(v) => onChange({ sort_by: v })}>
              <SelectTrigger className="w-48"><SelectValue placeholder="No sorting" /></SelectTrigger>
              <SelectContent>
                {fields.map((f) => (
                  <SelectItem key={f.key} value={f.key}>{f.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={sortDir} onValueChange={(v) => onChange({ sort_dir: v as 'asc' | 'desc' })}>
              <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="asc">Ascending</SelectItem>
                <SelectItem value="desc">Descending</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" /> Back</Button>
        <Button onClick={onNext} disabled={columns.length === 0}>
          Preview Report <ChevronRight className="w-4 h-4 ml-1" />
        </Button>
      </div>
    </div>
  );
}

// ?"EUR?"EUR?"EUR Step 3: Preview & Export ?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR?"EUR

function Step3Preview({ config, sourceLabel, onBack }: { config: ReportConfig; sourceLabel: string; onBack: () => void }) {
  const supabase = useSupabaseBrowser();
  const school = useSchoolStore((s) => s.school);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [exporting, setExporting] = useState<'csv' | 'pdf' | null>(null);
  const [saveName, setSaveName] = useState('');

  const fields = SOURCE_FIELDS[config.source] || [];
  const selectedFields = config.columns.map((k) => fields.find((f) => f.key === k)).filter(Boolean) as FieldDef[];

  // Saved reports (localStorage)
  const { data: savedReports = [] } = useQuery({
    queryKey: ['analytics-reports-saved', school?.id],
    queryFn: async () => {
      try {
        return JSON.parse(localStorage.getItem(SAVED_REPORTS_KEY) || '[]') as SavedReport[];
      } catch {
        return [];
      }
    },
  });

  // Fetch preview data
  const { data: previewResult, isLoading: loading } = useQuery({
    queryKey: ['analytics-reports-preview', school?.id, config],
    enabled: !!school?.id && !!config.source,
    queryFn: async () => {
      // Build query based on source
      let query: any;

      if (config.source === 'students-fees') {
        query = supabase.from('fee_accounts').select('total_expected, total_paid, balance, status, students(full_name, admission_number, gender, parent_phone, current_class:classes(name))', { count: 'exact' });
      } else if (config.source === 'academics') {
        query = supabase.from('marks').select('exam_type, score, max_score, students(full_name), classes(name), subjects(name)', { count: 'exact' });
      } else if (config.source === 'attendance') {
        query = supabase.from('attendance_records').select('date, status, notes, students(full_name, admission_number), classes(name)', { count: 'exact' });
      } else if (config.source === 'payments') {
        query = supabase.from('fee_payments').select('amount, payment_method, payment_date, receipt_number, status, students(full_name, admission_number)', { count: 'exact' });
      }

      query = query.eq('school_id', school!.id).eq('is_deleted', false);

      // Date range
      const dateField = fields.find((f) => f.type === 'date');
      const dateSelectMap: Record<string, string> = { date: 'date', payment_date: 'payment_date' };
      if (dateField) {
        const col = dateSelectMap[dateField.key] || dateField.key;
        if (config.date_from) query = query.gte(col, config.date_from);
        if (config.date_to) query = query.lte(col, config.date_to);
      }

      // Sort
      if (config.sort_by) {
        const sortField = fields.find((f) => f.key === config.sort_by);
        if (sortField) {
          const colMap: Record<string, string> = { date: 'date', payment_date: 'payment_date' };
          query = query.order(colMap[sortField.key] || sortField.key, { ascending: config.sort_dir !== 'desc' });
        }
      } else {
        query = query.order('id', { ascending: false });
      }

      const { data, count } = await query.limit(20);
      return { data: data || [], count: count || 0 };
    },
  });

  const previewData: any[] = previewResult?.data || [];
  const totalCount = previewResult?.count || 0;

  const handleExport = async (format: 'csv' | 'pdf') => {
    setExporting(format);
    const configBase64 = btoa(JSON.stringify(config));
    const url = format === 'csv'
      ? `/api/analytics/custom-report?config=${configBase64}`
      : `/api/analytics/custom-report-pdf?config=${configBase64}`;

    try {
      const res = await fetch(url);
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Export failed' }));
        throw new Error(err.error || 'Export failed');
      }
      const blob = await res.blob();
      const downloadUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = downloadUrl;
      a.download = `report-${config.source}-${new Date().toISOString().split('T')[0]}.${format}`;
      a.click();
      URL.revokeObjectURL(downloadUrl);
    } catch (err: any) {
      toast({ title: 'Export Failed', description: err.message, variant: 'destructive' });
    } finally {
      setExporting(null);
    }
  };

  const handleSave = () => {
    if (!saveName.trim()) return;
    const newSaved = [...savedReports, { name: saveName.trim(), config, savedAt: new Date().toISOString() }];
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(newSaved));
    queryClient.invalidateQueries({ queryKey: ['analytics-reports-saved', school?.id] });
    setSaveName('');
    toast({ title: 'Report Saved', description: `"${saveName.trim()}" saved for reuse.` });
  };

  const handleLoad = (saved: SavedReport) => {
    // Navigate back to step 2 with loaded config
    // For simplicity, we'll just update the URL - but since this is a client page, we reload
    window.location.href = `/dashboard/analytics/reports?config=${btoa(JSON.stringify(saved.config))}`;
  };

  const handleDeleteSaved = (idx: number) => {
    const newSaved = savedReports.filter((_, i) => i !== idx);
    localStorage.setItem(SAVED_REPORTS_KEY, JSON.stringify(newSaved));
    queryClient.invalidateQueries({ queryKey: ['analytics-reports-saved', school?.id] });
  };

  return (
    <div className="space-y-6">
      {/* Preview Table */}
      <Card className="bg-card">
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-sm">
              Preview - {sourceLabel} ({totalCount} total records, showing first 20)
            </CardTitle>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="space-y-2">
              {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-8 w-full" />)}
            </div>
          ) : previewData.length === 0 ? (
            <p className="text-heading text-sm py-8 text-center">No data found matching your criteria</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    {selectedFields.map((f) => (
                      <th key={f.key} className="text-left py-2 px-3 text-heading font-medium whitespace-nowrap">{f.label}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {previewData.map((row, i) => (
                    <tr key={i} className="border-b /50 hover:bg-card-hover">
                      {selectedFields.map((field) => {
                        let value: any;
                        const pathMap: Record<string, string> = {
                          student_name: 'students.full_name',
                          admission_number: 'students.admission_number',
                          class_name: 'students.current_class.name',
                          gender: 'students.gender',
                          parent_phone: 'students.parent_phone',
                          subject_name: 'subjects.name',
                        };
                        const path = pathMap[field.key] || field.key;
                        value = getNestedValue(row, path);
                        if (value === null || value === undefined) value = '';
                        return (
                          <td key={field.key} className="py-2 px-3 whitespace-nowrap">{String(value)}</td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Export Buttons */}
      <div className="flex items-center gap-4">
        <Button onClick={() => handleExport('csv')} disabled={exporting !== null || previewData.length === 0}>
          {exporting === 'csv' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Download CSV
        </Button>
        <Button onClick={() => handleExport('pdf')} disabled={exporting !== null || previewData.length === 0} variant="outline">
          {exporting === 'pdf' ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Download className="w-4 h-4 mr-2" />}
          Download PDF
        </Button>
      </div>

      {/* Save Report */}
      <Card className="bg-card">
        <CardHeader><CardTitle className="text-sm">Save This Report</CardTitle></CardHeader>
        <CardContent>
          <div className="flex items-center gap-2">
            <Input
              placeholder="Report name (e.g. P.5 Fee Defaulters)"
              value={saveName}
              onChange={(e) => setSaveName(e.target.value)}
              className="flex-1"
            />
            <Button onClick={handleSave} disabled={!saveName.trim()}>
              <Save className="w-4 h-4 mr-1" /> Save
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Saved Reports */}
      {savedReports.length > 0 && (
        <Card className="bg-card">
          <CardHeader><CardTitle className="text-sm">Saved Reports</CardTitle></CardHeader>
          <CardContent className="space-y-2">
            {savedReports.map((saved, idx) => (
              <div key={idx} className="flex items-center gap-3 p-2 rounded-md bg-bg-tertiary border /50">
                <FolderOpen className="w-4 h-4 text-heading" />
                <div className="flex-1">
                  <p className="text-sm font-medium">{saved.name}</p>
                  <p className="text-xs text-heading">
                    {DATA_SOURCES.find((s) => s.id === saved.config.source)?.title} * {saved.config.columns.length} columns * {new Date(saved.savedAt).toLocaleDateString()}
                  </p>
                </div>
                <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => handleLoad(saved)}>
                  <Play className="w-3 h-3 mr-1" /> Load
                </Button>
                <button onClick={() => handleDeleteSaved(idx)} className="p-1 hover:bg-card-hover rounded text-secondary">
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* Navigation */}
      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack}><ChevronLeft className="w-4 h-4 mr-1" /> Back to Editor</Button>
      </div>
    </div>
  );
}
