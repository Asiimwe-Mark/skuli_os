"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useSchoolStore } from "@/store/school";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  School,
  Plus,
  ArrowUpRight,
  Loader2,
  Users,
} from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";

interface SchoolRow {
  id: string;
  name: string;
  school_code: string | null;
  school_type: string;
  studentCount: number;
}

export default function GroupSchoolsPage() {
  const { group } = useSchoolStore();
  const supabase = useSupabaseBrowser();
  const router = useRouter();
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [schools, setSchools] = useState<SchoolRow[]>([]);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [creating, setCreating] = useState(false);

  const [newName, setNewName] = useState("");
  const [newCode, setNewCode] = useState("");
  const [newType, setNewType] = useState("primary");

  useEffect(() => {
    async function loadSchools() {
      if (!group) return;

      const { data } = await supabase
        .from("schools")
        .select("id, name, school_code, school_type")
        .eq("group_id", group.id)
        .eq("is_deleted", false)
        .order("name");

      if (!data) {
        setLoading(false);
        return;
      }

      const schoolsWithCounts: SchoolRow[] = [];
      for (const s of data) {
        const { count } = await supabase
          .from("students")
          .select("id", { count: "exact", head: true })
          .eq("school_id", s.id)
          .eq("is_deleted", false)
          .eq("status", "active");

        schoolsWithCounts.push({
          id: s.id,
          name: s.name,
          school_code: s.school_code,
          school_type: s.school_type,
          studentCount: count ?? 0,
        });
      }

      setSchools(schoolsWithCounts);
      setLoading(false);
    }

    loadSchools();
  }, [group, supabase]);

  async function handleCreateSchool() {
    if (!group || !newName.trim()) return;
    setCreating(true);

    const { data, error } = await supabase
      .from("schools")
      .insert({
        name: newName.trim(),
        school_code: newCode.trim() || "",
        school_type: newType,
        group_id: group.id,
        logo_url: null,
        address: null,
        district: null,
        phone: null,
        email: null,
        motto: null,
        max_students: 100,
        sms_sender_id: "SKULI",
        subscription_plan: "trial" as const,
        subscription_status: "trial" as const,
      } as any)
      .select("id, name, school_code, school_type")
      .single();

    if (error) {
      toast({ title: "Error", description: error.message, variant: "destructive" });
    } else if (data) {
      setSchools((prev) => [
        ...prev,
        { ...data, studentCount: 0 },
      ]);
      setDialogOpen(false);
      setNewName("");
      setNewCode("");
      setNewType("primary");
      toast({ title: "School created", description: `${data.name} has been added to the group.` });
    }

    setCreating(false);
  }

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-60 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold">Schools</h1>
          <p className="text-heading text-sm">{schools.length} school{schools.length !== 1 ? "s" : ""} in this group</p>
        </div>
        <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="w-4 h-4 mr-2" /> Add School
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add New School</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              <div>
                <Label>School Name</Label>
                <Input
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Kampala Primary School"
                />
              </div>
              <div>
                <Label>School Code (optional)</Label>
                <Input
                  value={newCode}
                  onChange={(e) => setNewCode(e.target.value)}
                  placeholder="e.g. KPS"
                />
              </div>
              <div>
                <Label>School Type</Label>
                <Select value={newType} onValueChange={setNewType}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="primary">Primary</SelectItem>
                    <SelectItem value="secondary">Secondary</SelectItem>
                    <SelectItem value="mixed">Mixed</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <Button onClick={handleCreateSchool} disabled={creating || !newName.trim()} className="w-full">
                {creating ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
                Create School
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <Card className="bg-card">
        <CardContent className="p-0">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left p-4 text-sm font-medium text-heading">School</th>
                <th className="text-left p-4 text-sm font-medium text-heading">Code</th>
                <th className="text-left p-4 text-sm font-medium text-heading">Type</th>
                <th className="text-right p-4 text-sm font-medium text-heading">Students</th>
                <th className="text-right p-4 text-sm font-medium text-heading"></th>
              </tr>
            </thead>
            <tbody>
              {schools.map((school) => (
                <tr
                  key={school.id}
                  className="border-b border-border hover:bg-card-hover cursor-pointer"
                  onClick={() => router.push(`/dashboard?school_id=${school.id}`)}
                >
                  <td className="p-4">
                    <div className="flex items-center gap-3">
                      <div className="w-8 h-8 rounded-lg bg-warning-50 flex items-center justify-center">
                        <School className="w-4 h-4 text-secondary" />
                      </div>
                      <span className="font-medium">{school.name}</span>
                    </div>
                  </td>
                  <td className="p-4 text-sm text-heading">{school.school_code || "-"}</td>
                  <td className="p-4 text-sm text-heading capitalize">{school.school_type}</td>
                  <td className="p-4 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Users className="w-3 h-3 text-heading" />
                      <span className="text-sm">{school.studentCount}</span>
                    </div>
                  </td>
                  <td className="p-4 text-right">
                    <ArrowUpRight className="w-4 h-4 text-heading" />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>
    </div>
  );
}
