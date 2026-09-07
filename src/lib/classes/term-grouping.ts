// Splitting a teacher's classes into "this term" and everything else.
//
// Shared because two dashboards render the same list (the V2 home and the
// legacy one behind TEACHER_NAV_V2) and the rule is subtler than it looks.
//
// term_id is the signal, not academic_year. A class can carry last year's
// academic_year string while belonging to the current term, and every class
// created before the term model has a NULL term_id rather than an old one —
// so filtering on the year label gets both cases wrong.

/** The fields the split needs; both dashboards' class shapes satisfy this. */
export interface TermScopedClass {
  active: boolean;
  termName: string | null;
  termIsCurrent: boolean;
}

export interface TermSplit<T> {
  /** Live classes in the school's current term — the working set. */
  current: T[];
  /** Archived cohorts, past terms, and classes with no term at all. */
  other: T[];
  /** Name of the current term, when any class is in one. */
  currentTermName: string | null;
  /** False when no class is in a current term — a school that never adopted
   *  terms. Callers should show everything rather than an empty list, since
   *  hiding every class reads as data loss. */
  hasCurrentTerm: boolean;
}

export function isCurrentTermClass(cls: TermScopedClass): boolean {
  return cls.active && cls.termIsCurrent;
}

export function splitByTerm<T extends TermScopedClass>(classes: T[]): TermSplit<T> {
  const current = classes.filter(isCurrentTermClass);
  const other = classes.filter((c) => !isCurrentTermClass(c));
  return {
    current,
    other,
    currentTermName: current.find((c) => c.termName)?.termName ?? null,
    hasCurrentTerm: current.length > 0,
  };
}

/** What to render, given whether the caller has revealed the rest. */
export function visibleClasses<T extends TermScopedClass>(
  split: TermSplit<T>,
  all: T[],
  showOther: boolean,
): T[] {
  if (!split.hasCurrentTerm) return all;
  return showOther ? [...split.current, ...split.other] : split.current;
}

/** Label for the folded-away tiles, where "which year is this?" is the
 *  question — class names repeat every September. */
export function otherClassLabel(cls: TermScopedClass): string {
  if (!cls.active) {
    return cls.termName ? `Archived · ${cls.termName}` : "Archived";
  }
  return cls.termName ?? "No term set";
}
