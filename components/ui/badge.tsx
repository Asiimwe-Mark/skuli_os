"use client";

import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const badgeVariants = cva(
  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[11px] font-semibold tracking-wide transition-colors whitespace-nowrap border border-transparent",
  {
    variants: {
      variant: {
        default: "bg-bg-tertiary text-heading",
        secondary: "bg-bg-tertiary text-heading border-border",
        outline: "border-border-strong text-heading bg-transparent",
        success: "bg-success-50 text-success-700 border-success-100 dark:bg-success-900/30 dark:text-success-400 dark:border-success-700",
        warning: "bg-warning-50 text-warning-700 border-warning-100 dark:bg-warning-900/30 dark:text-warning-400 dark:border-warning-700",
        destructive: "bg-danger-50 text-danger-700 border-danger-100 dark:bg-danger-900/30 dark:text-danger-400 dark:border-danger-700",
        info: "bg-info-50 text-info-700 border-info-100 dark:bg-info-900/30 dark:text-info-400 dark:border-info-700",
        brand: "bg-brand-50 text-brand-700 border-brand-100 dark:bg-brand-900/30 dark:text-brand-400 dark:border-brand-700",
        muted: "bg-bg-tertiary text-muted border-border",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLSpanElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <span className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
