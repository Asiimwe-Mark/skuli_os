"use client";

import * as React from "react";
import { useToast } from "@/components/ui/use-toast";
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastIcon,
  ToastProgress,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  type ToastProps,
} from "@/components/ui/toast";

/**
 * Default on-screen duration (in ms) for each variant, when the caller does
 * not pass an explicit `duration`. Errors and warnings stay longer because
 * users need more reading time.
 */
const DEFAULT_DURATION: Record<NonNullable<ToastProps["variant"]>, number> = {
  default: 5000,
  success: 4000,
  destructive: 6000,
  warning: 6000,
  info: 5000,
};

/**
 * Drives auto-dismiss for a single toast. We can't use Radix's built-in
 * `duration` prop because we need to *pause* the timer on hover/focus (to
 * give the user time to read long messages). The flow:
 *
 *   1. On mount we start a setTimeout for the full duration.
 *   2. `onMouseEnter` / `onFocus` clear the timer and remember "paused".
 *   3. `onMouseLeave` / `onBlur` restart the timer for a fresh full duration
 *      (so the user gets the same time-on-screen after every pause, not a
 *      truncated remainder — the alternative is to track elapsed time,
 *      which is fiddlier and not noticeably better in practice).
 *   4. The CSS progress bar mirrors the same logic: its animation pauses
 *      on group:hover and group:focus-within, so visual time matches the
 *      underlying timer.
 *
 * Returns event handlers to spread on the toast root, and a ref to the
 * current timeout so we can cancel on unmount.
 */
function useAutoDismiss(id: string, duration: number) {
  const dismiss = useToast().dismiss;
  const timerRef = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = React.useRef(duration);
  const startRef = React.useRef(0);

  const clear = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  const start = () => {
    clear();
    startRef.current = Date.now();
    remainingRef.current = duration;
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      dismiss(id);
    }, duration);
  };

  const pause = () => {
    if (!timerRef.current) return;
    clear();
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startRef.current));
  };

  React.useEffect(() => {
    start();
    return clear;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, duration]);

  return {
    onMouseEnter: pause,
    onMouseLeave: start,
    onFocus: pause,
    onBlur: start,
  };
}

export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider swipeDirection="right">
      {toasts.map(function ({ id, title, description, action, variant, duration, ...props }) {
        const effectiveDuration = duration ?? DEFAULT_DURATION[variant ?? "default"];
        return (
          <TimedToast
            key={id}
            id={id}
            title={title}
            description={description}
            action={action}
            variant={variant}
            duration={effectiveDuration}
            {...props}
          />
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}

function TimedToast({
  id,
  title,
  description,
  action,
  variant,
  duration,
  ...props
}: {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  variant?: ToastProps["variant"];
  duration: number;
} & React.ComponentPropsWithoutRef<typeof Toast>) {
  const handlers = useAutoDismiss(id, duration);
  return (
    <Toast
      variant={variant}
      duration={Infinity /* we handle dismiss manually so we can pause */}
      {...handlers}
      {...props}
    >
      {variant && <ToastIcon variant={variant} />}
      <div className="grid gap-0.5 flex-1 min-w-0">
        {title && <ToastTitle>{title}</ToastTitle>}
        {description && <ToastDescription>{description}</ToastDescription>}
      </div>
      {action}
      <ToastClose />
      <ToastProgress variant={variant} duration={duration} />
    </Toast>
  );
}
