"use client";

import { useEffect } from "react";

/**
 * Sets `document.title` to `${title} | SKULI` for the lifetime of
 * the component. Audit 3.6 (item 3.6 in the checklist): 30+ pages
 * had a boilerplate
 *   useEffect(() => { document.title = "X | SKULI"; }, [])
 * This hook centralises the pattern so a future "SKULI Admin"
 * rename is a one-line change.
 *
 * If a page needs a fully custom title (no "| SKULI" suffix), it can
 * still set `document.title` directly — but the convention is to
 * pass the page name only.
 */
export function useDocumentTitle(title: string): void {
  useEffect(() => {
    const previous = document.title;
    document.title = title.includes("SKULI") ? title : `${title} | SKULI`;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
