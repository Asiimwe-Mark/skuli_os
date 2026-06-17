"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface TextareaProps
  extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  invalid?: boolean;
}

const Textarea = React.forwardRef<HTMLTextAreaElement, TextareaProps>(
  ({ className, invalid, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "flex min-h-[88px] w-full rounded-lg border bg-card px-3.5 py-2.5 text-sm text-heading shadow-soft transition-colors",
          "border-border placeholder:text-disabled",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-brand-100",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "resize-y",
          invalid && "border-border focus-visible:border-border focus-visible:ring-danger-100",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
