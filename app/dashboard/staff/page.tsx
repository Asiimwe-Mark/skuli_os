"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDate } from "@/lib/utils/dates";
import { staffSchema, type StaffFormData } from "@/lib/validations/staff";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/shared/empty-state";
import { PhotoUpload } from "@/components/shared/photo-upload";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Users,
  Plus,
  Edit2,
  Loader2,
  UserCircle,
  Briefcase,
  Building2,
} from "lucide-react";
import type { Staff } from "@/types";

export default function StaffDirectoryPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingStaff, setEditingStaff] = useState<Staff | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);

  const handlePhotoUpload = async (file: File): Promise<string> => {
    const staffId = editingStaff?.id || `temp-${Date.now()}`;
    const filePath = `${school!.id}/${staffId}.jpg`;
    const { error } = await supabase.storage
      .from("staff-photos")
      .upload(filePath, file, { upsert: true });
    if (error) throw error;
    const { data } = supabase.storage.from("staff-photos").getPublicUrl(filePath);
    setPhotoUrl(data.publicUrl);
    return data.publicUrl;
  };

  const {
    register,
    handleSubmit,
    reset,
    setValue,
    formState: { errors },
  } = useForm<StaffFormData>({
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    resolver: zodResolver(staffSchema) as any,
  });

  const { data: staffList = [], isLoading } = useQuery({
    queryKey: ["staff", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("staff")
        .select("*")
        .eq("school_id", school!.id)
        .order("full_name");
      if (error) throw error;
      return (data || []) as Staff[];
    },
    enabled: !!school?.id,
  });

  const saveMutation = useMutation({
    mutationFn: async (data: StaffFormData) => {
      const payload = { ...data, photo_url: photoUrl };
      if (editingStaff) {
        const res = await fetch(`/api/staff/${editingStaff.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to update staff");
      } else {
        const res = await fetch("/api/staff", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || "Failed to add staff");
      }
    },
    onSuccess: () => {
      toast({ title: editingStaff ? "Staff updated" : "Staff added", variant: "success" });
      setDialogOpen(false);
      reset();
      setEditingStaff(null);
      queryClient.invalidateQueries({ queryKey: ["staff"] });
    },
    onError: (err) => {
      toast({
        title: "Error",
        description: err instanceof Error ? err.message : "Failed to save",
        variant: "destructive",
      });
    },
  });

  const openCreate = () => {
    reset({ full_name: "", role_title: "", national_id: "", bank_name: "", bank_account: "", nssf_number: "", basic_salary: 0, hire_date: new Date().toISOString().split("T")[0], is_active: true });
    setPhotoUrl(null);
    setEditingStaff(null);
    setDialogOpen(true);
  };

  const openEdit = (staff: Staff) => {
    setEditingStaff(staff);
    setPhotoUrl(staff.photo_url || null);
    reset({
      full_name: staff.full_name,
      role_title: staff.role_title,
      national_id: staff.national_id || "",
      bank_name: staff.bank_name || "",
      bank_account: staff.bank_account || "",
      nssf_number: staff.nssf_number || "",
      basic_salary: staff.basic_salary,
      hire_date: staff.hire_date,
      is_active: staff.is_active,
    });
    setDialogOpen(true);
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Staff Directory</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage your school staff and roles</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Add Staff
        </Button>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-40 rounded-xl" />)}
        </div>
      ) : staffList.length === 0 ? (
        <EmptyState
          icon={Users}
          title="No staff members"
          description="Add your teaching and non-teaching staff to manage payroll and assignments."
          action={
            <Button onClick={openCreate}>
              <Plus className="w-4 h-4 mr-2" />
              Add Staff
            </Button>
          }
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {staffList.map((staff, i) => (
            <motion.div
              key={staff.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.03 }}
            >
              <Card className="border-border-subtle bg-surface hover:border-border-glow transition-all group">
                <CardContent className="p-5">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-3">
                      <div className="w-12 h-12 rounded-full bg-navy-700 flex items-center justify-center overflow-hidden">
                        {staff.photo_url ? (
                          <img src={staff.photo_url} alt={staff.full_name} className="w-full h-full object-cover" />
                        ) : (
                          <UserCircle className="w-7 h-7 text-foreground/40" />
                        )}
                      </div>
                      <div>
                        <p className="font-medium">{staff.full_name}</p>
                        <p className="text-xs text-foreground/50 flex items-center gap-1">
                          <Briefcase className="w-3 h-3" />
                          {staff.role_title}
                        </p>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={() => openEdit(staff)}
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground/60">Employee No.</span>
                      <span className="font-mono text-xs">{staff.employee_number}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground/60">Basic Salary</span>
                      <span className="font-medium">{formatUGX(staff.basic_salary)}</span>
                    </div>
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground/60">Hire Date</span>
                      <span>{formatDate(staff.hire_date)}</span>
                    </div>
                    {staff.bank_name && (
                      <div className="flex items-center justify-between text-sm">
                        <span className="text-foreground/60 flex items-center gap-1">
                          <Building2 className="w-3 h-3" /> Bank
                        </span>
                        <span className="text-xs">{staff.bank_name} - {staff.bank_account}</span>
                      </div>
                    )}
                  </div>

                  <div className="mt-3 pt-3 border-t border-navy-600 flex items-center justify-between">
                    <Badge variant={staff.is_active ? "success" : "destructive"}>
                      {staff.is_active ? "Active" : "Inactive"}
                    </Badge>
                    {staff.nssf_number && (
                      <span className="text-[10px] text-foreground/40">NSSF: {staff.nssf_number}</span>
                    )}
                  </div>
                </CardContent>
              </Card>
            </motion.div>
          ))}
        </div>
      )}

      {/* Add/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingStaff ? "Edit Staff" : "Add Staff Member"}</DialogTitle>
          </DialogHeader>

          <form onSubmit={handleSubmit((data) => saveMutation.mutate(data as StaffFormData))} className="space-y-4">
            <div className="flex justify-center">
              <PhotoUpload
                currentUrl={photoUrl}
                onUpload={handlePhotoUpload}
                onRemove={() => setPhotoUrl(null)}
                size="lg"
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Full Name</Label>
                <Input {...register("full_name")} placeholder="John Doe" error={!!errors.full_name} />
                {errors.full_name && <p className="text-xs text-rose-400">{errors.full_name.message}</p>}
              </div>
              <div className="space-y-2">
                <Label>Role / Title</Label>
                <Input {...register("role_title")} placeholder="e.g. Teacher, Bursar" error={!!errors.role_title} />
                {errors.role_title && <p className="text-xs text-rose-400">{errors.role_title.message}</p>}
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>National ID</Label>
                <Input {...register("national_id")} placeholder="CMXXXXXXXXXXXX" />
              </div>
              <div className="space-y-2">
                <Label>NSSF Number</Label>
                <Input {...register("nssf_number")} placeholder="NSSF number" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Basic Salary (UGX)</Label>
              <Input
                type="number"
                {...register("basic_salary", { valueAsNumber: true })}
                placeholder="500000"
                error={!!errors.basic_salary}
              />
              {errors.basic_salary && <p className="text-xs text-rose-400">{errors.basic_salary.message}</p>}
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Bank Name</Label>
                <Input {...register("bank_name")} placeholder="e.g. Stanbic" />
              </div>
              <div className="space-y-2">
                <Label>Bank Account</Label>
                <Input {...register("bank_account")} placeholder="Account number" />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Hire Date</Label>
              <Input type="date" {...register("hire_date")} />
            </div>

            <div className="flex items-center gap-3">
              <Switch
                defaultChecked={true}
                onCheckedChange={(checked) => setValue("is_active", checked)}
              />
              <Label>Active</Label>
            </div>

            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {saveMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}
                {editingStaff ? "Update" : "Add Staff"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
