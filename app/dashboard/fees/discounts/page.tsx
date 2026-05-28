"use client";

import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import type { FeeDiscount, StudentDiscount } from "@/types";
import {
  createDiscountSchema,
  type CreateDiscountFormData,
} from "@/lib/validations/fees";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import { useToast } from "@/components/ui/use-toast";
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
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import {
  Percent,
  Plus,
  Pencil,
  Trash2,
  Users,
  Loader2,
  Eye,
  X,
  BadgePercent,
} from "lucide-react";

interface DiscountWithCount extends FeeDiscount {
  student_count: number;
}

interface StudentDiscountWithStudent extends StudentDiscount {
  student_name?: string;
  student_class?: string;
}

export default function DiscountsPage() {
  const school = useSchoolStore((s) => s.school);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<FeeDiscount | null>(null);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingItem, setDeletingItem] = useState<FeeDiscount | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formType, setFormType] = useState<"percentage" | "fixed_amount">("percentage");
  const [formValue, setFormValue] = useState("");
  const [formMaxAmount, setFormMaxAmount] = useState("");
  const [formIsRecurring, setFormIsRecurring] = useState(true);
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});

  // Sheet state for viewing students
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedDiscount, setSelectedDiscount] = useState<FeeDiscount | null>(null);
  const [removingStudentId, setRemovingStudentId] = useState<string | null>(null);

  // ── Queries ──────────────────────────────────────────────────────────

  const { data: discounts = [], isLoading } = useQuery({
    queryKey: ["fee-discounts", school?.id],
    queryFn: async () => {
      // Fetch discounts
      const { data: discountsData, error } = await supabase
        .from("fee_discounts")
        .select("*")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;
      if (!discountsData || discountsData.length === 0) return [];

      // Fetch student counts per discount
      const discountIds = discountsData.map((d) => d.id);
      const { data: countData } = await supabase
        .from("student_discounts")
        .select("discount_id")
        .in("discount_id", discountIds)
        .eq("is_deleted", false);

      const countMap = new Map<string, number>();
      countData?.forEach((sd) => {
        countMap.set(sd.discount_id, (countMap.get(sd.discount_id) || 0) + 1);
      });

      return discountsData.map((d) => ({
        ...d,
        student_count: countMap.get(d.id) || 0,
      })) as DiscountWithCount[];
    },
    enabled: !!school?.id,
  });

  const { data: studentsForDiscount = [], isLoading: studentsLoading } = useQuery({
    queryKey: ["student-discounts-for", selectedDiscount?.id],
    queryFn: async () => {
      if (!selectedDiscount) return [];

      const { data, error } = await supabase
        .from("student_discounts")
        .select(`
          *,
          student:students(full_name, current_class_id, classes(name))
        `)
        .eq("discount_id", selectedDiscount.id)
        .eq("is_deleted", false)
        .order("created_at", { ascending: false });

      if (error) throw error;

      return ((data || []) as any[]).map((sd) => ({
        ...sd,
        student_name: sd.student?.full_name || "Unknown",
        student_class: sd.student?.classes?.name || "N/A",
      })) as StudentDiscountWithStudent[];
    },
    enabled: !!selectedDiscount && sheetOpen,
  });

  // ── Form helpers ─────────────────────────────────────────────────────

  function resetForm() {
    setFormName("");
    setFormType("percentage");
    setFormValue("");
    setFormMaxAmount("");
    setFormIsRecurring(true);
    setFormErrors({});
  }

  function openAddDialog() {
    setEditingItem(null);
    resetForm();
    setDialogOpen(true);
  }

  function openEditDialog(item: FeeDiscount) {
    setEditingItem(item);
    setFormName(item.name);
    setFormType(item.discount_type);
    setFormValue(String(item.value));
    setFormMaxAmount(item.max_amount != null ? String(item.max_amount) : "");
    setFormIsRecurring(item.is_recurring);
    setFormErrors({});
    setDialogOpen(true);
  }

  function validateForm(): boolean {
    const result = createDiscountSchema.safeParse({
      name: formName,
      discount_type: formType,
      value: parseFloat(formValue),
      max_amount: formMaxAmount ? parseFloat(formMaxAmount) : null,
      is_recurring: formIsRecurring,
    });

    if (!result.success) {
      const errors: Record<string, string> = {};
      result.error.issues.forEach((issue) => {
        const key = issue.path[0] as string;
        errors[key] = issue.message;
      });
      setFormErrors(errors);
      return false;
    }

    setFormErrors({});
    return true;
  }

  function handleSubmit() {
    if (!validateForm()) return;

    const values: CreateDiscountFormData = {
      name: formName,
      discount_type: formType,
      value: parseFloat(formValue),
      max_amount: formMaxAmount ? parseFloat(formMaxAmount) : null,
      is_recurring: formIsRecurring,
    };

    upsertMutation.mutate(values);
  }

  // ── Mutations ────────────────────────────────────────────────────────

  const upsertMutation = useMutation({
    mutationFn: async (values: CreateDiscountFormData) => {
      if (editingItem) {
        const res = await fetch("/api/fees/discounts", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            id: editingItem.id,
            ...values,
          }),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to update");
      } else {
        const res = await fetch("/api/fees/discounts", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(values),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || "Failed to create");
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-discounts"] });
      toast({ title: editingItem ? "Discount updated" : "Discount created" });
      setDialogOpen(false);
    },
    onError: (err) => {
      toast({
        title: "Error saving discount",
        description: err instanceof Error ? err.message : "Something went wrong",
        variant: "destructive",
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/fees/discounts?id=${id}`, { method: "DELETE" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to delete");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["fee-discounts"] });
      toast({ title: "Discount deleted" });
      setDeleteDialogOpen(false);
      setDeletingItem(null);
    },
    onError: () => {
      toast({ title: "Failed to delete discount", variant: "destructive" });
    },
  });

  const removeStudentMutation = useMutation({
    mutationFn: async (studentDiscountId: string) => {
      setRemovingStudentId(studentDiscountId);
      const res = await fetch(`/api/fees/student-discounts?id=${studentDiscountId}`, {
        method: "DELETE",
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || "Failed to remove");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["student-discounts-for"] });
      queryClient.invalidateQueries({ queryKey: ["fee-discounts"] });
      toast({ title: "Student discount removed" });
      setRemovingStudentId(null);
    },
    onError: () => {
      toast({ title: "Failed to remove student discount", variant: "destructive" });
      setRemovingStudentId(null);
    },
  });

  // ── Derived ──────────────────────────────────────────────────────────

  function formatDiscountValue(item: FeeDiscount): string {
    if (item.discount_type === "percentage") {
      return `${item.value}%`;
    }
    return formatUGX(item.value);
  }

  function formatMaxAmount(item: FeeDiscount): string {
    if (item.max_amount == null) return "\u2014";
    return formatUGX(item.max_amount);
  }

  // ── Render ───────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32 mt-2" />
          </div>
          <Skeleton className="h-10 w-40" />
        </div>
        <Skeleton className="h-64 rounded-xl" />
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
          <h1 className="text-2xl font-bold font-display">Fee Discounts</h1>
          <p className="text-gray-400 text-sm">
            Manage discount types and scholarships for students
          </p>
        </div>
        <Button onClick={openAddDialog}>
          <Plus className="w-4 h-4 mr-2" />
          Create Discount
        </Button>
      </div>

      {/* Table */}
      {discounts.length === 0 ? (
        <EmptyState
          icon={BadgePercent}
          title="No discounts configured"
          description="Create discount types to apply fee reductions for students."
          action={
            <Button onClick={openAddDialog}>
              <Plus className="w-4 h-4 mr-2" />
              Create First Discount
            </Button>
          }
        />
      ) : (
        <div className="bg-navy-800 border border-navy-700 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-navy-900 border-b border-navy-700">
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Name
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Type
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Value
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Max Amount
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Recurring
                  </th>
                  <th className="px-4 py-3 text-center text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Students
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-medium text-gray-400 uppercase tracking-wider">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-700/50">
                <AnimatePresence>
                  {discounts.map((item) => (
                    <motion.tr
                      key={item.id}
                      initial={{ opacity: 0, x: -10 }}
                      animate={{ opacity: 1, x: 0 }}
                      exit={{ opacity: 0, x: 10 }}
                      className="bg-navy-900 hover:bg-navy-800/50 transition-colors"
                    >
                      <td className="px-4 py-3 text-sm font-medium">{item.name}</td>
                      <td className="px-4 py-3 text-sm">
                        <Badge variant="secondary">
                          {item.discount_type === "percentage" ? "Percentage" : "Fixed Amount"}
                        </Badge>
                      </td>
                      <td className="px-4 py-3 text-sm text-right font-semibold text-amber-400">
                        {formatDiscountValue(item)}
                      </td>
                      <td className="px-4 py-3 text-sm text-right text-gray-400">
                        {formatMaxAmount(item)}
                      </td>
                      <td className="px-4 py-3 text-sm">
                        {item.is_recurring ? (
                          <Badge className="bg-emerald-500/15 text-emerald-400 border-emerald-500/30">
                            Yes
                          </Badge>
                        ) : (
                          <Badge variant="outline">No</Badge>
                        )}
                      </td>
                      <td className="px-4 py-3 text-sm text-center">
                        <Button
                          variant="ghost"
                          size="sm"
                          className="gap-1.5"
                          onClick={() => {
                            setSelectedDiscount(item);
                            setSheetOpen(true);
                          }}
                        >
                          <Users className="w-4 h-4" />
                          {item.student_count}
                        </Button>
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="flex items-center justify-end gap-2">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedDiscount(item);
                              setSheetOpen(true);
                            }}
                          >
                            <Eye className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => openEditDialog(item)}
                          >
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
          <div className="px-4 py-3 border-t border-navy-700/50">
            <p className="text-xs text-gray-500">
              {discounts.length} discount{discounts.length !== 1 ? "s" : ""} configured
            </p>
          </div>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {editingItem ? "Edit Discount" : "Create Discount"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <Label htmlFor="discount-name">Discount Name</Label>
              <Input
                id="discount-name"
                placeholder="e.g., Sibling Discount, Scholarship"
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
              {formErrors.name && (
                <p className="text-xs text-rose-400">{formErrors.name}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label>Discount Type</Label>
              <Select
                value={formType}
                onValueChange={(val) => setFormType(val as "percentage" | "fixed_amount")}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Select type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="percentage">Percentage</SelectItem>
                  <SelectItem value="fixed_amount">Fixed Amount</SelectItem>
                </SelectContent>
              </Select>
              {formErrors.discount_type && (
                <p className="text-xs text-rose-400">{formErrors.discount_type}</p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="discount-value">
                {formType === "percentage" ? "Percentage (%)" : "Amount (UGX)"}
              </Label>
              <Input
                id="discount-value"
                type="number"
                placeholder={formType === "percentage" ? "e.g., 10" : "e.g., 50000"}
                value={formValue}
                onChange={(e) => setFormValue(e.target.value)}
                min={0}
                step={formType === "percentage" ? 1 : 1000}
              />
              {formErrors.value && (
                <p className="text-xs text-rose-400">{formErrors.value}</p>
              )}
              {formType === "percentage" && formValue && parseFloat(formValue) > 0 && (
                <p className="text-xs text-gray-500">
                  {parseFloat(formValue)}% of fee amount
                </p>
              )}
              {formType === "fixed_amount" && formValue && parseFloat(formValue) > 0 && (
                <p className="text-xs text-gray-500">
                  {formatUGX(parseFloat(formValue))}
                </p>
              )}
            </div>

            {formType === "percentage" && (
              <div className="space-y-2">
                <Label htmlFor="discount-max">Max Amount (UGX, optional)</Label>
                <Input
                  id="discount-max"
                  type="number"
                  placeholder="No cap"
                  value={formMaxAmount}
                  onChange={(e) => setFormMaxAmount(e.target.value)}
                  min={0}
                  step={1000}
                />
                {formErrors.max_amount && (
                  <p className="text-xs text-rose-400">{formErrors.max_amount}</p>
                )}
                <p className="text-xs text-gray-500">
                  Limits the maximum discount amount regardless of percentage
                </p>
              </div>
            )}

            <div className="flex items-center justify-between">
              <div>
                <Label>Recurring</Label>
                <p className="text-xs text-gray-500 mt-0.5">
                  Apply automatically each term
                </p>
              </div>
              <Switch
                checked={formIsRecurring}
                onCheckedChange={setFormIsRecurring}
              />
            </div>
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="ghost"
              onClick={() => setDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              onClick={handleSubmit}
              disabled={upsertMutation.isPending}
            >
              {upsertMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              {editingItem ? "Update" : "Create Discount"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation */}
      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Discount</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete &quot;{deletingItem?.name}&quot;? This
              will also remove all student assignments for this discount.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <Button variant="ghost" onClick={() => setDeleteDialogOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => deletingItem && deleteMutation.mutate(deletingItem.id)}
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending && (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              )}
              Delete
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* View Students Sheet */}
      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent className="w-full sm:max-w-md overflow-y-auto">
          <SheetHeader>
            <SheetTitle>
              {selectedDiscount?.name || "Students"}
            </SheetTitle>
            <SheetDescription>
              Students with this discount applied
              {selectedDiscount && (
                <span className="ml-2 text-amber-400 font-medium">
                  ({selectedDiscount.discount_type === "percentage"
                    ? `${selectedDiscount.value}%`
                    : formatUGX(selectedDiscount.value)})
                </span>
              )}
            </SheetDescription>
          </SheetHeader>

          <div className="mt-6 space-y-3">
            {studentsLoading ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : studentsForDiscount.length === 0 ? (
              <div className="text-center py-12">
                <Users className="w-10 h-10 text-gray-600 mx-auto mb-3" />
                <p className="text-sm text-gray-400">
                  No students have this discount yet
                </p>
              </div>
            ) : (
              studentsForDiscount.map((sd) => (
                <div
                  key={sd.id}
                  className="flex items-center justify-between bg-navy-900 border border-navy-700 rounded-lg px-4 py-3"
                >
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">
                      {sd.student_name}
                    </p>
                    <p className="text-xs text-gray-500">
                      {sd.student_class}
                      {sd.term_id ? " \u00b7 Specific Term" : " \u00b7 All Terms"}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-400 hover:text-rose-300 ml-2 shrink-0"
                    onClick={() => removeStudentMutation.mutate(sd.id)}
                    disabled={removingStudentId === sd.id}
                  >
                    {removingStudentId === sd.id ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <X className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              ))
            )}
          </div>

          {studentsForDiscount.length > 0 && (
            <div className="mt-4 pt-4 border-t border-navy-700">
              <p className="text-xs text-gray-500 text-center">
                {studentsForDiscount.length} student{studentsForDiscount.length !== 1 ? "s" : ""}
              </p>
            </div>
          )}
        </SheetContent>
      </Sheet>
    </motion.div>
  );
}
