'use client';

import { useState } from 'react';
import {
  AlertDialog,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Loader2 } from 'lucide-react';

interface ConfirmModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmText?: string;
  variant?: 'default' | 'destructive';
  requireTyping?: string;
  onConfirm: () => Promise<void> | void;
}

export function ConfirmModal({
  open,
  onOpenChange,
  title,
  description,
  confirmText = 'Confirm',
  variant = 'default',
  requireTyping,
  onConfirm,
}: ConfirmModalProps) {
  const [loading, setLoading] = useState(false);
  const [typed, setTyped] = useState('');

  const canConfirm = requireTyping ? typed === requireTyping : true;

  async function handleConfirm() {
    if (!canConfirm) return;
    setLoading(true);
    try {
      await onConfirm();
      onOpenChange(false);
    } finally {
      setLoading(false);
      setTyped('');
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>{description}</AlertDialogDescription>
        </AlertDialogHeader>

        {requireTyping && (
          <div className="py-2">
            <p className="text-sm text-gray-400 mb-2">
              Type <span className="font-mono text-amber-400">{requireTyping}</span> to confirm:
            </p>
            <Input
              value={typed}
              onChange={(e) => setTyped(e.target.value)}
              placeholder={requireTyping}
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
            variant={variant === 'destructive' ? 'destructive' : 'default'}
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
