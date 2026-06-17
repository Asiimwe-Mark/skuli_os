"use client";

import { useState } from "react";
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Loader2, AlertTriangle } from "lucide-react";

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  variant?: "default" | "destructive";
  requireTyping?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmText = "Confirm",
  variant = "default",
  requireTyping,
  onConfirm,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState("");

  const canConfirm = requireTyping ? typed === requireTyping : true;

  async function handleConfirm() {
    if (!canConfirm) return;
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
      setTyped("");
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-start gap-4">
            {variant === "destructive" && (
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-lg bg-danger-50 text-danger-600 ring-1 ring-danger-100">
                <AlertTriangle className="h-5 w-5" />
              </div>
            )}
            <div className="flex-1 space-y-1.5">
              <AlertDialogTitle>{title}</AlertDialogTitle>
              <AlertDialogDescription>{description}</AlertDialogDescription>
            </div>
          </div>
        </AlertDialogHeader>

        {requireTyping && (
          <div className="py-2">
            <p className="text-sm text-muted mb-2">
              Type{" "}
              <span className="font-mono font-semibold text-danger-600">
                {requireTyping}
              </span>{" "}
              to confirm:
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTyping}
              invalid={typed.length > 0 && !canConfirm}
            />
          </div>
        )}

        <AlertDialogFooter>
          <Button
            variant="ghost"
            onClick={() => onOpenChange(false)}
            disabled={loading}
          >
            Cancel
          </Button>
          <Button
            variant={variant === "destructive" ? "destructive" : "default"}
            onClick={handleConfirm}
            disabled={!canConfirm || loading}
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Processing...
              </>
            ) : (
              confirmText
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
