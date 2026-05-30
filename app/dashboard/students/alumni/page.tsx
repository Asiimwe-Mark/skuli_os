'use client';

import { useState, useEffect, useMemo } from 'react';
import { useSchoolStore } from '@/store/school';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { EmptyState } from '@/components/shared/empty-state';
import { useToast } from '@/components/ui/use-toast';
import { GraduationCap, Search, Download, Plus, Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';

interface Alumni {
  id: string;
  first_name: string;
  last_name: string;
  admission_number: string | null;
  graduation_year: number;
  last_class: string | null;
  current_school: string | null;
  phone: string | null;
  email: string | null;
  profession: string | null;
  created_at: string;
}

export default function AlumniPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const [alumni, setAlumni] = useState<Alumni[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState<string>('all');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    first_name: '',
    last_name: '',
    admission_number: '',
    graduation_year: new Date().getFullYear().toString(),
    last_class: '',
    phone: '',
    email: '',
    profession: '',
  });

  useEffect(() => {
    if (!school) return;
    fetchAlumni();
  }, [school]);

  const fetchAlumni = async () => {
    if (!school) return;
    setLoading(true);
    try {
      const res = await fetch('/api/students/alumni?limit=200');
      const result = await res.json();
      if (result.success) {
        setAlumni(result.data.alumni || []);
      } else {
        toast({ title: 'Failed to load alumni', variant: 'destructive' });
      }
    } catch {
      toast({ title: 'Failed to load alumni', variant: 'destructive' });
    }
    setLoading(false);
  };

  const years = useMemo(() => {
    const unique = [...new Set(alumni.map(a => a.graduation_year))];
    return unique.sort((a, b) => b - a);
  }, [alumni]);

  const filtered = useMemo(() => {
    let result = alumni;
    if (yearFilter !== 'all') {
      result = result.filter(a => a.graduation_year === parseInt(yearFilter));
    }
    if (search) {
      const q = search.toLowerCase();
      result = result.filter(a =>
        `${a.first_name} ${a.last_name}`.toLowerCase().includes(q) ||
        a.admission_number?.toLowerCase().includes(q) ||
        a.email?.toLowerCase().includes(q)
      );
    }
    return result;
  }, [alumni, yearFilter, search]);

  const handleAdd = async () => {
    if (!form.first_name || !form.last_name) return;
    setSaving(true);

    try {
      const res = await fetch('/api/students/alumni', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          first_name: form.first_name,
          last_name: form.last_name,
          graduation_year: parseInt(form.graduation_year),
          last_class: form.last_class || undefined,
          admission_number: form.admission_number || undefined,
          phone: form.phone || undefined,
          email: form.email || undefined,
          profession: form.profession || undefined,
        }),
      });
      const result = await res.json();

      if (!result.success) {
        toast({ title: 'Failed to add alumni', description: result.error, variant: 'destructive' });
      } else {
        toast({ title: 'Alumni added successfully' });
        setDialogOpen(false);
        setForm({
          first_name: '',
          last_name: '',
          admission_number: '',
          graduation_year: new Date().getFullYear().toString(),
          last_class: '',
          phone: '',
          email: '',
          profession: '',
        });
        fetchAlumni();
      }
    } catch {
      toast({ title: 'Failed to add alumni', variant: 'destructive' });
    }
    setSaving(false);
  };

  const exportCSV = () => {
    const headers = ['Name', 'Admission #', 'Graduation Year', 'Last Class', 'Phone', 'Email', 'Profession'];
    const rows = filtered.map(a => [
      `${a.first_name} ${a.last_name}`,
      a.admission_number || '',
      a.graduation_year.toString(),
      a.last_class || '',
      a.phone || '',
      a.email || '',
      a.profession || '',
    ]);
    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'alumni.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid gap-4 md:grid-cols-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24" />)}
        </div>
        <Skeleton className="h-96" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Alumni</h1>
          <p className="text-muted-foreground">Manage graduated students</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={exportCSV}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
          <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
            <DialogTrigger asChild>
              <Button>
                <Plus className="w-4 h-4 mr-2" />
                Add Alumni
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add Alumni Record</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>First Name *</Label>
                    <Input
                      value={form.first_name}
                      onChange={e => setForm({ ...form, first_name: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Last Name *</Label>
                    <Input
                      value={form.last_name}
                      onChange={e => setForm({ ...form, last_name: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Admission Number</Label>
                    <Input
                      value={form.admission_number}
                      onChange={e => setForm({ ...form, admission_number: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Graduation Year *</Label>
                    <Input
                      type="number"
                      value={form.graduation_year}
                      onChange={e => setForm({ ...form, graduation_year: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Last Class</Label>
                    <Input
                      value={form.last_class}
                      onChange={e => setForm({ ...form, last_class: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Phone</Label>
                    <Input
                      value={form.phone}
                      onChange={e => setForm({ ...form, phone: e.target.value })}
                    />
                  </div>
                </div>
                <div className="grid gap-4 md:grid-cols-2">
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={form.email}
                      onChange={e => setForm({ ...form, email: e.target.value })}
                    />
                  </div>
                  <div>
                    <Label>Profession</Label>
                    <Input
                      value={form.profession}
                      onChange={e => setForm({ ...form, profession: e.target.value })}
                    />
                  </div>
                </div>
                <Button onClick={handleAdd} disabled={saving || !form.first_name || !form.last_name} className="w-full">
                  {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                  Add Alumni
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      <div className="flex gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search alumni..."
            value={search}
            onChange={e => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={yearFilter} onValueChange={setYearFilter}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="All Years" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Years</SelectItem>
            {years.map(y => (
              <SelectItem key={y} value={y.toString()}>{y}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {filtered.length === 0 ? (
        <EmptyState
          icon={GraduationCap}
          title="No alumni found"
          description={search || yearFilter !== 'all' ? 'Try adjusting your filters' : 'Add alumni records to get started'}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="border-b">
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Name</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Admission #</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Year</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Last Class</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Phone</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Email</th>
                    <th className="text-left p-4 text-sm font-medium text-muted-foreground">Profession</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map(alumnus => (
                    <tr key={alumnus.id} className="border-b hover:bg-muted/50">
                      <td className="p-4 font-medium">{alumnus.first_name} {alumnus.last_name}</td>
                      <td className="p-4 text-muted-foreground">{alumnus.admission_number || '-'}</td>
                      <td className="p-4">
                        <Badge variant="outline">{alumnus.graduation_year}</Badge>
                      </td>
                      <td className="p-4 text-muted-foreground">{alumnus.last_class || '-'}</td>
                      <td className="p-4 text-muted-foreground">{alumnus.phone || '-'}</td>
                      <td className="p-4 text-muted-foreground">{alumnus.email || '-'}</td>
                      <td className="p-4 text-muted-foreground">{alumnus.profession || '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
