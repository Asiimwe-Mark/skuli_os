"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { formatUGX } from "@/lib/utils/currency";
import { formatDateTime, formatDate } from "@/lib/utils/dates";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/shared/empty-state";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Inbox,
  XCircle,
  Send,
  DollarSign,
  TrendingUp,
} from "lucide-react";
import type { SmsLog } from "@/types";

interface AnnouncementLog {
  id: string;
  title: string;
  body: string;
  audience_type: string;
  status: string;
  scheduled_at: string | null;
  scheduled_status: string | null;
  created_at: string;
  sent_at: string | null;
  total_recipients: number;
  delivered_count: number;
  failed_count: number;
  cost: number | null;
}

const STATUS_VARIANT: Record<string, "warning" | "default" | "success" | "destructive"> = {
  pending: "warning",
  sent: "default",
  delivered: "success",
  failed: "destructive",
};

function getAnnouncementBadge(a: AnnouncementLog) {
  if (a.scheduled_at && a.scheduled_status === "pending") {
    return (
      <Badge variant="outline" className="border-border text-warning-600 bg-warning-50">
        Scheduled * {formatDate(a.scheduled_at)}
      </Badge>
    );
  }
  if (a.scheduled_at && a.scheduled_status === "sent") {
    return (
      <Badge className="bg-success-100 text-success-700">
        Sent (Scheduled)
      </Badge>
    );
  }
  if (a.scheduled_at && a.scheduled_status === "failed") {
    return <Badge variant="destructive">Schedule Failed</Badge>;
  }
  if (a.scheduled_at && a.scheduled_status === "cancelled") {
    return <Badge variant="outline" className="text-muted">Cancelled</Badge>;
  }
  return <Badge className="bg-success-100 text-success-700">Sent</Badge>;
}

export default function SmsLogsPage() {
  const { school } = useSchoolStore();
  const supabase = useSupabaseBrowser();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["sms-logs", school?.id, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("announcements")
        .select("id, school_id, title, body, target_audience, scheduled_status, sms_cost, created_at, sent_by")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("scheduled_status", statusFilter);
      if (dateFrom) q = q.gte("created_at", dateFrom);
      if (dateTo) q = q.lte("created_at", dateTo + "T23:59:59");
      const { data, error } = await q;
      if (error) throw error;
      return (data || []) as unknown as AnnouncementLog[];
    },
    enabled: !!school?.id,
  });

  const totalCost = logs.reduce((s, l) => s + (l.cost || 0), 0);
  const deliveredCount = logs.filter((l) => l.status === "delivered").length;
  const failedCount = logs.filter((l) => l.status === "failed").length;
  const deliveryRate = logs.length > 0 ? Math.round((deliveredCount / logs.length) * 100) : 0;

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold font-display">SMS Logs</h1>
        <p className="text-muted text-sm mt-1">Track all SMS messages sent from your school</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sent", value: String(logs.length), icon: Send, color: "text-text-heading", iconColor: "text-brand-700", bg: "bg-brand-100" },
          { label: "Delivery Rate", value: `${deliveryRate}%`, icon: TrendingUp, color: "text-success-700", iconColor: "text-success-700", bg: "bg-success-100" },
          { label: "Failed", value: String(failedCount), icon: XCircle, color: "text-danger-700", iconColor: "text-danger-700", bg: "bg-danger-100" },
          { label: "Total Cost", value: formatUGX(totalCost), icon: DollarSign, color: "text-warning-700", iconColor: "text-warning-700", bg: "bg-warning-100" },
        ].map((s) => (
          <Card key={s.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.bg, s.iconColor)}>
                <s.icon className="w-5 h-5" />
              </div>
              <div>
                <p className="text-xs text-text-muted">{s.label}</p>
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="bg-card">
        <CardContent className="p-4">
          <div className="flex flex-col sm:flex-row sm:items-end gap-4">
            <div className="space-y-1 flex-1">
              <Label className="text-xs">Status</Label>
              <div className="flex flex-wrap gap-2">
                {["all", "pending", "sent", "delivered", "failed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm transition-all",
                      statusFilter === s
                        ? "bg-warning-100 text-warning-700 border border-warning-500"
                        : "bg-bg-tertiary text-text-muted hover:text-text-heading border border-transparent"
                    )}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <div className="space-y-1 flex-1 sm:flex-none">
                <Label className="text-xs">From</Label>
                <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-full sm:w-40" />
              </div>
              <div className="space-y-1 flex-1 sm:flex-none">
                <Label className="text-xs">To</Label>
                <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-full sm:w-40" />
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={Inbox} title="No communication logs" description="Communication logs from your school will appear here." />
      ) : (
        <Card className="bg-card">
          <CardContent className="p-0">
            {/* Desktop Table */}
            <div className="hidden md:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Title</TableHead>
                    <TableHead>Message</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Recipients</TableHead>
                    <TableHead>Timestamp</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map((log) => (
                    <TableRow key={log.id}>
                      <TableCell className="font-medium text-sm">{log.title}</TableCell>
                      <TableCell className="max-w-[300px]">
                        <p className="text-sm truncate">{log.body}</p>
                        <Badge variant="outline" className="text-[10px] mt-1 capitalize">{log.audience_type}</Badge>
                      </TableCell>
                      <TableCell>{getAnnouncementBadge(log)}</TableCell>
                      <TableCell className="text-sm">
                        {log.total_recipients ?? "--"}
                        {log.delivered_count !== undefined && log.failed_count !== undefined && (
                          <span className="text-xs text-muted ml-1">
                            ({log.delivered_count} delivered, {log.failed_count} failed)
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-heading">
                        {log.scheduled_at ? `Scheduled: ${formatDate(log.scheduled_at)}` : (log.sent_at ? formatDateTime(log.sent_at) : formatDateTime(log.created_at))}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* Mobile Cards */}
            <div className="md:hidden divide-y divide-border/50">
              {logs.map((log) => (
                <div key={log.id} className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-sm font-medium truncate flex-1 mr-2">{log.title}</p>
                    {getAnnouncementBadge(log)}
                  </div>
                  <p className="text-xs text-heading line-clamp-2 mb-2">{log.body}</p>
                  <div className="flex items-center justify-between text-xs text-heading">
                    <div className="flex items-center gap-2">
                      <Badge variant="outline" className="text-[10px] capitalize">{log.audience_type}</Badge>
                      <span>{log.total_recipients ?? "--"} recipients</span>
                    </div>
                    <span>{log.scheduled_at ? formatDate(log.scheduled_at) : (log.sent_at ? formatDateTime(log.sent_at) : formatDateTime(log.created_at))}</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
