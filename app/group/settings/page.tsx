"use client";

import { useEffect, useState } from "react";
import { useSchoolStore } from "@/store/school";
import { createBrowserClient } from "@/lib/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { Settings, Users, Loader2, Trash2, UserPlus } from "lucide-react";

interface GroupAdmin {
  id: string;
  user_id: string;
  user: { full_name: string; phone: string | null } | null;
}

export default function GroupSettingsPage() {
  const { group, setGroup } = useSchoolStore();
  const supabase = createBrowserClient();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [groupName, setGroupName] = useState("");
  const [groupCode, setGroupCode] = useState("");

  const [admins, setAdmins] = useState<GroupAdmin[]>([]);
  const [newAdminPhone, setNewAdminPhone] = useState("");
  const [addingAdmin, setAddingAdmin] = useState(false);

  useEffect(() => {
    async function loadData() {
      if (!group) return;

      setGroupName(group.name);
      setGroupCode(group.code);

      const { data: adminData } = await supabase
        .from("group_admins")
        .select("id, user_id, user:users(full_name, phone)")
        .eq("group_id", group.id);

      if (adminData) {
        setAdmins(
          adminData.map((a) => ({
            id: a.id,
            user_id: a.user_id,
            user: a.user as unknown as { full_name: string; phone: string | null } | null,
          }))
        );
      }

      setLoading(false);
    }

    loadData();
  }, [group, supabase]);

  async function handleSaveGroupInfo() {
    if (!group) return;
    setSaving(true);

    const { error } = await supabase
      .from("school_groups")
      .update({ name: groupName.trim(), code: groupCode.trim() })
      .eq("id", group.id);

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setGroup({ ...group, name: groupName.trim(), code: groupCode.trim() });
      toast({ title: "Saved", description: "Group info updated." });
    }

    setSaving(false);
  }

  async function handleAddAdmin() {
    if (!group || !newAdminPhone.trim()) return;
    setAddingAdmin(true);

    const { data: user } = await supabase
      .from("users")
      .select("id")
      .eq("phone", newAdminPhone.trim())
      .single();

    if (!user) {
      toast({ title: "Not found", description: "No user found with that phone number.", variant: "destructive" });
      setAddingAdmin(false);
      return;
    }

    const { error } = await supabase.from("group_admins").insert({
      group_id: group.id,
      user_id: user.id,
    });

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      toast({ title: "Admin added", description: "User has been added as a group admin." });
      setNewAdminPhone("");
      const { data: adminData } = await supabase
        .from("group_admins")
        .select("id, user_id, user:users(full_name, phone)")
        .eq("group_id", group.id);
      if (adminData) {
        setAdmins(
          adminData.map((a) => ({
            id: a.id,
            user_id: a.user_id,
            user: a.user as unknown as { full_name: string; phone: string | null } | null,
          }))
        );
      }
    }

    setAddingAdmin(false);
  }

  async function handleRemoveAdmin(adminId: string) {
    const { error } = await supabase.from("group_admins").delete().eq("id", adminId);
    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else {
      setAdmins((prev) => prev.filter((a) => a.id !== adminId));
      toast({ title: "Removed", description: "Admin removed from group." });
    }
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-40 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Settings</h1>
        <p className="text-foreground/60 text-sm">Manage your school group</p>
      </div>

      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Settings className="w-5 h-5 text-amber-400" />
            Group Info
          </CardTitle>
          <CardDescription>Edit your group name and code</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <Label>Group Name</Label>
            <Input value={groupName} onChange={(e) => setGroupName(e.target.value)} />
          </div>
          <div>
            <Label>Group Code</Label>
            <Input value={groupCode} onChange={(e) => setGroupCode(e.target.value)} />
          </div>
          <Button onClick={handleSaveGroupInfo} disabled={saving}>
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
            Save Changes
          </Button>
        </CardContent>
      </Card>

      <Card className="border-border-subtle bg-surface">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-lg">
            <Users className="w-5 h-5 text-amber-400" />
            Group Admins
          </CardTitle>
          <CardDescription>Manage who can access this group portal</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-2">
            {admins.map((admin) => (
              <div
                key={admin.id}
                className="flex items-center justify-between p-3 rounded-lg bg-navy-900/50"
              >
                <div>
                  <p className="text-sm font-medium">{admin.user?.full_name || "Unknown"}</p>
                  <p className="text-xs text-foreground/40">{admin.user?.phone || "No phone"}</p>
                </div>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => handleRemoveAdmin(admin.id)}
                  className="text-rose-400 hover:text-rose-300"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            ))}
            {admins.length === 0 && (
              <p className="text-sm text-foreground/40 py-4 text-center">No group admins yet</p>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              placeholder="Phone number to add as admin"
              value={newAdminPhone}
              onChange={(e) => setNewAdminPhone(e.target.value)}
            />
            <Button onClick={handleAddAdmin} disabled={addingAdmin || !newAdminPhone.trim()}>
              {addingAdmin ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
