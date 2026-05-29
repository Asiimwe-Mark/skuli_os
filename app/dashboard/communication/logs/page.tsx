"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useQuery } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
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
      <Badge variant="outline" className="border-amber-500 text-amber-600 bg-amber-50">
        Scheduled · {formatDate(a.scheduled_at)}
      </Badge>
    );
  }
  if (a.scheduled_at && a.scheduled_status === "sent") {
    return (
      <Badge className="bg-emerald-100 text-emerald-700">
        Sent (Scheduled)
      </Badge>
    );
  }
  if (a.scheduled_at && a.scheduled_status === "failed") {
    return <Badge variant="destructive">Schedule Failed</Badge>;
  }
  if (a.scheduled_at && a.scheduled_status === "cancelled") {
    return <Badge variant="outline" className="text-muted-foreground">Cancelled</Badge>;
  }
  return <Badge className="bg-emerald-100 text-emerald-700">Sent</Badge>;
}

export default function SmsLogsPage() {
  const { school } = useSchoolStore();
  const supabase = createClient();
  const [statusFilter, setStatusFilter] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");

  const { data: logs = [], isLoading } = useQuery({
    queryKey: ["sms-logs", school?.id, statusFilter, dateFrom, dateTo],
    queryFn: async () => {
      let q = supabase
        .from("announcements")
        .select("*")
        .eq("school_id", school!.id)
        .order("created_at", { ascending: false })
        .limit(200);
      if (statusFilter !== "all") q = q.eq("status", statusFilter);
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
        <p className="text-muted-foreground text-sm mt-1">Track all SMS messages sent from your school</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Sent", value: String(logs.length), icon: Send, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Delivery Rate", value: `${deliveryRate}%`, icon: TrendingUp, color: "text-emerald-400", bg: "bg-emerald-500/10" },
          { label: "Failed", value: String(failedCount), icon: XCircle, color: "text-rose-400", bg: "bg-rose-500/10" },
          { label: "Total Cost", value: formatUGX(totalCost), icon: DollarSign, color: "text-amber-400", bg: "bg-amber-400/10" },
        ].map((s) => (
          <Card key={s.label} className="border-border-subtle bg-surface">
            <CardContent className="p-4 flex items-center gap-3">
              <div className={cn("w-10 h-10 rounded-lg flex items-center justify-center", s.bg)}>
                <s.icon className={cn("w-5 h-5", s.color)} />
              </div>
              <div>
                <p className="text-xs text-foreground/60">{s.label}</p>
                <p className={cn("text-xl font-bold", s.color)}>{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="border-border-subtle bg-surface">
        <CardContent className="p-4">
          <div className="flex items-end gap-4 flex-wrap">
            <div className="space-y-1">
              <Label className="text-xs">Status</Label>
              <div className="flex gap-2">
                {["all", "pending", "sent", "delivered", "failed"].map((s) => (
                  <button
                    key={s}
                    onClick={() => setStatusFilter(s)}
                    className={cn(
                      "px-3 py-1.5 rounded-lg text-sm transition-all",
                      statusFilter === s
                        ? "bg-amber-400/10 text-amber-400 border border-amber-400/20"
                        : "bg-navy-700/50 text-foreground/60 hover:text-foreground border border-transparent"
                    )}
                  >
                    {s.charAt(0).toUpperCase() + s.slice(1)}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-1">
              <Label className="text-xs">From</Label>
              <Input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} className="w-40" />
            </div>
            <div className="space-y-1">
              <Label className="text-xs">To</Label>
              <Input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} className="w-40" />
            </div>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="space-y-2">{[...Array(8)].map((_, i) => <Skeleton key={i} className="h-14 rounded-lg" />)}</div>
      ) : logs.length === 0 ? (
        <EmptyState icon={Inbox} title="No communication logs" description="Communication logs from your school will appear here." />
      ) : (
        <Card className="border-border-subtle bg-surface">
          <CardContent className="p-0">
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
                        <span className="text-xs text-muted-foreground ml-1">
                          ({log.delivered_count} delivered, {log.failed_count} failed)
                        </span>
                      )}
                    </TableCell>
                    <TableCell className="text-sm text-foreground/60">
                      {log.scheduled_at ? `Scheduled: ${formatDate(log.scheduled_at)}` : (log.sent_at ? formatDateTime(log.sent_at) : formatDateTime(log.created_at))}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}
    </motion.div>
  );
}
