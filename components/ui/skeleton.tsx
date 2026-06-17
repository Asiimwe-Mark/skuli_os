"use client";

import * as React from "react";
import { cn } from "@/lib/utils/cn";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-md bg-bg-tertiary animate-pulse",
        className
      )}
      {...props}
    />
  );
}
Skeleton.displayName = "Skeleton";

export { Skeleton };
