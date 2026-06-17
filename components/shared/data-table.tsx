"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Search,
} from "lucide-react";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";

export interface Column<T> {
  key: string;
  header: string;
  sortable?: boolean;
  className?: string;
  render?: (row: T) => React.ReactNode;
}

interface DataTableProps<T extends Record<string, unknown>> {
  columns: Column<T>[];
  data: T[];
  searchable?: boolean;
  searchPlaceholder?: string;
  searchKeys?: string[];
  exportable?: boolean;
  onExport?: () => void;
  emptyTitle?: string;
  emptyDescription?: string;
  emptyAction?: React.ReactNode;
  loading?: boolean;
  onRowClick?: (row: T) => void;
  mobileColumns?: string[];
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = "Search...",
  searchKeys = [],
  exportable = false,
  onExport,
  emptyTitle = "No data found",
  emptyDescription = "There are no records to display.",
  emptyAction,
  loading = false,
  onRowClick,
  mobileColumns,
}: DataTableProps<T>) {
  const [search, setSearch] = useState("");
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<"asc" | "desc">("asc");

  const filtered = search
    ? data.filter((row) =>
        searchKeys.some((key) => {
          const value = row[key];
          return String(value).toLowerCase().includes(search.toLowerCase());
        })
      )
    : data;

  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const aVal = a[sortKey] as any;
        const bVal = b[sortKey] as any;
        if (aVal < bVal) return sortDir === "asc" ? -1 : 1;
        if (aVal > bVal) return sortDir === "asc" ? 1 : -1;
        return 0;
      })
    : filtered;

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir("asc");
    }
  }

  const mobileColumnKeys = mobileColumns ?? columns.slice(0, 2).map((c) => c.key);
  const mobileCols = columns.filter((c) => mobileColumnKeys.includes(c.key));
  const mobileTitleCol = mobileCols[0];
  const mobileDetailCols = mobileCols.slice(1);

  if (loading) {
    return (
      <div className="space-y-2.5">
        {Array.from({ length: 5 }).map((_, i) => (
          <Skeleton key={i} className="h-14 rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {(searchable || exportable) && (
        <div className="flex items-center gap-3 mb-4">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-10"
              />
            </div>
          )}
          {exportable && (
            <Button variant="outline" size="sm" onClick={onExport}>
              <Download className="w-4 h-4 mr-2" />
              Export CSV
            </Button>
          )}
        </div>
      )}

      {/* Desktop Table */}
      <div className="hidden md:block rounded-xl border border-border bg-card shadow-card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-bg-tertiary border-b border-border">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      "px-4 h-11 text-left text-[11px] font-semibold uppercase tracking-wider text-muted",
                      col.sortable && "cursor-pointer hover:text-heading transition-colors",
                      col.className
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="text-muted">
                          {sortKey === col.key ? (
                            sortDir === "asc" ? (
                              <ChevronUp className="w-3 h-3" />
                            ) : (
                              <ChevronDown className="w-3 h-3" />
                            )
                          ) : (
                            <ChevronsUpDown className="w-3 h-3" />
                          )}
                        </span>
                      )}
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sorted.length === 0 ? (
                <tr>
                  <td colSpan={columns.length} className="px-4 py-16 text-center">
                    <p className="text-muted font-medium">{emptyTitle}</p>
                    <p className="text-muted text-sm mt-1">
                      {emptyDescription}
                    </p>
                    {emptyAction && <div className="mt-4">{emptyAction}</div>}
                  </td>
                </tr>
              ) : (
                sorted.map((row, index) => (
                  <motion.tr
                    key={((row as Record<string, unknown>).id as string) ?? index}
                    initial={{ opacity: 0, y: 4 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      "border-b border-border last:border-0 transition-colors",
                      "hover:bg-card-hover",
                      onRowClick && "cursor-pointer"
                    )}
                  >
                    {columns.map((col) => (
                      <td key={col.key} className={cn("px-4 py-3.5 text-sm text-secondary", col.className)}>
                        {col.render ? col.render(row) : String(row[col.key] ?? "")}
                      </td>
                    ))}
                  </motion.tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden space-y-2.5">
        {sorted.length === 0 ? (
          <div className="rounded-xl border border-border bg-card px-4 py-12 text-center">
            <p className="text-muted font-medium">{emptyTitle}</p>
            <p className="text-muted text-sm mt-1">
              {emptyDescription}
            </p>
            {emptyAction && <div className="mt-4">{emptyAction}</div>}
          </div>
        ) : (
          sorted.map((row, index) => (
            <motion.div
              key={((row as Record<string, unknown>).id as string) ?? index}
              initial={{ opacity: 0, y: 4 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.2, delay: Math.min(index * 0.02, 0.3) }}
              onClick={() => onRowClick?.(row)}
              className={cn(
                "rounded-xl border border-border bg-card p-4 shadow-card transition-colors",
                "hover:border-border",
                onRowClick && "cursor-pointer active:scale-[0.99]"
              )}
            >
              <p className="text-sm font-semibold text-heading">
                {mobileTitleCol.render
                  ? mobileTitleCol.render(row)
                  : String(row[mobileTitleCol.key] ?? "")}
              </p>
              {mobileDetailCols.length > 0 && (
                <div className="mt-2.5 space-y-1.5 pt-2.5 border-t border-border">
                  {mobileDetailCols.map((col) => (
                    <div key={col.key} className="flex items-baseline gap-2 text-sm">
                      <span className="text-[11px] font-semibold uppercase tracking-wider text-muted shrink-0">
                        {col.header}
                      </span>
                      <span className="text-secondary">
                        {col.render ? col.render(row) : String(row[col.key] ?? "")}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </motion.div>
          ))
        )}
      </div>

      <p className="text-xs text-muted mt-3">
        Showing <span className="font-semibold text-heading">{sorted.length}</span> of{" "}
        <span className="font-semibold text-heading">{data.length}</span> records
      </p>
    </div>
  );
}
