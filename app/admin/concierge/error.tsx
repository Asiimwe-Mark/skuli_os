
"use client";

import { SectionError } from "@/components/shared/section-error";

export default function ErrorBoundary(
  props: { error: Error & { digest?: string }; reset: () => void },
) {
  return <SectionError {...props} surface="admin/concierge" />;
}
