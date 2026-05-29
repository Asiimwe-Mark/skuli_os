"use client";

import { useState, useEffect } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
import { createBrowserClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  FileStack,
  Plus,
  Edit2,
  Trash2,
  Copy,
  MessageSquare,
  Loader2,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  body: string;
  variables: string[];
  is_default: boolean;
}

const CATEGORY_COLORS: Record<string, string> = {
  fees: "bg-emerald/10 text-emerald",
  academics: "bg-blue-400/10 text-blue-400",
  attendance: "bg-amber/10 text-amber",
  general: "bg-purple-400/10 text-purple-400",
};

export default function TemplatesPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createBrowserClient();
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");

  useEffect(() => {
    if (school) fetchTemplates();
  }, [school]);

  async function fetchTemplates() {
    if (!school) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("sms_templates")
      .select("id, name, body, variables, is_default")
      .eq("school_id", school.id)
      .eq("is_deleted", false)
      .order("is_default", { ascending: false })
      .order("name");

    if (error) {
      toast({ title: "Failed to load templates", variant: "destructive" });
    } else {
      setTemplates(data || []);
    }
    setLoading(false);
  }

  const openCreate = () => {
    setEditingTemplate(null);
    setName("");
    setBody("");
    setDialogOpen(true);
  };

  const openEdit = (template: Template) => {
    setEditingTemplate(template);
    setName(template.name);
    setBody(template.body);
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim() || !body.trim() || !school) return;
    setSaving(true);

    const variables = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

    if (editingTemplate) {
      const { error } = await supabase
        .from("sms_templates")
        .update({ name, body, variables })
        .eq("id", editingTemplate.id);

      if (error) {
        toast({ title: "Failed to update template", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Template updated" });
    } else {
      const { error } = await supabase.from("sms_templates").insert({
        school_id: school.id,
        name,
        body,
        variables,
        is_default: false,
      });

      if (error) {
        toast({ title: "Failed to create template", variant: "destructive" });
        setSaving(false);
        return;
      }
      toast({ title: "Template created" });
    }

    setDialogOpen(false);
    setSaving(false);
    fetchTemplates();
  };

  const handleDelete = async (id: string) => {
    const { error } = await supabase
      .from("sms_templates")
      .update({ is_deleted: true })
      .eq("id", id);

    if (error) {
      toast({ title: "Failed to delete template", variant: "destructive" });
    } else {
      toast({ title: "Template deleted" });
      fetchTemplates();
    }
  };

  const handleCopy = (body: string) => {
    navigator.clipboard.writeText(body);
    toast({ title: "Copied to clipboard" });
  };

  const insertVariable = (variable: string) => {
    setBody((prev) => prev + `{${variable}}`);
  };

  if (loading) {
    return (
      <div className="space-y-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-40" />)}
        </div>
      </div>
    );
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold font-display">SMS Templates</h1>
          <p className="text-muted-foreground text-sm mt-1">
            Reusable message templates with variable placeholders
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Create Template
        </Button>
      </div>

      {/* Templates grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {templates.map((template, i) => (
          <motion.div
            key={template.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: i * 0.05 }}
          >
            <Card className="h-full hover:shadow-lg transition-shadow">
              <CardHeader className="flex flex-row items-start justify-between pb-3">
                <div>
                  <CardTitle className="text-base">{template.name}</CardTitle>
                  {template.is_default && (
                    <Badge variant="secondary" className="text-[10px] mt-1">
                      Default
                    </Badge>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleCopy(template.body)}
                    title="Copy"
                  >
                    <Copy className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => openEdit(template)}
                    title="Edit"
                  >
                    <Edit2 className="w-4 h-4" />
                  </Button>
                  {!template.is_default && (
                    <Button
                      variant="ghost"
                      size="icon"
                      onClick={() => handleDelete(template.id)}
                      title="Delete"
                      className="text-rose hover:text-rose"
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {template.body}
                </p>
                {template.variables.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-3">
                    {template.variables.map((v) => (
                      <Badge
                        key={v}
                        variant="outline"
                        className="text-[10px] text-amber border-amber/20"
                      >
                        {`{${v}}`}
                      </Badge>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {templates.length === 0 && (
        <div className="text-center py-12 text-muted-foreground">
          <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-50" />
          <p>No templates yet. Create one to get started.</p>
        </div>
      )}

      {/* Create/Edit Dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>
              {editingTemplate ? "Edit Template" : "Create Template"}
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Template Name</Label>
              <Input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Fee Reminder"
              />
            </div>

            <div className="space-y-2">
              <Label>Message Body</Label>
              <div className="flex flex-wrap gap-1 mb-2">
                {[
                  "parent_name",
                  "student_name",
                  "balance",
                  "amount",
                  "school_name",
                  "term",
                  "date",
                  "receipt_no",
                ].map((v) => (
                  <button
                    key={v}
                    type="button"
                    onClick={() => insertVariable(v)}
                    className="px-2 py-0.5 rounded bg-navy-50 text-xs text-amber hover:bg-navy-50/80"
                  >
                    {`{${v}}`}
                  </button>
                ))}
              </div>
              <Textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Type your template here..."
                rows={4}
              />
              <p className="text-xs text-muted-foreground">
                {body.length} characters · Use {"{variable_name}"} for dynamic values
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button variant="ghost" onClick={() => setDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={handleSave} disabled={!name.trim() || !body.trim() || saving}>
              {saving ? (
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              ) : null}
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
