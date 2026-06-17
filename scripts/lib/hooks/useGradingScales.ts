"use client";

import { useQuery } from "@tanstack/react-query";
import { createBrowserClient } from "@/lib/supabase/client";
import { useSchoolStore } from "@/store/school";
import type { GradingScaleRow } from "@/lib/utils/grades";

export function useGradingScales() {
  const school = useSchoolStore((s) => s.school);
  const supabase = createBrowserClient();

  return useQuery<GradingScaleRow[]>({
    queryKey: ["grading-scales", school?.id],
    enabled: !!school?.id,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("grading_scales")
        .select("grade, min_score, max_score, label")
        .eq("school_id", school!.id)
        .eq("is_deleted", false)
        .order("sort_order");
      if (error) throw error;
      return (data ?? []) as GradingScaleRow[];
    },
    staleTime: 5 * 60 * 1000,
  });
}
