"use client";

import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { createBrowserClient } from "@/lib/supabase/client";
import { cn } from "@/lib/utils/cn";
import { formatDate } from "@/lib/utils/dates";
import {
  Calendar,
  Clock,
  Loader2,
  ChevronDown,
  CheckCircle2,
  XCircle,
  UserCheck,
} from "lucide-react";

interface PortalStudent {
  id: string;
  full_name: string;
  admission_number: string | null;
  class: { id: string; name: string } | null;
  school: { id: string; name: string } | null;
}

interface Teacher {
  id: string;
  full_name: string;
  role_title: string;
}

interface Slot {
  id: string;
  slot_date: string;
  start_time: string;
  end_time: string;
  duration_minutes: number;
}

interface Booking {
  id: string;
  slot_id: string;
  parent_name: string;
  parent_phone: string;
  notes: string | null;
  status: string;
  created_at: string;
  slot: {
    slot_date: string;
    start_time: string;
    end_time: string;
    teacher: { full_name: string } | null;
  } | null;
  student: { full_name: string } | null;
}

export default function PortalMeetingsPage() {
  const supabase = createBrowserClient();
  const [loading, setLoading] = useState(true);
  const [linkedStudents, setLinkedStudents] = useState<PortalStudent[]>([]);
  const [selectedStudentId, setSelectedStudentId] = useState<string>("");
  const [teachers, setTeachers] = useState<Teacher[]>([]);
  const [selectedTeacherId, setSelectedTeacherId] = useState<string>("");
  const [selectedDate, setSelectedDate] = useState<string>("");
  const [availableSlots, setAvailableSlots] = useState<Slot[]>([]);
  const [selectedSlotId, setSelectedSlotId] = useState<string>("");
  const [parentName, setParentName] = useState("");
  const [parentPhone, setParentPhone] = useState("");
  const [notes, setNotes] = useState("");
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [success, setSuccess] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadStudents() {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;

      const { data } = await supabase
        .from("students")
        .select("id, full_name, admission_number, class:classes(id, name), school:schools(id, name)")
        .eq("parent_id", user.id);

      if (data && data.length > 0) {
        const mapped = data.map((s: Record<string, unknown>) => ({
          id: s.id as string,
          full_name: s.full_name as string,
          admission_number: s.admission_number as string | null,
          class: s.class as { id: string; name: string } | null,
          school: s.school as { id: string; name: string } | null,
        }));
        setLinkedStudents(mapped);
        setSelectedStudentId(mapped[0].id);
      }
      setLoading(false);
    }
    loadStudents();
  }, [supabase]);

  useEffect(() => {
    if (!selectedStudentId) return;
    async function loadTeachers() {
      const res = await fetch(`/api/portal/meetings/teachers?student_id=${selectedStudentId}`);
      const data = await res.json();
      setTeachers(data);
      if (data.length > 0) setSelectedTeacherId(data[0].id);
      else setSelectedTeacherId("");
    }
    loadTeachers();
  }, [selectedStudentId]);

  useEffect(() => {
    if (!selectedTeacherId) return;
    async function loadDates() {
      setSelectedDate(new Date().toISOString().split("T")[0]);
    }
    loadDates();
  }, [selectedTeacherId]);

  useEffect(() => {
    if (!selectedTeacherId || !selectedDate) return;
    async function loadSlots() {
      const res = await fetch(
        `/api/portal/meetings/slots?teacher_id=${selectedTeacherId}&date=${selectedDate}`
      );
      const data = await res.json();
      setAvailableSlots(data);
      setSelectedSlotId("");
    }
    loadSlots();
  }, [selectedTeacherId, selectedDate]);

  useEffect(() => {
    if (!selectedStudentId) return;
    async function loadBookings() {
      const res = await fetch(`/api/portal/meetings?student_id=${selectedStudentId}`);
      const data = await res.json();
      setBookings(data);
    }
    loadBookings();
  }, [selectedStudentId]);

  async function handleBook() {
    if (!selectedSlotId || !parentName || !parentPhone) return;
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const res = await fetch("/api/portal/meetings/book", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          slot_id: selectedSlotId,
          student_id: selectedStudentId,
          parent_name: parentName,
          parent_phone: parentPhone,
          notes,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to book");
      }

      const slot = availableSlots.find((s) => s.id === selectedSlotId);
      const teacher = teachers.find((t) => t.id === selectedTeacherId);
      setSuccess(
        `Your meeting is booked for ${slot?.slot_date} at ${slot?.start_time} with ${teacher?.full_name}. You will receive an SMS reminder.`
      );

      setSelectedSlotId("");
      setNotes("");

      const bookingsRes = await fetch(`/api/portal/meetings?student_id=${selectedStudentId}`);
      setBookings(await bookingsRes.json());
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to book");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleCancel(bookingId: string) {
    try {
      const res = await fetch(`/api/portal/meetings/${bookingId}`, { method: "PATCH" });
      if (!res.ok) throw new Error("Failed to cancel");

      const bookingsRes = await fetch(`/api/portal/meetings?student_id=${selectedStudentId}`);
      setBookings(await bookingsRes.json());

      if (selectedTeacherId && selectedDate) {
        const slotsRes = await fetch(
          `/api/portal/meetings/slots?teacher_id=${selectedTeacherId}&date=${selectedDate}`
        );
        setAvailableSlots(await slotsRes.json());
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to cancel");
    }
  }

  if (loading) {
    return (
      <div className="mx-auto max-w-lg space-y-4 p-4">
        <div className="h-10 animate-pulse rounded-lg bg-gray-100" />
        <div className="h-60 animate-pulse rounded-xl bg-gray-100" />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg p-4">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        className="space-y-4"
      >
        {linkedStudents.length > 1 && (
          <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
            <div className="mb-3 flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber/10">
                <UserCheck className="h-5 w-5 text-amber" />
              </div>
              <h2 className="text-sm font-semibold text-gray-900">Select Child</h2>
            </div>
            <div className="relative">
              <select
                value={selectedStudentId}
                onChange={(e) => setSelectedStudentId(e.target.value)}
                className="w-full appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 pr-10 text-sm font-medium text-gray-700"
              >
                {linkedStudents.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.full_name} — {s.class?.name ?? "N/A"}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-400" />
            </div>
          </div>
        )}

        <h1 className="text-lg font-bold text-gray-900">Book a Parent-Teacher Meeting</h1>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm space-y-4">
          <div>
            <label className="text-sm font-medium text-gray-700">Teacher</label>
            <select
              value={selectedTeacherId}
              onChange={(e) => setSelectedTeacherId(e.target.value)}
              className="w-full mt-1 appearance-none rounded-lg border border-gray-300 bg-white px-4 py-3 text-sm"
            >
              <option value="">Select teacher...</option>
              {teachers.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.full_name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-sm font-medium text-gray-700">Date</label>
            <input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
            />
          </div>

          {availableSlots.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700">Available Times</label>
              <div className="mt-2 grid grid-cols-3 gap-2">
                {availableSlots.map((slot) => (
                  <button
                    key={slot.id}
                    onClick={() => setSelectedSlotId(slot.id)}
                    className={cn(
                      "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                      selectedSlotId === slot.id
                        ? "border-amber bg-amber/10 text-amber"
                        : "border-gray-200 hover:border-amber/20 hover:bg-amber/10/30"
                    )}
                  >
                    {slot.start_time}
                  </button>
                ))}
              </div>
            </div>
          )}

          {availableSlots.length === 0 && selectedTeacherId && selectedDate && (
            <p className="text-sm text-gray-500">No available slots for this date</p>
          )}

          <div>
            <label className="text-sm font-medium text-gray-700">Notes (optional)</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
              placeholder="What would you like to discuss?"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Your Name</label>
              <input
                type="text"
                value={parentName}
                onChange={(e) => setParentName(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700">Phone</label>
              <input
                type="tel"
                value={parentPhone}
                onChange={(e) => setParentPhone(e.target.value)}
                className="w-full mt-1 rounded-lg border border-gray-300 px-4 py-3 text-sm"
              />
            </div>
          </div>

          <button
            onClick={handleBook}
            disabled={!selectedSlotId || !parentName || !parentPhone || submitting}
            className="w-full rounded-lg bg-amber px-4 py-3 text-sm font-medium text-white hover:bg-amber/90 disabled:opacity-50"
          >
            {submitting ? (
              <Loader2 className="h-4 w-4 animate-spin mx-auto" />
            ) : (
              "Book Meeting"
            )}
          </button>

          {success && (
            <div className="rounded-lg bg-green-50 border border-green-200 p-3 text-sm text-green-700">
              <CheckCircle2 className="h-4 w-4 inline mr-1" />
              {success}
            </div>
          )}

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              <XCircle className="h-4 w-4 inline mr-1" />
              {error}
            </div>
          )}
        </div>

        <div className="rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
          <h2 className="text-sm font-semibold text-gray-900 mb-3">My Upcoming Meetings</h2>
          {bookings.length === 0 ? (
            <p className="text-sm text-gray-500">No upcoming meetings</p>
          ) : (
            <div className="space-y-3">
              {bookings.map((b) => (
                <div
                  key={b.id}
                  className="flex items-center justify-between rounded-lg border border-gray-100 p-3"
                >
                  <div>
                    <p className="text-sm font-medium text-gray-900">
                      {b.slot?.teacher?.full_name ?? "Teacher"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {b.slot?.slot_date} at {b.slot?.start_time}
                    </p>
                  </div>
                  {b.status === "confirmed" && (
                    <button
                      onClick={() => handleCancel(b.id)}
                      className="text-xs text-red-600 hover:underline"
                    >
                      Cancel
                    </button>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </motion.div>
    </div>
  );
}
