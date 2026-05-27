"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatRelativeTime } from "@/lib/utils/dates";
import { inviteUserSchema, type InviteUserFormData } from "@/lib/validations/settings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Users,
  Plus,
  Loader2,
  UserCircle,
  Mail,
} from "lucide-react";
import type { UserProfile } from "@/types";

const ROLE_LABELS: Record<string, string> = {
  SUPER_ADMIN: "Super Admin",
  SCHOOL_ADMIN: "School Admin",
  BURSAR: "Bursar",
  TEACHER: "Teacher",
  PARENT: "Parent",
};

export default function UsersPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);

  const { register, handleSubmit, reset, formState: { errors } } = useForm<InviteUserFormData>({
    resolver: zodResolver(inviteUserSchema),
  });

  const { data: users = [], isLoading } = useQuery({
    queryKey: ["users", school?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("users")
        .select("*")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false });
      if (error) throw error;
      return (data || []) as UserProfile[];
    },
    enabled: !!school?.id,
  });

  const inviteMutation = useMutation({
    mutationFn: async (data: InviteUserFormData) => {
      const res = await fetch("/api/users/invite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...data, school_id: school!.id }),
      });
      const result = await res.json();
      if (!result.success) throw new Error(result.error || "Failed to invite");
    },
    onSuccess: () => {
      toast({ title: "Invitation sent", variant: "success" });
      setDialogOpen(false);
      reset();
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
    onError: (err) => {
      toast({ title: "Error", description: err instanceof Error ? err.message : "Failed", variant: "destructive" });
    },
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ userId, isActive }: { userId: string; isActive: boolean }) => {
      const { error } = await supabase.from("users").update({ is_active: isActive }).eq("id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast({ title: "User updated", variant: "success" });
      queryClient.invalidateQueries({ queryKey: ["users"] });
    },
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">Users & Roles</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage who has access to your school dashboard</p>
        </div>
        <Button onClick={() => { reset(); setDialogOpen(true); }}>
          <Plus className="w-4 h-4 mr-2" />Invite User
        </Button>
      </div>

      {isLoading ? (
        <div className="space-y-2">{[...Array(5)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : users.length === 0 ? (
        <EmptyState icon={Users} title="No users" description="Invite team members to help manage your school." action={<Button onClick={() => setDialogOpen(true)}>Invite User</Button>} />
      ) : (
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead>Last Active</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-20">Active</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {users.map((user) => (
                  <TableRow key={user.id}>
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <div className="w-8 h-8 rounded-full bg-navy-700 flex items-center justify-center">
                          <UserCircle className="w-5 h-5 text-foreground/40" />
                        </div>
                        <div>
                          <p className="font-medium text-sm">{user.full_name}</p>
                          <p className="text-xs text-foreground/50">{user.id.slice(0, 8)}...</p>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>
                      <Badge variant="outline">{ROLE_LABELS[user.role] || user.role}</Badge>
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">{formatRelativeTime(user.updated_at)}</TableCell>
                    <TableCell>
                      <Badge variant={user.is_active ? "success" : "destructive"}>{user.is_active ? "Active" : "Inactive"}</Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={user.is_active}
                        onCheckedChange={(checked) => toggleActiveMutation.mutate({ userId: user.id, isActive: checked })}
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Mail className="w-5 h-5 text-amber-400" />Invite User
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit((d) => inviteMutation.mutate(d))} className="space-y-4">
            <div className="space-y-2">
              <Label>Full Name</Label>
              <Input {...register("full_name")} placeholder="John Doe" error={!!errors.full_name} />
              {errors.full_name && <p className="text-xs text-rose-400">{errors.full_name.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Email</Label>
              <Input {...register("email")} type="email" placeholder="john@school.com" error={!!errors.email} />
              {errors.email && <p className="text-xs text-rose-400">{errors.email.message}</p>}
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <select {...register("role")} className="w-full h-10 px-3 rounded-lg bg-navy-800 border border-navy-600 text-foreground text-sm">
                <option value="">Select role</option>
                <option value="SCHOOL_ADMIN">School Admin</option>
                <option value="BURSAR">Bursar</option>
                <option value="TEACHER">Teacher</option>
                <option value="PARENT">Parent</option>
              </select>
              {errors.role && <p className="text-xs text-rose-400">{errors.role.message}</p>}
            </div>
            <DialogFooter>
              <Button variant="ghost" type="button" onClick={() => setDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={inviteMutation.isPending}>
                {inviteMutation.isPending && <Loader2 className="w-4 h-4 mr-2 animate-spin" />}Send Invitation
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
