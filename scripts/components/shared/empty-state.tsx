"use client";

import { motion } from "framer-motion";
import { cn } from "@/lib/utils/cn";

interface EmptyStateProps {
  icon: React.ElementType;
  title: string;
  description: string;
  action?: React.ReactNode;
  className?: string;
  variant?: "default" | "minimal";
}

export function EmptyState({
  icon: Icon,
  title,
  description,
  action,
  className,
  variant = "default",
}: EmptyStateProps) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className={cn(
        "flex flex-col items-center justify-center py-16 px-4 text-center",
        className
      )}
    >
      <div
        className={cn(
          "relative mb-5 flex items-center justify-center",
          variant === "default"
            ? "h-20 w-20 rounded-2xl bg-brand-50 ring-1 ring-brand-100 dark:bg-brand-900/30 dark:ring-brand-800"
            : "h-16 w-16 rounded-xl bg-bg-tertiary border border-border"
        )}
      >
        <Icon
          className={cn(
            "relative h-9 w-9",
            variant === "default" ? "text-brand-600 dark:text-brand-400" : "h-7 w-7 text-muted"
          )}
        />
      </div>
      <h3 className="font-display text-lg font-semibold text-heading mb-1">
        {title}
      </h3>
      <p className="text-sm text-muted max-w-sm mb-6 leading-relaxed">
        {description}
      </p>
      {action}
    </motion.div>
  );
}
