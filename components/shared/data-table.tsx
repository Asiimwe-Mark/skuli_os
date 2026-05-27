'use client';

import { useState } from 'react';
import {
  ChevronDown,
  ChevronUp,
  ChevronsUpDown,
  Download,
  Search,
} from 'lucide-react';
import { cn } from '@/lib/utils/cn';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

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
}

export function DataTable<T extends Record<string, unknown>>({
  columns,
  data,
  searchable = false,
  searchPlaceholder = 'Search...',
  searchKeys = [],
  exportable = false,
  onExport,
  emptyTitle = 'No data found',
  emptyDescription = 'There are no records to display.',
  emptyAction,
  loading = false,
  onRowClick,
}: DataTableProps<T>) {
  const [search, setSearch] = useState('');
  const [sortKey, setSortKey] = useState<string | null>(null);
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('asc');

  // Filter
  const filtered = search
    ? data.filter((row) =>
        searchKeys.some((key) => {
          const value = row[key];
          return String(value).toLowerCase().includes(search.toLowerCase());
        })
      )
    : data;

  // Sort
  const sorted = sortKey
    ? [...filtered].sort((a, b) => {
        const aVal = a[sortKey] as any;
        const bVal = b[sortKey] as any;
        if (aVal < bVal) return sortDir === 'asc' ? -1 : 1;
        if (aVal > bVal) return sortDir === 'asc' ? 1 : -1;
        return 0;
      })
    : filtered;

  function handleSort(key: string) {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  if (loading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="h-12 skeleton rounded-lg" />
        ))}
      </div>
    );
  }

  return (
    <div>
      {/* Toolbar */}
      {(searchable || exportable) && (
        <div className="flex items-center gap-3 mb-4">
          {searchable && (
            <div className="relative flex-1 max-w-sm">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={searchPlaceholder}
                className="pl-9"
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

      {/* Table */}
      <div className="rounded-xl border border-navy-700 overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="bg-navy-800 border-b border-navy-700">
                {columns.map((col) => (
                  <th
                    key={col.key}
                    className={cn(
                      'px-4 py-3 text-left text-xs font-medium text-gray-400 uppercase tracking-wider',
                      col.sortable && 'cursor-pointer hover:text-foreground',
                      col.className
                    )}
                    onClick={() => col.sortable && handleSort(col.key)}
                  >
                    <div className="flex items-center gap-1">
                      {col.header}
                      {col.sortable && (
                        <span className="text-gray-600">
                          {sortKey === col.key ? (
                            sortDir === 'asc' ? (
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
            <tbody className="divide-y divide-navy-700/50">
              {sorted.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length}
                    className="px-4 py-12 text-center"
                  >
                    <p className="text-gray-400 font-medium">{emptyTitle}</p>
                    <p className="text-gray-500 text-sm mt-1">
                      {emptyDescription}
                    </p>
                    {emptyAction && <div className="mt-4">{emptyAction}</div>}
                  </td>
                </tr>
              ) : (
                sorted.map((row, index) => (
                  <tr
                    key={index}
                    onClick={() => onRowClick?.(row)}
                    className={cn(
                      'bg-navy-900 hover:bg-navy-800/50 transition-colors',
                      onRowClick && 'cursor-pointer'
                    )}
                  >
                    {columns.map((col) => (
                      <td
                        key={col.key}
                        className={cn(
                          'px-4 py-3 text-sm',
                          col.className
                        )}
                      >
                        {col.render
                          ? col.render(row)
                          : String(row[col.key] ?? '')}
                      </td>
                    ))}
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Count */}
      <p className="text-xs text-gray-500 mt-2">
        Showing {sorted.length} of {data.length} records
      </p>
    </div>
  );
}
