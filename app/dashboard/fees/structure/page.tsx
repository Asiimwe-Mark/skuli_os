"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import {
  createFeeStructureSchema,
  type CreateFeeStructureFormData,
} from "@/lib/validations/fees";
import type { FeeStructure, Term, Class } from "@/types";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
import {
  Wallet,
  Plus,
  Pencil,
  Trash2,
  FileText,
  Loader2,
  CheckCircle2,
  AlertTriangle,
  GraduationCap,
  History,
} from "lucide-react";

export default function FeeStructurePage() {
  const { school, currentTerm } = useSchoolStore();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [selectedTermId, setSelectedTermId] = useState(currentTerm?.id ?? "");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FeeStructure | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<FeeStructure | null>(null);
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [changeLogOpen, setChangeLogOpen] = useState(false);

  // Audit log query
  const { data: auditLog = [] } = useQuery({
    queryKey: ["fee-structure-audit", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_structure_audit_log")
        .select("*, changed_by_user:users!changed_by(full_name)")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) throw error;
      return ((data ?? []) as any[]).map((entry) => ({
        ...entry,
        changed_by_user: Array.isArray(entry.changed_by_user)
          ? entry.changed_by_user[0]
          : entry.changed_by_user,
      }));
    },
    enabled: !!school?.id && changeLogOpen,
  });

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: terms = [] } = useQuery({
    queryKey: ["terms", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("terms")
        .select("*, academic_years!inner(name)")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("start_date", { ascending: false });
      if (error) throw error;
      return (data ?? []) as (Term & { academic_years?: { name: string } })[];
    },
    enabled: !!school?.id,
  });

  const { data: classes = [] } = useQuery({
    queryKey: ["classes", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("classes")
        .select("id, name")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("name");
      if (error) throw error;
      return (data ?? []) as Pick<Class, "id" | "name">[];
    },
    enabled: !!school?.id,
  });

  const { data: feeItems = [], isLoading: structuresLoading } = useQuery({
    queryKey: ["fee-structures", school?.id, selectedTermId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("fee_structures")
        .select("*")
        .eq("school_id", school!.id)
        .eq("term_id", selectedTermId)
        .eq("is_deleted", false)
        .order("created_at", { ascending: true });
      if (error) throw error;
      return (data ?? []) as FeeStructure[];
    },
    enabled: !!school?.id && !!selectedTermId,
  });

  // ── Form ─────────────────────────────────────────────────────────────

  const form = useForm<CreateFeeStructureFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(createFeeStructureSchema) as any,
    defaultValues: {
      term_id: selectedTermId,
      class_id: null,
      name: "",
      amount: 0,
      is_mandatory: true,
    },
  });

  function openAddDialog() {
    setEditingItem(null);
    form.reset({
      term_id: selectedTermId,
      class_id: null,
      name: "",
      amount: 0,
      is_mandatory: true,
    });
    setDialogOpen(true);
  }

  function openEditDialog(item: FeeStructure) {
    setEditingItem(item);
    form.reset({
      term_id: item.term_id,
      class_id: item.class_id ?? null,
      name: item.name,
      amount: item.amount,
      is_mandatory: item.is_mandatory,
    });
    setDialogOpen(true);
  }

  // ── Mutations ────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: async (values: CreateFeeStructureFormData) => {
      if (editingItem) {
        const res = await fetch("/api/fees/structure", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingItem.id,
            name: values.name,
            amount: values.amount,
            is_mandatory: values.is_mandatory,
            class_id: values.class_id ?? null,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update");
      } else {
        const res = await fetch("/api/fees/structure", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            term_id: values.term_id,
            class_id: values.class_id ?? null,
            name: values.name,
            amount: values.amount,
            is_mandatory: values.is_mandatory,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      toast({ title: editingItem ? "Fee item updated" : "Fee item added" });
      setDialogOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Error saving fee item",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/fees/structure?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-structures"] });
      toast({ title: "Fee item deleted" });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    },
    onError: () => {
      toast({ title: "Failed to delete fee item", variant: "destructive" });
    },
  });

  const generateMutation = useMutation({
    mutationFn: async () => {
      if (!selectedTermId) throw new Error("Select a term first");

      const res = await fetch("/api/fees/generate-accounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          term_id: selectedTermId,
        }),
      });
      const result = await res.json();
      if (!res.ok) throw new Error(result.error || "Failed to generate accounts");
      return result;
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      toast({
        title: "Fee accounts generated",
        description: `${result.created} created, ${result.skipped} skipped.`,
      });
      setGenerateDialogOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Error generating accounts",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────

  const classMap = new Map(classes.map((c) => [c.id, c.name]));
  const mandatoryTotal = feeItems.filter((i) => i.is_mandatory).reduce((s, i) => s + i.amount, 0);
  const optionalTotal = feeItems.filter((i) => !i.is_mandatory).reduce((s, i) => s + i.amount, 0);

  function getClassName(classId: string | null) {
    if (!classId) return "All Classes";
    return classMap.get(classId) || "Unknown";
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (structuresLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[...Array(3)].map((_, i) => (
            <Skeleton key={i} className="h-24 rounded-xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-xl" />
      </div>
    );
  }

  if (!currentTerm) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertTriangle className="w-12 h-12 text-amber-400 mb-4" />
        <h2 className="text-xl font-semibold mb-2">No Active Term</h2>
        <p className="text-gray-400 max-w-sm">
          Set up an active academic term before configuring fee structures.
        </p>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold font-display">Fee Structure</h1>
          <p className="text-gray-400 text-sm">
            Configure fee items for {currentTerm.name.replace("Term", "Term ")} &mdash; {school?.name}
          </p>
        </div>
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setChangeLogOpen(true)}>
            <History className="w-4 h-4 mr-2" />
            Change Log
          </Button>
          <Button variant="outline" onClick={() => setGenerateDialogOpen(true)}>
            <FileText className="w-4 h-4 mr-2" />
            Generate Fee Accounts
          </Button>
          <Button onClick={openAddDialog}>
            <Plus className="w-4 h-4 mr-2" />
            Add Fee Item
          </Button>
        </div>
      </div>

      {/* Term selector */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="space-y-2 max-w-xs">
              <Label>Term</Label>
              <Select value={selectedTermId} onValueChange={setSelectedTermId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select term" />
                </SelectTrigger>
                <SelectContent>
                  {terms.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.name}
                      {t.academic_years?.name ? ` \u2014 ${t.academic_years.name}` : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0 }}>
          <Card className="border-border-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Mandatory</p>
                  <p className="text-xl font-bold text-amber-400">{formatUGX(mandatoryTotal)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-amber-400/10">
                  <Wallet className="w-5 h-5 text-amber-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <Card className="border-border-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Total Optional</p>
                  <p className="text-xl font-bold text-blue-400">{formatUGX(optionalTotal)}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-blue-400/10">
                  <GraduationCap className="w-5 h-5 text-blue-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
        <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}>
          <Card className="border-border-subtle">
            <CardContent className="p-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-gray-400">Fee Items</p>
                  <p className="text-xl font-bold">{feeItems.length}</p>
                </div>
                <div className="p-2.5 rounded-lg bg-emerald-400/10">
                  <FileText className="w-5 h-5 text-emerald-400" />
                </div>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      {/* Fee Items Table */}
      {!selectedTermId ? (
        <EmptyState
          icon={Wallet}
          title="Select a term"
          description="Choose a term above to view and manage fee structures."
        />
      ) : feeItems.length === 0 ? (
        <EmptyState
          icon={Wallet}
          title="No fee items configured"
          description="Add fee items to define what students should pay this term."
          action={
            <Button onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Add First Fee Item
            </Button>
          }
        />
      ) : (
        <Card className="border-border-subtle">
          <CardHeader>
            <CardTitle className="text-lg">Fee Items</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="rounded-xl border border-navy-700 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="bg-navy-800 border-b border-navy-700">
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Name</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Amount</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Applies To</th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">Mandatory</th>
                      <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-navy-700/50">
                    <AnimatePresence>
                      {feeItems.map((item) => (
                        <motion.tr
                          key={item.id}
                          initial={{ opacity: 0, x: -10 }}
                          animate={{ opacity: 1, x: 0 }}
                          exit={{ opacity: 0, x: 10 }}
                          className="bg-navy-900 hover:bg-navy-800/50 transition-colors"
                        >
                          <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                          <td className="px-4 py-3 text-sm font-semibold text-amber-400">{formatUGX(item.amount)}</td>
                          <td className="px-4 py-3 text-sm">
                            <Badge variant={item.class_id ? "secondary" : "outline"}>
                              {getClassName(item.class_id)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-sm">
                            {item.is_mandatory ? (
                              <Badge variant="success">
                                <CheckCircle2 className="w-3 h-3 mr-1" />
                                Mandatory
                              </Badge>
                            ) : (
                              <Badge variant="secondary">Optional</Badge>
                            )}
                          </td>
                          <td className="px-4 py-3 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <Button variant="ghost" size="sm" onClick={() => openEditDialog(item)}>
                                <Pencil className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => {
                                  setDeletingItem(item);
                                  setDeleteDialogOpen(true);
                                }}
                                className="text-rose-400 hover:text-rose-300"
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </td>
                        </motion.tr>
                      ))}
                    </AnimatePresence>
                  </tbody>
                </table>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? "Edit Fee Item" : "Add Fee Item"}</DialogTitle>
          </DialogHeader>
          <form
            onSubmit={form.handleSubmit((values) => upsertMutation.mutate(values))}
            className="space-y-4 py-2"
          >
            <div className="space-y-2">
              <Label htmlFor="fee-name">Fee Name</Label>
              <Input
                id="fee-name"
                placeholder="e.g., Tuition, Activities, Uniform"
                {...form.register("name")}
              />
              {form.formState.errors.name && (
                <p className="text-xs text-rose-400">{form.formState.errors.name.message}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="fee-amount">Amount (UGX)</Label>
              <Input
                id="fee-amount"
                type="number"
                placeholder="0"
                min={0}
                step={1000}
                {...form.register("amount", { valueAsNumber: true })}
              />
              {form.formState.errors.amount && (
                <p className="text-xs text-rose-400">{form.formState.errors.amount.message}</p>
              )}
              {form.watch("amount") > 0 && (
                <p className="text-xs text-gray-500">{formatUGX(form.watch("amount"))}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Applies To</Label>
              <Select
                value={form.watch("class_id") ?? "all"}
                onValueChange={(val) => form.setValue("class_id", val === "all" ? null : val)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select class" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Classes</SelectItem>
                  {classes.map((cls) => (
                    <SelectItem key={cls.id} value={cls.id}>
                      {cls.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <div>
                <Label>Mandatory</Label>
                <p className="text-xs text-gray-500 mt-0.5">All students must pay this fee</p>
              </div>
              <Switch
                checked={form.watch("is_mandatory")}
                onCheckedChange={(checked) => form.setValue("is_mandatory", checked)}
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="ghost" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" loading={upsertMutation.isPending}>
                {editingItem ? "Update" : "Add Fee Item"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Fee Item</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingItem?.name}&quot;? This cannot be undone
              and may affect existing fee accounts.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)}
              loading={deleteMutation.isPending}
            >
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Generate Accounts Confirmation */}
      <AlertDialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Generate Fee Accounts</AlertDialogTitle>
            <AlertDialogDescription>
              This will create or update fee accounts for all enrolled students based on the current
              fee structure. Existing accounts will have their expected amounts recalculated.
              Payments already made will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Fee items: <span className="text-foreground font-medium">{feeItems.length}</span>
            {" \u00b7 "}
            Total per student:{" "}
            <span className="text-amber-400 font-medium">
              {formatUGX(feeItems.reduce((s, f) => s + f.amount, 0))}
            </span>
          </div>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => generateMutation.mutate()} loading={generateMutation.isPending}>
              Generate Accounts
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Change Log Dialog */}
      <Dialog open={changeLogOpen} onOpenChange={setChangeLogOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <History className="w-5 h-5" />
              Fee Structure Change Log
            </DialogTitle>
          </DialogHeader>
          {auditLog.length === 0 ? (
            <EmptyState
              icon={History}
              title="No changes recorded"
              description="Changes to fee structures will appear here."
            />
          ) : (
            <div className="space-y-3">
              {auditLog.map((entry: any) => {
                const actionColors: Record<string, string> = {
                  created: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30",
                  updated: "bg-amber-400/15 text-amber-400 border-amber-400/30",
                  deleted: "bg-rose-500/15 text-rose-400 border-rose-500/30",
                };
                const oldVal = entry.old_value as Record<string, any> | null;
                const newVal = entry.new_value as Record<string, any> | null;

                return (
                  <div
                    key={entry.id}
                    className="p-4 rounded-lg border border-navy-700 bg-navy-900/50 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge className={cn("text-xs border", actionColors[entry.action] || "bg-gray-500/15 text-gray-400")}>
                          {entry.action}
                        </Badge>
                        <span className="text-sm font-medium">
                          {newVal?.name || oldVal?.name || "Fee item"}
                        </span>
                      </div>
                      <span className="text-xs text-gray-500">
                        {formatDate(entry.created_at)}
                      </span>
                    </div>
                    <div className="text-xs text-gray-400">
                      By {entry.changed_by_user?.full_name || "System"}
                    </div>
                    {entry.action === "updated" && oldVal && newVal && (
                      <div className="text-xs space-y-1 mt-2">
                        {Object.keys(newVal).map((key) => {
                          if (oldVal[key] === newVal[key]) return null;
                          return (
                            <div key={key} className="flex items-center gap-2">
                              <span className="text-gray-500 w-20">{key}:</span>
                              <span className="text-rose-400 line-through">{String(oldVal[key])}</span>
                              <span className="text-gray-500">&rarr;</span>
                              <span className="text-emerald-400">{String(newVal[key])}</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                    {entry.action === "created" && newVal && (
                      <div className="text-xs text-gray-400 mt-1">
                        Amount: {formatUGX(newVal.amount)} &middot; {newVal.is_mandatory ? "Mandatory" : "Optional"}
                        {newVal.class_id ? ` &middot; Class-specific` : " &middot; All classes"}
                      </div>
                    )}
                    {entry.action === "deleted" && oldVal && (
                      <div className="text-xs text-gray-400 mt-1">
                        Was: {oldVal.name} &middot; {formatUGX(oldVal.amount)}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
