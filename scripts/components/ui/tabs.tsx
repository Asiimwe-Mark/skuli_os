"use client";

import * as React from "react";
import * as TabsPrimitive from "@radix-ui/react-tabs";
import { cn } from "@/lib/utils/cn";

const Tabs = TabsPrimitive.Root;

const TabsList = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.List>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.List> & {
    variant?: "default" | "pills" | "underline";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.List
    ref={ref}
    className={cn(
      "inline-flex items-center text-muted",
      variant === "default" && "h-11 rounded-lg bg-bg-tertiary border border-border p-1",
      variant === "pills"    && "h-auto gap-1.5 p-0",
      variant === "underline" && "h-auto gap-4 border-b border-border p-0",
      className
    )}
    {...props}
  />
));
TabsList.displayName = TabsPrimitive.List.displayName;

const TabsTrigger = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Trigger>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger> & {
    variant?: "default" | "pills" | "underline";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <TabsPrimitive.Trigger
    ref={ref}
    className={cn(
      "inline-flex items-center justify-center whitespace-nowrap text-sm font-medium transition-colors",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--bg)]",
      "disabled:pointer-events-none disabled:opacity-50",
      variant === "default" && [
        "h-9 rounded-md px-3.5",
        "data-[state=active]:bg-card data-[state=active]:text-heading data-[state=active]:shadow-soft",
      ],
      variant === "pills" && [
        "h-9 rounded-full px-4 border border-border bg-card",
        "data-[state=active]:bg-brand-600 data-[state=active]:text-white data-[state=active]:border-transparent dark:data-[state=active]:bg-brand-500",
      ],
      variant === "underline" && [
        "h-10 rounded-none border-b-2 border-transparent px-1 pb-2 -mb-px",
        "data-[state=active]:border-border data-[state=active]:text-heading",
      ],
      className
    )}
    {...props}
  />
));
TabsTrigger.displayName = TabsPrimitive.Trigger.displayName;

const TabsContent = React.forwardRef<
  React.ElementRef<typeof TabsPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof TabsPrimitive.Content>
>(({ className, ...props }, ref) => (
  <TabsPrimitive.Content
    ref={ref}
    className={cn(
      "mt-4",
      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-border focus-visible:ring-offset-2",
      "animate-fade-in-up",
      className
    )}
    {...props}
  />
));
TabsContent.displayName = TabsPrimitive.Content.displayName;

export { Tabs, TabsList, TabsTrigger, TabsContent };
