"use client";

import { useEffect, useState, useRef } from "react";
import { motion } from "framer-motion";
import { TrendingUp, TrendingDown } from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";

type ColorKey = "brand" | "success" | "warning" | "danger" | "info" | "neutral";

interface StatCardProps {
  label: string;
  value: number;
  format?: "currency" | "number" | "percent";
  icon: React.ElementType;
  trend?: { value: number; positive: boolean };
  color?: ColorKey;
  delay?: number;
}

function useCountUp(end: number | null | undefined, duration: number = 1100) {
  const [value, setValue] = useState(0);
  const startTimeRef = useRef<number | null>(null);

  useEffect(() => {
    const safeEnd = Number.isFinite(end) ? (end as number) : 0;
    startTimeRef.current = null;
    setValue(0);
    function animate(timestamp: number) {
      if (!startTimeRef.current) startTimeRef.current = timestamp;
      const progress = Math.min((timestamp - startTimeRef.current) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setValue(Math.floor(eased * safeEnd));
      if (progress < 1) requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);
  }, [end, duration]);

  return value;
}

const COLOR_MAP: Record<ColorKey, { icon: string; ring: string; glow: string; value: string }> = {
  brand:   { icon: "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400",       ring: "ring-brand-100 dark:ring-brand-800",  glow: "from-brand-200/40",   value: "text-text-heading" },
  success: { icon: "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400", ring: "ring-success-100 dark:ring-success-800", glow: "from-success-200/40", value: "text-success-700" },
  warning: { icon: "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400", ring: "ring-warning-100 dark:ring-warning-800", glow: "from-warning-200/40", value: "text-warning-700" },
  danger:  { icon: "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400",     ring: "ring-danger-100 dark:ring-danger-800",  glow: "from-danger-200/40",  value: "text-danger-700" },
  info:    { icon: "bg-info-50 text-info-700 dark:bg-info-900/30 dark:text-info-400",            ring: "ring-info-100 dark:ring-info-800",    glow: "from-info-200/40",    value: "text-info-700" },
  neutral: { icon: "bg-bg-tertiary text-muted",                                                 ring: "ring-border",                          glow: "from-border",         value: "text-text-heading" },
};

export function StatCard({
  label,
  value,
  format = "number",
  icon: Icon,
  trend,
  color = "brand",
  delay = 0,
}: StatCardProps) {
  const animatedValue = useCountUp(value);
  const c = COLOR_MAP[color];

  const formattedValue =
    format === "currency"
      ? formatUGX(animatedValue)
      : format === "percent"
      ? `${Number.isFinite(animatedValue) ? animatedValue : 0}%`
      : (Number.isFinite(animatedValue) ? animatedValue : 0).toLocaleString();

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}
      whileHover={{ y: -2 }}
      className="group relative overflow-hidden rounded-xl border border-border bg-card p-5 shadow-card transition-shadow duration-200 hover:shadow-pop"
    >
      {/* Subtle brand glow that reveals on hover */}
      <div
        className={cn(
          "pointer-events-none absolute -top-12 -right-12 h-32 w-32 rounded-full bg-gradient-to-br to-transparent opacity-0 blur-2xl transition-opacity duration-500 group-hover:opacity-100",
          c.glow
        )}
      />

      <div className="relative flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wider text-muted">
            {label}
          </p>
          <p className={cn("mt-1.5 text-numeric text-2xl font-bold", c.value)}>
            {formattedValue}
          </p>
          {trend && (
            <div
              className={cn(
                "mt-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                trend.positive
                  ? "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400"
                  : "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400"
              )}
            >
              {trend.positive ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
              {Math.abs(trend.value)}% vs last term
            </div>
          )}
        </div>
        <div
          className={cn(
            "flex h-11 w-11 shrink-0 items-center justify-center rounded-lg ring-1",
            c.icon,
            c.ring
          )}
        >
          <Icon className="h-5 w-5" />
        </div>
      </div>
    </motion.div>
  );
}
