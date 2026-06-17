'use client';

/**
 * components/error-boundary.tsx
 *
 * AP-5 fix: Zero error boundaries existed in the codebase.
 * When any component throws (bad data, Recharts crash, null.map()),
 * the entire page goes blank with no recovery.
 *
 * Usage:
 *   <ErrorBoundary>
 *     <SomeDangerousComponent />
 *   </ErrorBoundary>
 *
 *   <ErrorBoundary fallback={<p>Custom message</p>}>
 *     <Chart data={data} />
 *   </ErrorBoundary>
 *
 *   // Wrap entire dashboard sections:
 *   <ErrorBoundary section="Fee Accounts">
 *     <FeeAccountsTable />
 *   </ErrorBoundary>
 */

import React, { Component, type ReactNode } from 'react';
import { AlertTriangle, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';

interface Props {
  children: ReactNode;
  /** Optional custom fallback UI */
  fallback?: ReactNode;
  /** Section name shown in the error card (e.g. "Fee Accounts") */
  section?: string;
  /** Called when an error is caught — use for Sentry/logging */
  onError?: (error: Error, info: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  override componentDidCatch(error: Error, info: React.ErrorInfo) {
    console.error('[ErrorBoundary]', error, info.componentStack);
    this.props.onError?.(error, info);
  }

  handleRetry = () => {
    this.setState({ hasError: false, error: null });
  };

  override render() {
    if (this.state.hasError) {
      if (this.props.fallback) return this.props.fallback;

      return (
        <Card className="border-danger-200 dark:border-danger-800 bg-danger-50/50 dark:bg-danger-950/20">
          <CardContent className="p-6 flex flex-col items-center text-center gap-3">
            <div className="h-10 w-10 rounded-full bg-danger-100 dark:bg-danger-900/40 flex items-center justify-center">
              <AlertTriangle className="h-5 w-5 text-danger-600 dark:text-danger-400" />
            </div>
            <div>
              <p className="font-semibold text-sm text-heading">
                {this.props.section
                  ? `${this.props.section} couldn't load`
                  : 'Something went wrong'}
              </p>
              <p className="text-xs text-muted mt-1">
                {this.state.error?.message ?? 'An unexpected error occurred.'}
              </p>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={this.handleRetry}
              className="gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              Try again
            </Button>
          </CardContent>
        </Card>
      );
    }

    return this.props.children;
  }
}

/**
 * Lightweight wrapper that also resets a React Query error.
 * Wrap around individual query-driven sections for granular recovery.
 *
 * Usage:
 *   <QueryErrorBoundary queryKey={queryKeys.feeAccounts(schoolId)} section="Fee Accounts">
 *     <FeeAccountsSection />
 *   </QueryErrorBoundary>
 */
import { useQueryClient } from '@tanstack/react-query';
import type { QueryKey } from '@tanstack/react-query';

interface QueryErrorBoundaryProps extends Props {
  queryKey?: QueryKey;
}

// Inner component that can use hooks (ErrorBoundary is a class component)
function QueryErrorBoundaryInner({
  children,
  fallback,
  section,
  onError,
  queryKey,
}: QueryErrorBoundaryProps) {
  const qc = useQueryClient();

  const handleError = React.useCallback(
    (error: Error, info: React.ErrorInfo) => {
      onError?.(error, info);
      if (queryKey) {
        // Force-mark the query as errored so clicking retry re-fetches
        qc.invalidateQueries({ queryKey });
      }
    },
    [onError, qc, queryKey],
  );

  return (
    <ErrorBoundary fallback={fallback} section={section} onError={handleError}>
      {children}
    </ErrorBoundary>
  );
}

export function QueryErrorBoundary(props: QueryErrorBoundaryProps) {
  return <QueryErrorBoundaryInner {...props} />;
}

/**
 * Higher-order component variant for wrapping a page segment:
 *
 *   export default withErrorBoundary(FeeAccountsPage, { section: 'Fee Accounts' });
 */
export function withErrorBoundary<P extends object>(
  Component: React.ComponentType<P>,
  boundaryProps?: Omit<Props, 'children'>,
) {
  const Wrapped = (props: P) => (
    <ErrorBoundary {...boundaryProps}>
      <Component {...props} />
    </ErrorBoundary>
  );
  Wrapped.displayName = `WithErrorBoundary(${Component.displayName ?? Component.name})`;
  return Wrapped;
}
