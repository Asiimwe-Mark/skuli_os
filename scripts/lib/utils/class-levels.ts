import type { SchoolType } from "@/types";

/**
 * Default class levels per school type. The order is intentional — it
 * matches the order admins expect to see them in dropdowns and the order
 * promotion logic walks.
 */
export const CLASS_LEVELS: Record<SchoolType, readonly string[]> = {
  primary: ["Baby", "Middle", "Top", "P.1", "P.2", "P.3", "P.4", "P.5", "P.6", "P.7"],
  nursery: ["DayCare", "Baby", "Middle", "Top"],
  secondary: ["S.1", "S.2", "S.3", "S.4", "S.5", "S.6"],
  // 'both' is treated as the union of primary and secondary. Nursery
  // schools are standalone and don't combine with primary/secondary in
  // the current product, so 'both' does NOT include nursery levels.
  both: [
    "Baby", "Middle", "Top", "P.1", "P.2", "P.3", "P.4", "P.5", "P.6", "P.7",
    "S.1", "S.2", "S.3", "S.4", "S.5", "S.6",
  ],
};

/**
 * Returns the class levels available for a given school type. Falls
 * back to the union ('both') for unknown values.
 */
export function getClassLevels(schoolType: SchoolType | string | null | undefined): readonly string[] {
  if (!schoolType) return CLASS_LEVELS.both;
  if (schoolType in CLASS_LEVELS) {
    return CLASS_LEVELS[schoolType as SchoolType];
  }
  return CLASS_LEVELS.both;
}

/**
 * Returns true if the given level is one of the canonical levels for the
 * supplied school type. Useful for filtering legacy/inconsistent rows.
 */
export function isLevelForSchoolType(level: string | null | undefined, schoolType: SchoolType | string | null | undefined): boolean {
  if (!level) return true; // never hide rows whose level is unset
  const allowed = getClassLevels(schoolType);
  return allowed.includes(level);
}
