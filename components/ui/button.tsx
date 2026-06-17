"use client";

import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils/cn";

const buttonVariants = cva(
  [
    "relative inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-lg text-sm font-semibold",
    "transition-colors duration-150",
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
    "disabled:pointer-events-none disabled:opacity-50",
    "[&_svg]:pointer-events-none [&_svg]:size-4 [&_svg]:shrink-0",
    "select-none cursor-pointer",
  ].join(" "),
  {
    variants: {
      variant: {
        default: [
          "bg-brand-600 text-white",
          "hover:bg-brand-700 active:bg-brand-800",
          "shadow-soft",
        ].join(" "),
        destructive: [
          "bg-danger-600 text-white",
          "hover:bg-danger-700",
        ].join(" "),
        success: [
          "bg-success-600 text-white",
          "hover:bg-success-700",
        ].join(" "),
        warning: [
          "bg-warning-600 text-white",
          "hover:bg-warning-700",
        ].join(" "),
        outline: [
          "border border-border bg-card text-heading",
          "hover:bg-card-hover hover:border-border-strong",
        ].join(" "),
        secondary: [
          "bg-bg-tertiary text-heading border border-border",
          "hover:bg-card-hover",
        ].join(" "),
        ghost: "text-heading hover:bg-card-hover",
        link: [
          "text-brand-600 underline-offset-4 hover:underline",
          "hover:text-brand-700",
        ].join(" "),
      },
      size: {
        default: "h-10 px-4 py-2",
        sm:      "h-9 rounded-md px-3 text-xs",
        lg:      "h-11 rounded-lg px-6 text-base",
        xl:      "h-12 rounded-xl px-8 text-base",
        icon:    "h-10 w-10",
        "icon-sm": "h-8 w-8",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant,
      size,
      asChild = false,
      loading = false,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }))}
        ref={ref}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {asChild ? (
          children
        ) : (
          <>
            {loading && <Loader2 className="animate-spin" />}
            {children}
          </>
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";

export { Button, buttonVariants };
