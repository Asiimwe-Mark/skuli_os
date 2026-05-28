"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Calendar,
  Clock,
  Loader2,
  Plus,
  Ban,
  CheckCircle2,
  XCircle,
  UserCheck,
} from "lucide-react";
import type { Staff, MeetingSlot } from "@/types";

export default function MeetingsPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = createClient();
  const queryClient = useQueryClient();

  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>(
    new Date().toISOString().split("T")[0]
  );
  const [generateDialogOpen, setGenerateDialogOpen] = useState(false);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("12:00");
  const [duration, setDuration] = useState(15);

  const { data: staffList = [] } = useQuery<Staff[]>({
    queryKey: ["staff", school?.id],
    queryFn: async () => {
      const { data } = await supabase
        .from("staff")
        .select("id, full_name, role_title, is_active")
        .eq("school_id", school!.id)
        .eq("is_active", true)
        .order("full_name");
      return data ?? [];
    },
    enabled: !!school?.id,
  });

  const { data: slots = [], isLoading: slotsLoading } = useQuery<MeetingSlot[]>({
    queryKey: ["meeting-slots", selectedTeacherId, selectedDate],
    queryFn: async () => {
      const res = await fetch(
        `/api/meetings/slots?teacher_id=${selectedTeacherId}&date=${selectedDate}`
      );
      return res.json();
    },
    enabled: !!selectedTeacherId && !!selectedDate,
  });

  const generateSlots = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/meetings/slots", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          teacher_id: selectedTeacherId,
          slot_date: selectedDate,
          start_time: startTime,
          end_time: endTime,
          duration_minutes: duration,
        }),
      });
      if (!res.ok) throw new Error("Failed to generate slots");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-slots"] });
      setGenerateDialogOpen(false);
      toast({ title: "Slots generated successfully" });
    },
    onError: () => {
      toast({ title: "Failed to generate slots", variant: "destructive" });
    },
  });

  const toggleSlotBlock = useMutation({
    mutationFn: async ({ id, is_deleted }: { id: string; is_deleted: boolean }) => {
      const res = await fetch(`/api/meetings/slots/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_deleted }),
      });
      if (!res.ok) throw new Error("Failed to update slot");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-slots"] });
      toast({ title: "Slot updated" });
    },
  });

  const cancelBooking = useMutation({
    mutationFn: async (bookingId: string) => {
      const res = await fetch(`/api/meetings/bookings/${bookingId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "cancelled" }),
      });
      if (!res.ok) throw new Error("Failed to cancel booking");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["meeting-slots"] });
      toast({ title: "Booking cancelled" });
    },
  });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Meeting Scheduler</h1>
          <p className="text-sm text-gray-500">{school?.name}</p>
        </div>
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="flex-1 min-w-[200px]">
              <Label>Teacher</Label>
              <select
                value={selectedTeacherId}
                onChange={(e) => setSelectedTeacherId(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm"
              >
                <option value="">Select teacher...</option>
                {staffList.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {s.role_title}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <Label>Date</Label>
              <Input
                type="date"
                value={selectedDate}
                onChange={(e) => setSelectedDate(e.target.value)}
                className="mt-1"
              />
            </div>
            <Button
              onClick={() => setGenerateDialogOpen(true)}
              disabled={!selectedTeacherId}
            >
              <Plus className="h-4 w-4 mr-2" />
              Generate Slots
            </Button>
          </div>
        </CardContent>
      </Card>

      {selectedTeacherId && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Slots for {selectedDate}</CardTitle>
          </CardHeader>
          <CardContent>
            {slotsLoading ? (
              <div className="space-y-2">
                {[1, 2, 3].map((i) => (
                  <Skeleton key={i} className="h-12 w-full" />
                ))}
              </div>
            ) : slots.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <Calendar className="mx-auto h-10 w-10 text-gray-300" />
                <p className="mt-2 text-sm">No slots generated for this date</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-gray-200 text-left text-xs font-medium text-gray-500">
                      <th className="pb-2">Time</th>
                      <th className="pb-2">Duration</th>
                      <th className="pb-2">Status</th>
                      <th className="pb-2">Student</th>
                      <th className="pb-2 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-50">
                    {slots.map((slot) => {
                      const booking = Array.isArray(slot.booking) ? slot.booking[0] : slot.booking;
                      return (
                        <tr key={slot.id}>
                          <td className="py-3 font-medium">
                            {slot.start_time} — {slot.end_time}
                          </td>
                          <td className="py-3 text-gray-500">
                            {slot.duration_minutes} min
                          </td>
                          <td className="py-3">
                            <Badge
                              variant={slot.is_deleted ? "destructive" : booking ? "default" : "secondary"}
                            >
                              {slot.is_deleted ? "Blocked" : booking ? "Booked" : "Available"}
                            </Badge>
                          </td>
                          <td className="py-3 text-gray-600">
                            {booking?.student?.full_name ?? "—"}
                          </td>
                          <td className="py-3 text-right">
                            {slot.is_deleted ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleSlotBlock.mutate({ id: slot.id, is_deleted: false })}
                              >
                                <CheckCircle2 className="h-4 w-4 mr-1" />
                                Unblock
                              </Button>
                            ) : booking ? (
                              <Button
                                size="sm"
                                variant="ghost"
                                className="text-red-600"
                                onClick={() => cancelBooking.mutate(booking.id)}
                              >
                                <XCircle className="h-4 w-4 mr-1" />
                                Cancel Booking
                              </Button>
                            ) : (
                              <Button
                                size="sm"
                                variant="ghost"
                                onClick={() => toggleSlotBlock.mutate({ id: slot.id, is_deleted: true })}
                              >
                                <Ban className="h-4 w-4 mr-1" />
                                Block
                              </Button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      <Dialog open={generateDialogOpen} onOpenChange={setGenerateDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Generate Meeting Slots</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Start Time</Label>
              <Input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
              />
            </div>
            <div>
              <Label>End Time</Label>
              <Input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
              />
            </div>
            <div>
              <Label>Duration (minutes)</Label>
              <Input
                type="number"
                value={duration}
                onChange={(e) => setDuration(Number(e.target.value))}
                min={5}
                max={120}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setGenerateDialogOpen(false)}>
              Cancel
            </Button>
            <Button onClick={() => generateSlots.mutate()} disabled={generateSlots.isPending}>
              {generateSlots.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              Generate
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
