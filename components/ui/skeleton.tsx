"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("rounded-lg bg-navy-700/50 animate-pulse", className)}
      {...props}
    />
  );
}
Skeleton.displayName = "Skeleton";

export { Skeleton };
