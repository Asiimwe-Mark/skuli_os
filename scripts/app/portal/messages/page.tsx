'use client';

/**
 * app/portal/messages/page.tsx
 *
 * AP-1 fix: useEffect+fetch → useQuery (usePortalMessages hook)
 * AP-7 fix: filtered useMemo instead of inline .filter() on every render
 * AP-6 fix: handlers in useCallback
 * AP-4 fix: key={msg.id} not index
 */

import { useState, useMemo, useCallback } from 'react';
import { formatRelativeTime } from '@/lib/utils/dates';
import { MessageSquare, Loader2, ChevronDown, ChevronUp, WifiOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { usePortalMessages, type PortalMessage } from '@/hooks/use-portal-data';
import { ErrorBoundary } from '@/components/error-boundary';

type Filter = 'all' | 'unread' | 'sms' | 'in_app';

export default function PortalMessagesPage() {
  const { data: messages = [], isLoading, isError, refetch } = usePortalMessages();
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  // AP-7: memoize the filtered list — only recalculates when messages or filter changes
  const filtered = useMemo<PortalMessage[]>(() => {
    switch (filter) {
      case 'unread':  return messages.filter((m) => !m.is_read);
      case 'sms':     return messages.filter((m) => m.source === 'sms');
      case 'in_app':  return messages.filter((m) => m.source === 'in_app');
      default:        return messages;
    }
  }, [messages, filter]);

  // AP-6: stable handler reference
  const handleToggle = useCallback((id: string) => {
    setExpandedId((prev) => (prev === id ? null : id));
  }, []);

  if (isLoading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-warning-600" />
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex h-[50vh] flex-col items-center justify-center gap-4 text-center px-4">
        <WifiOff className="h-10 w-10 text-muted" />
        <p className="text-muted text-sm">Could not load messages.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <ErrorBoundary section="Messages">
      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Messages from School</h1>
          <p className="text-muted">Announcements and updates</p>
        </div>

        {/* Filter tabs */}
        <div className="flex flex-wrap gap-2">
          {(['all', 'unread', 'sms', 'in_app'] as Filter[]).map((f) => (
            <Button
              key={f}
              variant={filter === f ? 'default' : 'outline'}
              size="sm"
              onClick={() => setFilter(f)}
            >
              {f === 'all' ? 'All' : f === 'unread' ? 'Unread' : f === 'sms' ? 'SMS' : 'In-App'}
            </Button>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="text-center py-16">
            <MessageSquare className="h-12 w-12 text-muted mx-auto mb-3" />
            <p className="text-muted">No messages yet. The school will contact you here.</p>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((msg) => {
              const isExpanded = expandedId === msg.id;
              return (
                <Card
                  key={msg.id} // AP-4: stable id key
                  className={msg.is_read ? '' : 'border-warning-50 bg-warning-50/30'}
                >
                  <CardContent className="p-4">
                    <button
                      onClick={() => handleToggle(msg.id)}
                      className="w-full flex items-center justify-between text-left"
                    >
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm truncate">
                            {msg.title
                              ? msg.title
                              : `${msg.body.slice(0, 60)}${msg.body.length > 60 ? '…' : ''}`}
                          </span>
                          {!msg.is_read && (
                            <Badge
                              variant="secondary"
                              className="bg-warning-50 text-warning-600 text-[10px] shrink-0"
                            >
                              New
                            </Badge>
                          )}
                        </div>
                        <div className="flex items-center gap-2 mt-1 text-xs text-muted">
                          <span>{msg.source === 'sms' ? 'SMS' : 'Notification'}</span>
                          <span>·</span>
                          <span>{formatRelativeTime(msg.sent_at)}</span>
                        </div>
                      </div>
                      {isExpanded
                        ? <ChevronUp className="h-4 w-4 text-muted shrink-0" />
                        : <ChevronDown className="h-4 w-4 text-muted shrink-0" />}
                    </button>
                    {isExpanded && (
                      <div className="mt-3 pt-3 border-t text-sm text-heading whitespace-pre-wrap">
                        {msg.body}
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
