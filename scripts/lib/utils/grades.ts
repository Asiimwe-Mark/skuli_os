export type Grade = "A" | "B" | "C" | "D" | "F";

export interface GradeConfig {
  grade: Grade;
  min: number;
  max: number;
  label: string;
}

export interface GradingScaleRow {
  grade: string;
  min_score: number;
  max_score: number;
  label: string | null;
}

const DEFAULT_GRADING: GradeConfig[] = [
  { grade: "A", min: 80, max: 100, label: "Excellent" },
  { grade: "B", min: 70, max: 79, label: "Very Good" },
  { grade: "C", min: 60, max: 69, label: "Good" },
  { grade: "D", min: 50, max: 59, label: "Satisfactory" },
  { grade: "F", min: 0, max: 49, label: "Fail" },
];

/**
 * Get grade for a score. Uses DB-configured grading scale if provided,
 * otherwise falls back to defaults.
 */
export function getGrade(
  score: number,
  maxScoreOrScale?: number | GradingScaleRow[]
): string {
  // If an array is passed, use DB grading scale
  if (Array.isArray(maxScoreOrScale)) {
    const percentage = score; // score is already a percentage when using scale
    const sorted = [...maxScoreOrScale].sort(
      (a, b) => b.min_score - a.min_score
    );
    const match = sorted.find(
      (s) => percentage >= s.min_score && percentage <= s.max_score
    );
    return match?.grade ?? "F";
  }

  // Legacy: maxScore number
  const maxScore = maxScoreOrScale ?? 100;
  const percentage = (score / maxScore) * 100;
  for (const config of DEFAULT_GRADING) {
    if (percentage >= config.min) return config.grade;
  }
  return "F";
}

export function getGradeLabel(grade: string, scale?: GradingScaleRow[]): string {
  if (scale && scale.length > 0) {
    return scale.find((s) => s.grade === grade)?.label ?? "";
  }
  return DEFAULT_GRADING.find((g) => g.grade === grade)?.label ?? "";
}

export function getGradeColor(grade: string): string {
  switch (grade) {
    case "A": return "text-success-600 dark:text-success-400";
    case "B": return "text-brand-600 dark:text-brand-400";
    case "C": return "text-warning-600 dark:text-warning-400";
    case "D": return "text-warning-700 dark:text-warning-400";
    case "F": return "text-danger-600 dark:text-danger-400";
    default: return "text-muted";
  }
}

export function getGradeBgColor(grade: string): string {
  switch (grade) {
    case "A": return "bg-success-50 text-success-700 dark:bg-success-900/30 dark:text-success-400";
    case "B": return "bg-brand-50 text-brand-700 dark:bg-brand-900/30 dark:text-brand-400";
    case "C": return "bg-warning-50 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400";
    case "D": return "bg-warning-100 text-warning-700 dark:bg-warning-900/30 dark:text-warning-400";
    case "F": return "bg-danger-50 text-danger-700 dark:bg-danger-900/30 dark:text-danger-400";
    default: return "bg-bg-tertiary text-muted";
  }
}
