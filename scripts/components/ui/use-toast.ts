"use client";

import * as React from "react";
import type { ToastProps, ToastActionElement } from "@/components/ui/toast";

/**
 * Toast limits & timing
 * - TOAST_LIMIT: how many toasts can be visible at once. Stacked top-right
 *   so the user can see and dismiss independently. Older toasts are evicted
 *   when this limit is hit.
 * - TOAST_REMOVE_DELAY: how long an animation takes to finish before Radix
 *   fires onOpenChange(false) and we remove the toast from state. (It is not
 *   the on-screen duration — that's controlled per-toast via the `duration`
 *   prop passed to <Toast />, so success can be 4s and error 6s.)
 */
const TOAST_LIMIT = 5;
const TOAST_REMOVE_DELAY = 300;

type ToasterToast = ToastProps & {
  id: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: ToastActionElement;
};

let count = 0;

function genId() {
  count = (count + 1) % Number.MAX_SAFE_INTEGER;
  return count.toString();
}

type Action =
  | { type: "ADD_TOAST"; toast: ToasterToast }
  | { type: "UPDATE_TOAST"; toast: Partial<ToasterToast> }
  | { type: "DISMISS_TOAST"; toastId?: ToasterToast["id"] }
  | { type: "REMOVE_TOAST"; toastId?: ToasterToast["id"] };

interface State {
  toasts: ToasterToast[];
}

export const reducer = (state: State, action: Action): State => {
  switch (action.type) {
    case "ADD_TOAST":
      return { ...state, toasts: [action.toast, ...state.toasts].slice(0, TOAST_LIMIT) };
    case "UPDATE_TOAST":
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          t.id === action.toast.id ? { ...t, ...action.toast } : t
        ),
      };
    case "DISMISS_TOAST": {
      const { toastId } = action;
      // Mark the matching toast(s) closed; the onOpenChange handler in
      // `toast()` then schedules REMOVE_TOAST after the exit animation.
      // If `toastId` is undefined, dismiss every visible toast.
      return {
        ...state,
        toasts: state.toasts.map((t) =>
          toastId === undefined || t.id === toastId ? { ...t, open: false } : t
        ),
      };
    }
    case "REMOVE_TOAST":
      if (action.toastId === undefined) return { ...state, toasts: [] };
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.toastId) };
  }
};

const listeners: Array<(state: State) => void> = [];
let memoryState: State = { toasts: [] };

function dispatch(action: Action) {
  memoryState = reducer(memoryState, action);
  listeners.forEach((listener) => listener(memoryState));
}

type Toast = Omit<ToasterToast, "id">;

function toast({ ...props }: Toast) {
  const id = genId();
  const dismiss = () => dispatch({ type: "DISMISS_TOAST", toastId: id });

  dispatch({
    type: "ADD_TOAST",
    toast: {
      ...props,
      id,
      open: true,
      onOpenChange: (open) => {
        if (!open) {
          // Allow the close animation to play, then remove from state.
          setTimeout(() => dispatch({ type: "REMOVE_TOAST", toastId: id }), TOAST_REMOVE_DELAY);
        }
      },
    },
  });

  return {
    id,
    dismiss,
    update: (props: ToasterToast) => dispatch({ type: "UPDATE_TOAST", toast: { ...props, id } }),
  };
}

/**
 * Convenience helpers so callers don't have to pick a variant + duration
 * every time. Pass either { title, description? } — variant is set per helper.
 */
function toastSuccess(props: { title: string; description?: React.ReactNode; duration?: number }) {
  return toast({ ...props, variant: "success" });
}
function toastError(props: { title: string; description?: React.ReactNode; duration?: number }) {
  return toast({ ...props, variant: "destructive" });
}
function toastWarning(props: { title: string; description?: React.ReactNode; duration?: number }) {
  return toast({ ...props, variant: "warning" });
}
function toastInfo(props: { title: string; description?: React.ReactNode; duration?: number }) {
  return toast({ ...props, variant: "info" });
}

function useToast() {
  const [state, setState] = React.useState<State>(memoryState);

  React.useEffect(() => {
    listeners.push(setState);
    return () => {
      const index = listeners.indexOf(setState);
      if (index > -1) listeners.splice(index, 1);
    };
  }, [setState]);

  return {
    ...state,
    toast,
    dismiss: (toastId?: string) => dispatch({ type: "DISMISS_TOAST", toastId }),
  };
}

export { useToast, toast, toastSuccess, toastError, toastWarning, toastInfo };
