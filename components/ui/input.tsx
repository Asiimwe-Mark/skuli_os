"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

export interface InputProps
  extends React.InputHTMLAttributes<HTMLInputElement> {
  invalid?: boolean;
  inputSize?: "sm" | "md" | "lg";
}

const Input = React.forwardRef<HTMLInputElement, InputProps>(
  ({ className, type, invalid, inputSize = "md", ...props }, ref) => {
    const sizeCls =
      inputSize === "sm"
        ? "h-9 text-xs px-3"
        : inputSize === "lg"
        ? "h-12 text-base px-4"
        : "h-11 text-sm px-3.5";
    return (
      <input
        type={type}
        ref={ref}
        aria-invalid={invalid}
        className={cn(
          "flex w-full rounded-lg border bg-card text-heading shadow-soft",
          "border-border placeholder:text-disabled",
          "transition-colors duration-150",
          "hover:border-border-strong",
          "focus-visible:outline-none focus-visible:border-border focus-visible:ring-2 focus-visible:ring-brand-100",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "file:border-0 file:bg-transparent file:text-sm file:font-medium",
          sizeCls,
          invalid && "border-border focus-visible:border-border focus-visible:ring-danger-100",
          className
        )}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
