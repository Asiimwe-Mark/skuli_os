'use client';

import { useState, useEffect } from 'react';
import { formatRelativeTime } from '@/lib/utils/dates';
import { MessageSquare, Loader2, ChevronDown, ChevronUp } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface Message {
  id: string;
  source: 'sms' | 'in_app';
  title?: string;
  body: string;
  sent_at: string;
  is_read: boolean;
  type: string;
}

export default function PortalMessagesPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [filter, setFilter] = useState<'all' | 'unread' | 'sms' | 'in_app'>('all');

  useEffect(() => {
    fetch('/api/portal/messages')
      .then((r) => r.json())
      .then(({ data }) => {
        setMessages(data ?? []);
        setLoading(false);
      })
      .catch(() => setLoading(false));
  }, []);

  const filtered = messages.filter((m) => {
    if (filter === 'unread') return !m.is_read;
    if (filter === 'sms') return m.source === 'sms';
    if (filter === 'in_app') return m.source === 'in_app';
    return true;
  });

  if (loading) {
    return (
      <div className="flex h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber" />
      </div>
    );
  }

  return (
    <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Messages from School</h1>
        <p className="text-gray-500">Announcements and updates</p>
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {(['all', 'unread', 'sms', 'in_app'] as const).map((f) => (
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
          <MessageSquare className="h-12 w-12 text-gray-300 mx-auto mb-3" />
          <p className="text-gray-500">No messages yet. The school will contact you here.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((msg) => {
            const isExpanded = expandedId === msg.id;
            return (
              <Card key={msg.id} className={msg.is_read ? '' : 'border-amber/20 bg-amber/10/30'}>
                <CardContent className="p-4">
                  <button
                    onClick={() => setExpandedId(isExpanded ? null : msg.id)}
                    className="w-full flex items-center justify-between text-left"
                  >
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {msg.title ? (
                          <span className="font-medium text-sm truncate">{msg.title}</span>
                        ) : (
                          <span className="font-medium text-sm truncate">{msg.body.slice(0, 60)}...</span>
                        )}
                        {!msg.is_read && <Badge variant="secondary" className="bg-amber/20 text-amber text-[10px]">New</Badge>}
                      </div>
                      <div className="flex items-center gap-2 mt-1 text-xs text-gray-500">
                        <span>{msg.source === 'sms' ? 'SMS' : 'Notification'}</span>
                        <span>&middot;</span>
                        <span>{formatRelativeTime(msg.sent_at)}</span>
                      </div>
                    </div>
                    {isExpanded ? <ChevronUp className="h-4 w-4 text-gray-400" /> : <ChevronDown className="h-4 w-4 text-gray-400" />}
                  </button>
                  {isExpanded && (
                    <div className="mt-3 pt-3 border-t text-sm text-gray-700 whitespace-pre-wrap">
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
  );
}
