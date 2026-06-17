"use client";

import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { useToast } from "@/components/ui/use-toast";
import { createBrowserClient } from "@/lib/supabase/client";

interface ApplyDiscountDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  studentId: string;
  studentName?: string;
  currentTermId?: string;
}

export function ApplyDiscountDialog({
  open,
  onOpenChange,
  studentId,
  studentName,
  currentTermId,
}: ApplyDiscountDialogProps) {
  const [discountId, setDiscountId] = useState("");
  const [termId, setTermId] = useState(currentTermId || "");
  const [note, setNote] = useState("");
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const supabase = createBrowserClient();

  // Fetch available discounts
  const { data: discounts } = useQuery({
    queryKey: ["fee-discounts"],
    queryFn: async () => {
      const { data } = await supabase
        .from("fee_discounts")
        .select("id, school_id, name, discount_type, value, is_active")
        .eq("is_deleted", false)
        .order("name");
      return data || [];
    },
    enabled: open,
  });

  // Fetch terms
  const { data: terms } = useQuery({
    queryKey: ["terms"],
    queryFn: async () => {
      const { data } = await supabase
        .from("terms")
        .select("id, name, start_date")
        .eq("is_deleted", false)
        .order("start_date", { ascending: false });
      return data || [];
    },
    enabled: open,
  });

  const applyMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/fees/student-discounts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          student_id: studentId,
          discount_id: discountId,
          term_id: termId && termId !== "all" ? termId : null,
          note: note || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to apply discount");
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Discount applied successfully" });
      queryClient.invalidateQueries({ queryKey: ["student-discounts"] });
      queryClient.invalidateQueries({ queryKey: ["fee-accounts"] });
      onOpenChange(false);
      setDiscountId("");
      setNote("");
    },
    onError: (err: Error) => {
      toast({ title: "Error", description: err.message, variant: "destructive" });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-card border-border">
        <DialogHeader>
          <DialogTitle>
            Apply Discount{studentName ? ` - ${studentName}` : ""}
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label>Discount</Label>
            <Select value={discountId} onValueChange={setDiscountId}>
              <SelectTrigger className="bg-bg-tertiary border-border">
                <SelectValue placeholder="Select discount" />
              </SelectTrigger>
              <SelectContent className="bg-bg-tertiary border-border">
                {discounts?.map((d: any) => (
                  <SelectItem key={d.id} value={d.id}>
                    {d.name} ({d.discount_type === "percentage" ? `${d.value}%` : `UGX ${d.value.toLocaleString()}`})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Term</Label>
            <Select value={termId} onValueChange={setTermId}>
              <SelectTrigger className="bg-bg-tertiary border-border">
                <SelectValue placeholder="All Terms" />
              </SelectTrigger>
              <SelectContent className="bg-bg-tertiary border-border">
                <SelectItem value="all">All Terms</SelectItem>
                {terms?.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    {t.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <Label>Note (optional)</Label>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Reason for discount..."
              className="bg-bg-tertiary border-border"
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            onClick={() => applyMutation.mutate()}
            disabled={!discountId || applyMutation.isPending}
          >
            {applyMutation.isPending ? "Applying..." : "Apply Discount"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
