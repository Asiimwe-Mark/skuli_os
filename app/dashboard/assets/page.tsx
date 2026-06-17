'use client';

import { useState, useMemo } from 'react';
import { motion } from 'framer-motion';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { formatUGX } from '@/lib/utils/currency';
import { formatDate } from '@/lib/utils/dates';
import { cn } from '@/lib/utils/cn';
import { useSchoolStore } from '@/store/school';
import { useToast } from '@/components/ui/use-toast';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { Card, CardContent } from '@/components/ui/card';
import { Textarea } from '@/components/ui/textarea';
import { Checkbox } from '@/components/ui/checkbox';
import { fetchArray, fetchEnvelope } from '@/lib/api-fetch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Box,
  Plus,
  Search,
  Edit2,
  Wrench,
  Trash2,
  AlertTriangle,
  TrendingDown,
  Package,
} from 'lucide-react';

interface Asset {
  id: string;
  name: string;
  asset_code: string | null;
  category: string | null;
  purchase_date: string | null;
  purchase_price: number | null;
  current_value: number | null;
  condition: 'excellent' | 'good' | 'fair' | 'poor' | 'written_off';
  location: string | null;
  assigned_to: string | null;
  notes: string | null;
  users?: { id: string; full_name: string } | null;
}

interface Maintenance {
  id: string;
  asset_id: string;
  maintenance_date: string;
  description: string;
  cost: number | null;
  next_service_date: string | null;
  performed_by: string | null;
  assets?: { name: string; asset_code: string | null };
}

const CONDITION_COLORS = {
  excellent: 'bg-success-100 text-success-700 border-success-500',
  good: 'bg-bg-tertiary text-text-heading border-border',
  fair: 'bg-warning-100 text-warning-700 border-warning-500',
  poor: 'bg-danger-100 text-danger-700 border-danger-500',
  written_off: 'bg-bg-tertiary text-text-muted border-border-strong',
};

const USEFUL_LIFE_YEARS = 5; // Default useful life for depreciation

export default function AssetsPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [categoryTab, setCategoryTab] = useState('all');
  const [addAssetOpen, setAddAssetOpen] = useState(false);
  const [editAssetOpen, setEditAssetOpen] = useState(false);
  const [maintenanceOpen, setMaintenanceOpen] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState<Asset | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 15;

  // Form state
  const [assetForm, setAssetForm] = useState({
    name: '',
    asset_code: '',
    category: '',
    purchase_date: '',
    purchase_price: '',
    current_value: '',
    condition: 'good' as 'excellent' | 'good' | 'fair' | 'poor' | 'written_off',
    location: '',
    assigned_to: '',
    notes: '',
  });

  const [maintenanceForm, setMaintenanceForm] = useState({
    asset_id: '',
    maintenance_date: new Date().toISOString().split('T')[0],
    description: '',
    cost: '',
    next_service_date: '',
    performed_by: '',
  });

  // Fetch assets
  const { data: assets, isLoading } = useQuery<Asset[]>({
    queryKey: ['assets', school?.id],
    queryFn: () => fetchArray<Asset>('/api/assets'),
    enabled: !!school?.id,
  });

  // Fetch maintenance records
  const { data: maintenanceRecords } = useQuery<Maintenance[]>({
    queryKey: ['asset-maintenance', school?.id],
    queryFn: () => fetchArray<Maintenance>('/api/assets/maintenance'),
    enabled: !!school?.id,
  });

  // Fetch staff for assignment. /api/staff returns a paginated envelope
  // { staff, total, ... } regardless of the `lite` flag, so we use
  // fetchArray which unwraps the first matching array field.
  const { data: staff } = useQuery({
    queryKey: ['staff-lite', school?.id],
    queryFn: () => fetchArray<{ id: string; full_name: string }>('/api/staff?lite=true'),
    enabled: !!school?.id && (addAssetOpen || editAssetOpen),
  });

  // Add asset mutation
  const addAsset = useMutation({
    mutationFn: async (data: typeof assetForm) => {
      return fetchEnvelope<Asset>('/api/assets', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          purchase_price: data.purchase_price ? Number(data.purchase_price) : null,
          current_value: data.current_value ? Number(data.current_value) : (data.purchase_price ? Number(data.purchase_price) : null),
          assigned_to: data.assigned_to && data.assigned_to !== "none" ? data.assigned_to : null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast({ title: 'Asset added successfully' });
      setAddAssetOpen(false);
      resetAssetForm();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Edit asset mutation
  const editAsset = useMutation({
    mutationFn: async (data: typeof assetForm & { id: string }) => {
      return fetchEnvelope<Asset>('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          id: data.id,
          name: data.name,
          asset_code: data.asset_code || null,
          category: data.category || null,
          purchase_date: data.purchase_date || null,
          purchase_price: data.purchase_price ? Number(data.purchase_price) : null,
          current_value: data.current_value ? Number(data.current_value) : null,
          condition: data.condition,
          location: data.location || null,
          assigned_to: data.assigned_to && data.assigned_to !== "none" ? data.assigned_to : null,
          notes: data.notes || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast({ title: 'Asset updated successfully' });
      setEditAssetOpen(false);
      setSelectedAsset(null);
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Write off mutation
  const writeOff = useMutation({
    mutationFn: async (assetId: string) => {
      return fetchEnvelope('/api/assets', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assetId, condition: 'written_off', is_deleted: true }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assets'] });
      toast({ title: 'Asset written off' });
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  // Add maintenance mutation
  const addMaintenance = useMutation({
    mutationFn: async (data: typeof maintenanceForm) => {
      return fetchEnvelope('/api/assets/maintenance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...data,
          cost: data.cost ? Number(data.cost) : null,
          next_service_date: data.next_service_date || null,
          performed_by: data.performed_by || null,
        }),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['asset-maintenance'] });
      toast({ title: 'Maintenance recorded' });
      setMaintenanceOpen(false);
      resetMaintenanceForm();
    },
    onError: (err: Error) => {
      toast({ title: 'Error', description: err.message, variant: 'destructive' });
    },
  });

  const resetAssetForm = () => {
    setAssetForm({
      name: '',
      asset_code: '',
      category: '',
      purchase_date: '',
      purchase_price: '',
      current_value: '',
      condition: 'good',
      location: '',
      assigned_to: 'none',
      notes: '',
    });
  };

  const resetMaintenanceForm = () => {
    setMaintenanceForm({
      asset_id: '',
      maintenance_date: new Date().toISOString().split('T')[0],
      description: '',
      cost: '',
      next_service_date: '',
      performed_by: '',
    });
  };

  const handleEdit = (asset: Asset) => {
    setSelectedAsset(asset);
    setAssetForm({
      name: asset.name,
      asset_code: asset.asset_code || '',
      category: asset.category || '',
      purchase_date: asset.purchase_date || '',
      purchase_price: asset.purchase_price?.toString() || '',
      current_value: asset.current_value?.toString() || '',
      condition: asset.condition,
      location: asset.location || '',
      assigned_to: asset.assigned_to || 'none',
      notes: asset.notes || '',
    });
    setEditAssetOpen(true);
  };

  const handleMaintenance = (asset: Asset) => {
    setSelectedAsset(asset);
    setMaintenanceForm({
      asset_id: asset.id,
      maintenance_date: new Date().toISOString().split('T')[0],
      description: '',
      cost: '',
      next_service_date: '',
      performed_by: '',
    });
    setMaintenanceOpen(true);
  };

  // Calculate depreciation
  const calculateDepreciation = (asset: Asset) => {
    if (!asset.purchase_date || !asset.purchase_price) return asset.current_value ?? 0;
    const purchaseDate = new Date(asset.purchase_date);
    const now = new Date();
    const yearsOwned = (now.getTime() - purchaseDate.getTime()) / (365.25 * 24 * 60 * 60 * 1000);
    const annualDepreciation = asset.purchase_price / USEFUL_LIFE_YEARS;
    const totalDepreciation = Math.min(yearsOwned * annualDepreciation, asset.purchase_price);
    return Math.max(asset.purchase_price - totalDepreciation, 0);
  };

  // Categories
  const categories = useMemo(() => {
    if (!assets) return [];
    const cats = new Set(assets.map(a => a.category).filter(Boolean) as string[]);
    return Array.from(cats).sort();
  }, [assets]);

  // Assets due for maintenance (next_service_date <= 14 days)
  const maintenanceDue = useMemo(() => {
    if (!maintenanceRecords) return [];
    const now = new Date();
    const twoWeeks = new Date(now.getTime() + 14 * 24 * 60 * 60 * 1000);
    return maintenanceRecords.filter(m => {
      if (!m.next_service_date) return false;
      const nextDate = new Date(m.next_service_date);
      return nextDate <= twoWeeks;
    });
  }, [maintenanceRecords]);

  // Filtered assets
  const filteredAssets = useMemo(() => {
    if (!assets) return [];
    return assets.filter(asset => {
      const matchesSearch = !search ||
        asset.name.toLowerCase().includes(search.toLowerCase()) ||
        asset.asset_code?.toLowerCase().includes(search.toLowerCase()) ||
        asset.location?.toLowerCase().includes(search.toLowerCase());
      const matchesCategory = categoryTab === 'all' || asset.category === categoryTab;
      return matchesSearch && matchesCategory;
    });
  }, [assets, search, categoryTab]);

  // Pagination
  const totalPages = Math.ceil(filteredAssets.length / pageSize);
  const paginatedAssets = filteredAssets.slice(page * pageSize, (page + 1) * pageSize);

  // Total values
  const totalValue = useMemo(() => {
    if (!assets) return 0;
    return assets.reduce((sum, a) => sum + (a.current_value ?? 0), 0);
  }, [assets]);

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-24 rounded-xl" />)}
        </div>
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Box className="w-6 h-6" />
            Assets & Inventory
          </h1>
          <p className="text-heading mt-1">Track school assets, maintenance, and depreciation</p>
        </div>
        <Dialog open={addAssetOpen} onOpenChange={setAddAssetOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetAssetForm(); setAddAssetOpen(true); }}>
              <Plus className="w-4 h-4 mr-2" />
              Add Asset
            </Button>
          </DialogTrigger>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Add New Asset</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
              <div>
                <Label>Name *</Label>
                <Input value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} placeholder="Asset name" />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Asset Code</Label>
                  <Input value={assetForm.asset_code} onChange={e => setAssetForm(f => ({ ...f, asset_code: e.target.value }))} placeholder="e.g. COMP-001" />
                </div>
                <div>
                  <Label>Category</Label>
                  <Input value={assetForm.category} onChange={e => setAssetForm(f => ({ ...f, category: e.target.value }))} placeholder="e.g. Electronics" list="categories-list" />
                  <datalist id="categories-list">
                    {categories.map(c => <option key={c} value={c} />)}
                  </datalist>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Purchase Date</Label>
                  <Input type="date" value={assetForm.purchase_date} onChange={e => setAssetForm(f => ({ ...f, purchase_date: e.target.value }))} />
                </div>
                <div>
                  <Label>Purchase Price (UGX)</Label>
                  <Input type="number" value={assetForm.purchase_price} onChange={e => setAssetForm(f => ({ ...f, purchase_price: e.target.value }))} placeholder="0" />
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Condition</Label>
                  <Select value={assetForm.condition} onValueChange={v => setAssetForm(f => ({ ...f, condition: v as Asset['condition'] }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="excellent">Excellent</SelectItem>
                      <SelectItem value="good">Good</SelectItem>
                      <SelectItem value="fair">Fair</SelectItem>
                      <SelectItem value="poor">Poor</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Location</Label>
                  <Input value={assetForm.location} onChange={e => setAssetForm(f => ({ ...f, location: e.target.value }))} placeholder="e.g. Lab 1" />
                </div>
              </div>
              <div>
                <Label>Assigned To</Label>
                <Select value={assetForm.assigned_to} onValueChange={v => setAssetForm(f => ({ ...f, assigned_to: v }))}>
                  <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    {staff?.map((s: { id: string; full_name: string }) => (
                      <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label>Notes</Label>
                <Textarea value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} placeholder="Additional notes" rows={2} />
              </div>
              <Button className="w-full" onClick={() => addAsset.mutate(assetForm)} disabled={addAsset.isPending || !assetForm.name}>
                {addAsset.isPending ? 'Adding...' : 'Add Asset'}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-brand-100 text-brand-700 flex items-center justify-center">
              <Package className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Total Assets</p>
              <p className="text-xl font-bold text-text-heading">{assets?.length ?? 0}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-success-100 text-success-700 flex items-center justify-center">
              <TrendingDown className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Total Value</p>
              <p className="text-xl font-bold text-success-700">{formatUGX(totalValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-warning-100 text-warning-700 flex items-center justify-center">
              <Wrench className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Categories</p>
              <p className="text-xl font-bold text-warning-700">{categories.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-lg bg-danger-100 text-danger-700 flex items-center justify-center">
              <AlertTriangle className="w-5 h-5" />
            </div>
            <div>
              <p className="text-xs text-text-muted">Maintenance Due</p>
              <p className="text-xl font-bold text-danger-700">{maintenanceDue.length}</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Maintenance Due Alerts */}
      {maintenanceDue.length > 0 && (
        <Card className="border-warning-500 bg-warning-100">
          <CardContent className="p-4">
            <h3 className="text-sm font-semibold text-warning-700 mb-3 flex items-center gap-2">
              <Wrench className="w-4 h-4" />
              Maintenance Due ({maintenanceDue.length})
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {maintenanceDue.slice(0, 4).map(m => (
                <div key={m.id} className="flex items-center justify-between text-sm bg-card rounded-lg p-3 border border-warning-200">
                  <div>
                    <p className="font-medium text-text-heading">{m.assets?.name}</p>
                    <p className="text-xs text-text-muted">{m.assets?.asset_code}</p>
                  </div>
                  <p className="text-warning-700 text-xs font-semibold">
                    Due: {formatDate(m.next_service_date!)}
                  </p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Category Tabs + Search */}
      <Card className="bg-card">
        <CardContent className="p-4">
          <div className="flex flex-col lg:flex-row gap-3">
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-heading" />
              <Input
                placeholder="Search by name, code, or location..."
                value={search}
                onChange={e => { setSearch(e.target.value); setPage(0); }}
                className="pl-9"
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button
                variant={categoryTab === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => { setCategoryTab('all'); setPage(0); }}
              >
                All
              </Button>
              {categories.map(cat => (
                <Button
                  key={cat}
                  variant={categoryTab === cat ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => { setCategoryTab(cat); setPage(0); }}
                >
                  {cat}
                </Button>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Assets Table */}
      <Card className="bg-card">
        <CardContent className="p-0">
          <div className="rounded-xl border border-border overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full">
                <thead>
                  <tr className="bg-bg-tertiary border-b border-border">
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase tracking-wider">Code</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase tracking-wider">Name</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase tracking-wider">Condition</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase tracking-wider">Location</th>
                    <th className="px-4 py-3 text-left text-xs font-medium text-disabled uppercase tracking-wider">Assigned To</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase tracking-wider">Purchase Price</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase tracking-wider">Current Value</th>
                    <th className="px-4 py-3 text-right text-xs font-medium text-disabled uppercase tracking-wider">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border/50">
                  {paginatedAssets.map((asset, i) => {
                    const depreciatedValue = calculateDepreciation(asset);
                    return (
                      <motion.tr
                        key={asset.id}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.03 }}
                        className="bg-bg-tertiary hover:bg-card-hover transition-colors"
                      >
                        <td className="px-4 py-3 text-sm font-mono">{asset.asset_code || '-'}</td>
                        <td className="px-4 py-3">
                          <p className="text-sm font-medium">{asset.name}</p>
                          {asset.category && <p className="text-xs text-heading">{asset.category}</p>}
                        </td>
                        <td className="px-4 py-3">
                          <Badge className={cn('text-xs', CONDITION_COLORS[asset.condition])}>
                            {asset.condition.replace('_', ' ')}
                          </Badge>
                        </td>
                        <td className="px-4 py-3 text-sm text-heading">{asset.location || '-'}</td>
                        <td className="px-4 py-3 text-sm text-heading">{asset.users?.full_name || '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">{asset.purchase_price ? formatUGX(asset.purchase_price) : '-'}</td>
                        <td className="px-4 py-3 text-sm text-right">
                          <span className="font-semibold text-text-heading">{formatUGX(asset.current_value ?? depreciatedValue)}</span>
                          {asset.purchase_price && asset.current_value !== asset.purchase_price && (
                            <p className="text-xs text-text-muted">
                              Depreciated
                            </p>
                          )}
                        </td>
                        <td className="px-4 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(asset)}>
                              <Edit2 className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" onClick={() => handleMaintenance(asset)}>
                              <Wrench className="w-3 h-3" />
                            </Button>
                            <Button variant="ghost" size="sm" className="text-danger-600 hover:text-danger-700" onClick={() => {
                              if (confirm('Write off this asset? This will mark it as written off and remove it from active inventory.')) {
                                writeOff.mutate(asset.id);
                              }
                            }}>
                              <Trash2 className="w-3 h-3" />
                            </Button>
                          </div>
                        </td>
                      </motion.tr>
                    );
                  })}
                  {paginatedAssets.length === 0 && (
                    <tr>
                      <td colSpan={8} className="px-4 py-12 text-center text-heading">
                        No assets found. Add your first asset to get started.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-4 border-t border-border">
              <p className="text-sm text-heading">
                Showing {page * pageSize + 1}-{Math.min((page + 1) * pageSize, filteredAssets.length)} of {filteredAssets.length}
              </p>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setPage(p => p - 1)} disabled={page === 0}>
                  Previous
                </Button>
                <Button variant="outline" size="sm" onClick={() => setPage(p => p + 1)} disabled={page >= totalPages - 1}>
                  Next
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Edit Asset Dialog */}
      <Dialog open={editAssetOpen} onOpenChange={setEditAssetOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Edit Asset</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4 max-h-[60vh] overflow-y-auto">
            <div>
              <Label>Name *</Label>
              <Input value={assetForm.name} onChange={e => setAssetForm(f => ({ ...f, name: e.target.value }))} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Asset Code</Label>
                <Input value={assetForm.asset_code} onChange={e => setAssetForm(f => ({ ...f, asset_code: e.target.value }))} />
              </div>
              <div>
                <Label>Category</Label>
                <Input value={assetForm.category} onChange={e => setAssetForm(f => ({ ...f, category: e.target.value }))} list="categories-list" />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Purchase Date</Label>
                <Input type="date" value={assetForm.purchase_date} onChange={e => setAssetForm(f => ({ ...f, purchase_date: e.target.value }))} />
              </div>
              <div>
                <Label>Purchase Price (UGX)</Label>
                <Input type="number" value={assetForm.purchase_price} onChange={e => setAssetForm(f => ({ ...f, purchase_price: e.target.value }))} />
              </div>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label>Current Value (UGX)</Label>
                <Input type="number" value={assetForm.current_value} onChange={e => setAssetForm(f => ({ ...f, current_value: e.target.value }))} />
              </div>
              <div>
                <Label>Condition</Label>
                <Select value={assetForm.condition} onValueChange={v => setAssetForm(f => ({ ...f, condition: v as any }))}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="excellent">Excellent</SelectItem>
                    <SelectItem value="good">Good</SelectItem>
                    <SelectItem value="fair">Fair</SelectItem>
                    <SelectItem value="poor">Poor</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div>
              <Label>Location</Label>
              <Input value={assetForm.location} onChange={e => setAssetForm(f => ({ ...f, location: e.target.value }))} />
            </div>
            <div>
              <Label>Assigned To</Label>
              <Select value={assetForm.assigned_to} onValueChange={v => setAssetForm(f => ({ ...f, assigned_to: v }))}>
                <SelectTrigger><SelectValue placeholder="Select staff member" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {staff?.map((s: any) => (
                    <SelectItem key={s.id} value={s.id}>{s.full_name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Notes</Label>
              <Textarea value={assetForm.notes} onChange={e => setAssetForm(f => ({ ...f, notes: e.target.value }))} rows={2} />
            </div>
            <Button className="w-full" onClick={() => selectedAsset && editAsset.mutate({ ...assetForm, id: selectedAsset.id })} disabled={editAsset.isPending || !assetForm.name}>
              {editAsset.isPending ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Record Maintenance Dialog */}
      <Dialog open={maintenanceOpen} onOpenChange={setMaintenanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Maintenance</DialogTitle>
          </DialogHeader>
          {selectedAsset && (
            <div className="space-y-4 py-4">
              <div className="bg-bg-tertiary rounded-lg p-3">
                <p className="font-medium">{selectedAsset.name}</p>
                <p className="text-xs text-heading">{selectedAsset.asset_code}</p>
              </div>
              <div>
                <Label>Maintenance Date *</Label>
                <Input type="date" value={maintenanceForm.maintenance_date} onChange={e => setMaintenanceForm(f => ({ ...f, maintenance_date: e.target.value }))} />
              </div>
              <div>
                <Label>Description *</Label>
                <Textarea value={maintenanceForm.description} onChange={e => setMaintenanceForm(f => ({ ...f, description: e.target.value }))} placeholder="Describe the maintenance performed" rows={3} />
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <Label>Cost (UGX)</Label>
                  <Input type="number" value={maintenanceForm.cost} onChange={e => setMaintenanceForm(f => ({ ...f, cost: e.target.value }))} placeholder="0" />
                </div>
                <div>
                  <Label>Next Service Date</Label>
                  <Input type="date" value={maintenanceForm.next_service_date} onChange={e => setMaintenanceForm(f => ({ ...f, next_service_date: e.target.value }))} />
                </div>
              </div>
              <div>
                <Label>Performed By</Label>
                <Input value={maintenanceForm.performed_by} onChange={e => setMaintenanceForm(f => ({ ...f, performed_by: e.target.value }))} placeholder="Name or company" />
              </div>
              <Button className="w-full" onClick={() => addMaintenance.mutate(maintenanceForm)} disabled={addMaintenance.isPending || !maintenanceForm.description}>
                {addMaintenance.isPending ? 'Saving...' : 'Record Maintenance'}
              </Button>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
