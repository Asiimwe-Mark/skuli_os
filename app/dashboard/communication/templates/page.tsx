"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";
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
import {
  FileStack,
  Plus,
  Edit2,
  Trash2,
  Copy,
  MessageSquare,
} from "lucide-react";

interface Template {
  id: string;
  name: string;
  body: string;
  category: string;
  variables: string[];
}

const DEFAULT_TEMPLATES: Template[] = [
  {
    id: "1",
    name: "Fee Reminder",
    body: "Dear {parent_name}, {student_name}'s fee balance is UGX {balance}. Please clear by the deadline. - {school_name}",
    category: "fees",
    variables: ["parent_name", "student_name", "balance", "school_name"],
  },
  {
    id: "2",
    name: "Payment Receipt",
    body: "Dear {parent_name}, Payment of UGX {amount} received for {student_name}. Balance: UGX {balance}. Receipt: {receipt_no}. - {school_name}",
    category: "fees",
    variables: ["parent_name", "amount", "student_name", "balance", "receipt_no", "school_name"],
  },
  {
    id: "3",
    name: "Exam Results Ready",
    body: "Dear {parent_name}, {student_name}'s exam results are ready. Log in to view at skuli.app/portal - {school_name}",
    category: "academics",
    variables: ["parent_name", "student_name", "school_name"],
  },
  {
    id: "4",
    name: "Absence Alert",
    body: "Dear {parent_name}, {student_name} was absent from school today, {date}. Please contact {school_name} if this is an error.",
    category: "attendance",
    variables: ["parent_name", "student_name", "date", "school_name"],
  },
  {
    id: "5",
    name: "School Closure",
    body: "Dear Parent, please note that {school_name} will be closed on {date}. Normal classes resume on {return_date}.",
    category: "general",
    variables: ["school_name", "date", "return_date"],
  },
  {
    id: "6",
    name: "Event Reminder",
    body: "Dear Parent, this is a reminder about {event_name} on {date} at {time}. - {school_name}",
    category: "general",
    variables: ["event_name", "date", "time", "school_name"],
  },
  {
    id: "7",
    name: "Term Opening",
    body: "Dear {parent_name}, {term} begins on {opening_date}. Fee deadline: {fee_deadline}. - {school_name}",
    category: "general",
    variables: ["parent_name", "term", "opening_date", "fee_deadline", "school_name"],
  },
];

const CATEGORY_COLORS: Record<string, string> = {
  fees: "bg-emerald/10 text-emerald",
  academics: "bg-blue-400/10 text-blue-400",
  attendance: "bg-amber/10 text-amber",
  general: "bg-purple-400/10 text-purple-400",
};

export default function TemplatesPage() {
  const [templates, setTemplates] = useState<Template[]>(DEFAULT_TEMPLATES);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<Template | null>(null);
  const [name, setName] = useState("");
  const [body, setBody] = useState("");
  const [category, setCategory] = useState("general");

  const openCreate = () => {
    setEditingTemplate(null);
    setName("");
    setBody("");
    setCategory("general");
    setDialogOpen(true);
  };

  const openEdit = (template: Template) => {
    setEditingTemplate(template);
    setName(template.name);
    setBody(template.body);
    setCategory(template.category);
    setDialogOpen(true);
  };

  const handleSave = () => {
    if (!name.trim() || !body.trim()) return;

    const variables = [...body.matchAll(/\{(\w+)\}/g)].map((m) => m[1]);

    if (editingTemplate) {
      setTemplates((prev) =>
        prev.map((t) =>
          t.id === editingTemplate.id
            ? { ...t, name, body, category, variables }
            : t
        )
      );
    } else {
      setTemplates((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          name,
          body,
          category,
          variables,
        },
      ]);
    }

    setDialogOpen(false);
  };

  const handleDelete = (id: string) => {
    setTemplates((prev) => prev.filter((t) => t.id !== id));
  };

  const handleCopy = (body: string) => {
    navigator.clipboard.writeText(body);
  };

  const insertVariable = (variable: string) => {
    setBody((prev) => prev + `{${variable}}`);
  };

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
                  <Badge
                    className={cn(
                      "text-[10px] mt-1",
                      CATEGORY_COLORS[template.category]
                    )}
                  >
                    {template.category}
                  </Badge>
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
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => handleDelete(template.id)}
                    title="Delete"
                    className="text-rose hover:text-rose"
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
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
              <Label>Category</Label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full h-10 px-3 rounded-md bg-navy-50 border border-input text-foreground text-sm"
              >
                <option value="general">General</option>
                <option value="fees">Fees</option>
                <option value="academics">Academics</option>
                <option value="attendance">Attendance</option>
              </select>
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
            <Button onClick={handleSave} disabled={!name.trim() || !body.trim()}>
              {editingTemplate ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </motion.div>
  );
}
