'use client';

/**
 * app/portal/notifications/page.tsx
 *
 * AP-1 fix: useEffect+fetch → useQuery
 * AP-11 fix: loading state always resets (try/finally via useMutation)
 * AP-6 fix: handlers wrapped in useCallback
 */

import { useCallback } from 'react';
import { formatRelativeTime } from '@/lib/utils/dates';
import { Bell, Loader2, CheckCheck, WifiOff } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useToast } from '@/components/ui/use-toast';
import { usePortalNotifications, useMarkNotificationsRead } from '@/hooks/use-portal-data';
import { ErrorBoundary } from '@/components/error-boundary';

export default function PortalNotificationsPage() {
  const { toast } = useToast();
  const { data: notifications = [], isLoading, isError, refetch } = usePortalNotifications();
  const markRead = useMarkNotificationsRead();

  // AP-6: useCallback so child components don't re-render on every keystroke
  const handleMarkOne = useCallback(
    (id: string) => {
      markRead.mutate([id]);
    },
    [markRead],
  );

  const handleMarkAll = useCallback(() => {
    const unreadIds = notifications.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    markRead.mutate(unreadIds, {
      onSuccess: () => toast({ title: 'All notifications marked as read' }),
      onError: () =>
        toast({ title: 'Failed to update', variant: 'destructive' }),
    });
  }, [notifications, markRead, toast]);

  const handleEnablePush = useCallback(async () => {
    if (!('Notification' in window)) {
      toast({ title: 'Push notifications not supported', variant: 'destructive' });
      return;
    }
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') return;
      const reg = await navigator.serviceWorker.ready;
      const sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY,
      });
      const res = await fetch('/api/push/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(sub),
        credentials: 'same-origin',
      });
      if (!res.ok) throw new Error('Subscribe failed');
      toast({ title: 'Push notifications enabled' });
    } catch {
      // AP-11: error path is handled — no loading state to reset here
      toast({ title: 'Could not enable push notifications', variant: 'destructive' });
    }
  }, [toast]);

  const unreadCount = notifications.filter((n) => !n.is_read).length;

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
        <p className="text-muted text-sm">Could not load notifications.</p>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          Try again
        </Button>
      </div>
    );
  }

  return (
    <ErrorBoundary section="Notifications">
      <div className="px-4 py-6 max-w-3xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Notifications</h1>
            <p className="text-muted">{unreadCount} unread</p>
          </div>
          {unreadCount > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={handleMarkAll}
              disabled={markRead.isPending}
            >
              <CheckCheck className="h-4 w-4 mr-1" />
              Mark All Read
            </Button>
          )}
        </div>

        {/* Push notification settings */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-medium text-sm">Push Notifications</p>
                <p className="text-xs text-muted">
                  Get instant alerts for payments, report cards, absences, and
                  announcements
                </p>
              </div>
              <Button variant="outline" size="sm" onClick={handleEnablePush}>
                Enable Push
              </Button>
            </div>
          </CardContent>
        </Card>

        {notifications.length === 0 ? (
          <div className="text-center py-16">
            <Bell className="h-12 w-12 text-muted mx-auto mb-3" />
            <p className="text-muted">No notifications yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {notifications.map((n) => (
              <Card
                key={n.id} // AP-4: stable id key, not index
                className={n.is_read ? 'opacity-60' : 'border-warning-50'}
              >
                <CardContent className="p-4 flex items-start gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm">{n.title}</span>
                      {!n.is_read && (
                        <Badge
                          variant="secondary"
                          className="bg-warning-50 text-warning-600 text-[10px]"
                        >
                          New
                        </Badge>
                      )}
                    </div>
                    <p className="text-sm text-muted mt-1">{n.body}</p>
                    <p className="text-xs text-muted mt-1">
                      {formatRelativeTime(n.created_at)}
                    </p>
                  </div>
                  {!n.is_read && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleMarkOne(n.id)}
                      disabled={markRead.isPending}
                    >
                      <CheckCheck className="h-4 w-4" />
                    </Button>
                  )}
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>
    </ErrorBoundary>
  );
}
