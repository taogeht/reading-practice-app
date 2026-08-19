// Which spelling list is "this week's test".
//
// Every spelling surface used to answer this by position — lists[0], on the
// assumption that the newest list is the current one. That held while teachers
// hand-made one list a week. It broke once a class could have a whole year
// imported at once: those lists are written in a single pass, so their
// createdAt values are milliseconds apart and "newest" is effectively
// arbitrary.
//
// The teacher already designates the week's test with the star control on
// /teacher/spelling-lists, which sets spelling_lists.is_current (at most one
// per class). This reads that flag instead, so the games, the practice pool
// and the dashboard all agree with what the teacher chose.

export interface CurrentFlagged {
  id: string;
  isCurrent?: boolean;
}

/**
 * The teacher's designated list, or null when none is set.
 * Callers that must always show something should fall back themselves, so the
 * distinction between "the teacher chose this" and "we picked one" stays
 * visible at the callsite — labelling a fallback as "This Week" is the bug
 * this helper exists to prevent.
 */
export function findCurrentList<T extends CurrentFlagged>(lists: T[]): T | null {
  return lists.find((list) => list.isCurrent) ?? null;
}

/** The list to practise by default: the designated one, else the first. */
export function practiceList<T extends CurrentFlagged>(lists: T[]): T | null {
  return findCurrentList(lists) ?? lists[0] ?? null;
}
