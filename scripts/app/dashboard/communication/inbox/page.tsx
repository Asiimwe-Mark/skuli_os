"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSupabaseBrowser } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import { cn } from "@/lib/utils/cn";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useToast } from "@/components/ui/use-toast";
import { fetchArray, fetchEnvelope } from "@/lib/api-fetch";
import {
  MessageSquare,
  Search,
  Send,
  Loader2,
  CheckCheck,
  Check,
  ExternalLink,
  ArrowLeft,
  Phone,
  User,
} from "lucide-react";

interface Thread {
  id: string;
  school_id: string;
  parent_phone: string;
  student_id: string | null;
  last_message_at: string;
  is_read: boolean;
  student?: { full_name: string; admission_number: string | null } | null;
  last_message?: { body: string; direction: string } | null;
}

interface ThreadMessage {
  id: string;
  thread_id: string;
  direction: "inbound" | "outbound";
  body: string;
  sender_name: string | null;
  status: string;
  sent_at: string;
}

interface ThreadDetail {
  id: string;
  parent_phone: string;
  student_id: string | null;
  student?: { full_name: string; parent_name: string | null } | null;
}

export default function InboxPage() {
  const { school } = useSchoolStore();
  const { toast } = useToast();
  const supabase = useSupabaseBrowser();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [replyText, setReplyText] = useState("");
  const [mobileShowChat, setMobileShowChat] = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const replyInputRef = useRef<HTMLTextAreaElement>(null);

  // Fetch threads (paginated — audit 4.3 / 9.6)
  const { data: threads = [], isLoading: threadsLoading } = useQuery<Thread[]>({
    queryKey: ["communication-threads", search],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (search) params.set("search", search);
      // Server returns either a plain array or a { threads, total, ... }
      // envelope. fetchArray handles both.
      return fetchArray<Thread>(`/api/communication/threads?${params}`);
    },
    enabled: !!school?.id,
  });

  // Fetch messages for selected thread
  const { data: threadData, isLoading: messagesLoading } = useQuery<{
    thread: ThreadDetail;
    messages: ThreadMessage[];
  }>({
    queryKey: ["thread-messages", selectedThreadId],
    queryFn: async () => {
      if (!selectedThreadId) {
        return { thread: { id: "", parent_phone: "", student_id: null, student: null } as ThreadDetail, messages: [] };
      }
      // This endpoint returns { success, data: { thread, messages } }.
      // fetchEnvelope unwraps to the inner { thread, messages } object.
      return fetchEnvelope<{ thread: ThreadDetail; messages: ThreadMessage[] }>(
        `/api/communication/threads/${selectedThreadId}/messages`,
      );
    },
    enabled: !!selectedThreadId,
  });

  // Mark thread as read
  const markAsRead = useCallback(
    async (threadId: string) => {
      await fetch(`/api/communication/threads/${threadId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ is_read: true }),
      });
      queryClient.invalidateQueries({ queryKey: ["communication-threads"] });
    },
    [queryClient]
  );

  // Send reply
  const sendReply = useMutation({
    mutationFn: async () => {
      if (!selectedThreadId || !replyText.trim()) return;
      const res = await fetch("/api/communication/reply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          thread_id: selectedThreadId,
          message_body: replyText.trim(),
        }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "Failed to send reply");
      }
      return res.json();
    },
    onSuccess: () => {
      setReplyText("");
      queryClient.invalidateQueries({ queryKey: ["thread-messages"] });
      queryClient.invalidateQueries({ queryKey: ["communication-threads"] });
      toast({ title: "Reply sent" });
    },
    onError: (err) => {
      toast({
        title: "Failed to send reply",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "destructive",
      });
    },
  });

  // Realtime subscription for new inbound messages
  useEffect(() => {
    if (!school?.id) return;

    const channel = supabase
      .channel("inbox-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "thread_messages",
          filter: `school_id=eq.${school.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["communication-threads"],
          });
          queryClient.invalidateQueries({ queryKey: ["thread-messages"] });
        }
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_threads",
          filter: `school_id=eq.${school.id}`,
        },
        () => {
          queryClient.invalidateQueries({
            queryKey: ["communication-threads"],
          });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [school?.id, supabase, queryClient]);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [threadData?.messages]);

  // Mark thread as read when selected
  useEffect(() => {
    if (selectedThreadId) {
      const thread = threads.find((t) => t.id === selectedThreadId);
      if (thread && !thread.is_read) {
        markAsRead(selectedThreadId);
      }
    }
  }, [selectedThreadId, threads, markAsRead]);

  // Pre-fill reply with parent name
  useEffect(() => {
    if (threadData?.thread?.student?.parent_name) {
      setReplyText(`Dear ${threadData.thread.student.parent_name}, `);
    } else if (selectedThreadId) {
      const thread = threads.find((t) => t.id === selectedThreadId);
      if (thread) {
        setReplyText(`Dear ${thread.parent_phone}, `);
      }
    }
  }, [selectedThreadId, threadData, threads]);

  const handleSelectThread = (threadId: string) => {
    setSelectedThreadId(threadId);
    setMobileShowChat(true);
  };

  const handleBack = () => {
    setMobileShowChat(false);
    setSelectedThreadId(null);
  };

  const selectedThread = threads.find((t) => t.id === selectedThreadId);
  const messages = threadData?.messages || [];
  const thread = threadData?.thread;

  return (
    <motion.div
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      className="h-[calc(100vh-10rem)]"
    >
      <div className="mb-4">
        <h1 className="text-2xl font-bold font-display">Inbox</h1>
        <p className="text-muted text-sm mt-1">
          View and reply to parent messages
        </p>
      </div>

      <div className="flex h-[calc(100%-4rem)] rounded-xl border bg-card overflow-hidden">
        {/* Left Panel - Thread List */}
        <div
          className={cn(
            "w-full md:w-80 lg:w-96 border-r  flex flex-col shrink-0",
            mobileShowChat && selectedThreadId ? "hidden md:flex" : "flex"
          )}
        >
          {/* Search */}
          <div className="p-3 border-b">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-heading" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by name or phone..."
                className="pl-9"
              />
            </div>
          </div>

          {/* Thread List */}
          <div className="flex-1 overflow-y-auto">
            {threadsLoading ? (
              <div className="space-y-1 p-2">
                {[1, 2, 3, 4].map((i) => (
                  <div key={i} className="p-3 rounded-lg">
                    <Skeleton className="h-4 w-32 mb-2" />
                    <Skeleton className="h-3 w-48" />
                  </div>
                ))}
              </div>
            ) : threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-heading">
                <MessageSquare className="w-10 h-10 mb-2" />
                <p className="text-sm">
                  {search ? "No threads found" : "No messages yet"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border-subtle">
                {threads.map((thread) => (
                  <button
                    key={thread.id}
                    onClick={() => handleSelectThread(thread.id)}
                    className={cn(
                      "w-full text-left p-3 hover:bg-card-hover transition-colors",
                      selectedThreadId === thread.id && "bg-bg-tertiary"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <span
                            className={cn(
                              "text-sm truncate",
                              !thread.is_read
                                ? "font-bold text-heading"
                                : "font-medium text-heading-500"
                            )}
                          >
                            {thread.student?.full_name || thread.parent_phone}
                          </span>
                          {!thread.is_read && (
                            <Badge
                              variant="default"
                              className="h-5 min-w-5 px-1.5 text-xs bg-bg-tertiary text-white shrink-0"
                            >
                              New
                            </Badge>
                          )}
                        </div>
                        {thread.student && (
                          <p className="text-xs text-heading truncate">
                            {thread.parent_phone}
                            {thread.student.admission_number &&
                              ` * ${thread.student.admission_number}`}
                          </p>
                        )}
                        {thread.last_message && (
                          <p className="text-xs text-heading truncate mt-1">
                            {thread.last_message.direction === "outbound"
                              ? "You: "
                              : ""}
                            {thread.last_message.body}
                          </p>
                        )}
                      </div>
                      <span className="text-[10px] text-heading shrink-0">
                        {formatRelativeTime(thread.last_message_at)}
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Panel - Conversation */}
        <div
          className={cn(
            "flex-1 flex flex-col",
            !mobileShowChat || !selectedThreadId
              ? "hidden md:flex"
              : "flex"
          )}
        >
          {!selectedThreadId ? (
            <div className="flex-1 flex flex-col items-center justify-center text-heading">
              <MessageSquare className="w-16 h-16 mb-4" />
              <p className="text-lg font-medium">Select a conversation</p>
              <p className="text-sm mt-1">
                Choose a thread from the left to view messages
              </p>
            </div>
          ) : (
            <>
              {/* Conversation Header */}
              <div className="flex items-center justify-between p-3 border-b bg-bg-tertiary">
                <div className="flex items-center gap-3">
                  <Button
                    variant="ghost"
                    size="icon"
                    className="md:hidden h-8 w-8"
                    onClick={handleBack}
                  >
                    <ArrowLeft className="w-4 h-4" />
                  </Button>
                  <div>
                    <p className="text-sm font-semibold">
                      {thread?.student?.full_name ||
                        selectedThread?.parent_phone ||
                        "Unknown"}
                    </p>
                    <div className="flex items-center gap-2 text-xs text-heading">
                      <Phone className="w-3 h-3" />
                      <span>{selectedThread?.parent_phone}</span>
                      {thread?.student && (
                        <>
                          <span>*</span>
                          <User className="w-3 h-3" />
                          <span>{thread.student.full_name}</span>
                        </>
                      )}
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {thread?.student_id && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-8"
                      asChild
                    >
                      <a
                        href={`/dashboard/students/${thread.student_id}`}
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        <ExternalLink className="w-3 h-3 mr-1" />
                        View Student
                      </a>
                    </Button>
                  )}
                  {selectedThread && !selectedThread.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-xs h-8"
                      onClick={() => markAsRead(selectedThread.id)}
                    >
                      <CheckCheck className="w-3 h-3 mr-1" />
                      Mark Read
                    </Button>
                  )}
                </div>
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3">
                {messagesLoading ? (
                  <div className="space-y-3">
                    {[1, 2, 3].map((i) => (
                      <div
                        key={i}
                        className={cn(
                          "max-w-[75%]",
                          i % 2 === 0 ? "ml-auto" : "mr-auto"
                        )}
                      >
                        <Skeleton className="h-12 w-48 rounded-2xl" />
                      </div>
                    ))}
                  </div>
                ) : messages.length === 0 ? (
                  <div className="flex flex-col items-center justify-center h-full text-heading">
                    <MessageSquare className="w-10 h-10 mb-2" />
                    <p className="text-sm">No messages yet</p>
                  </div>
                ) : (
                  messages.map((msg) => (
                    <div
                      key={msg.id}
                      className={cn(
                        "flex",
                        msg.direction === "outbound"
                          ? "justify-end"
                          : "justify-start"
                      )}
                    >
                      <div
                        className={cn(
                          "max-w-[75%] rounded-2xl px-4 py-2.5",
                          msg.direction === "outbound"
                            ? "bg-warning-50 border border-warning-50"
                            : "bg-bg-tertiary border border-border"
                        )}
                      >
                        {msg.sender_name && (
                          <p className="text-xs font-medium text-heading mb-1">
                            {msg.sender_name}
                          </p>
                        )}
                        <p className="text-sm whitespace-pre-wrap break-words">
                          {msg.body}
                        </p>
                        <div
                          className={cn(
                            "flex items-center gap-1 mt-1",
                            msg.direction === "outbound"
                              ? "justify-end"
                              : "justify-start"
                          )}
                        >
                          <span className="text-[10px] text-heading">
                            {formatMessageTime(msg.sent_at)}
                          </span>
                          {msg.direction === "outbound" && (
                            <>
                              {msg.status === "delivered" ? (
                                <CheckCheck className="w-3 h-3 text-secondary" />
                              ) : msg.status === "sent" ? (
                                <Check className="w-3 h-3 text-heading" />
                              ) : (
                                <span className="text-[10px] text-secondary">
                                  Failed
                                </span>
                              )}
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {/* Reply Input */}
              <div className="p-3 border-t bg-bg-tertiary">
                <div className="flex items-end gap-2">
                  <textarea
                    ref={replyInputRef}
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (replyText.trim()) sendReply.mutate();
                      }
                    }}
                    placeholder="Type your reply..."
                    rows={1}
                    className="flex-1 resize-none rounded-xl border bg-card px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-warning-100 min-h-[42px] max-h-[120px]"
                    style={{ height: "auto" }}
                    onInput={(e) => {
                      const target = e.target as HTMLTextAreaElement;
                      target.style.height = "auto";
                      target.style.height = Math.min(target.scrollHeight, 120) + "px";
                    }}
                  />
                  <Button
                    onClick={() => sendReply.mutate()}
                    disabled={!replyText.trim() || sendReply.isPending}
                    className="shrink-0 h-[42px] w-[42px] p-0 rounded-xl"
                  >
                    {sendReply.isPending ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Send className="w-4 h-4" />
                    )}
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </motion.div>
  );
}

function formatRelativeTime(dateStr: string): string {
  const date = new Date(dateStr);
  const now = new Date();
  const diffMs = now.getTime() - date.getTime();
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMins / 60);
  const diffDays = Math.floor(diffHours / 24);

  if (diffMins < 1) return "now";
  if (diffMins < 60) return `${diffMins}m`;
  if (diffHours < 24) return `${diffHours}h`;
  if (diffDays < 7) return `${diffDays}d`;
  return date.toLocaleDateString("en-UG", { month: "short", day: "numeric" });
}

function formatMessageTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleTimeString("en-UG", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  });
}
