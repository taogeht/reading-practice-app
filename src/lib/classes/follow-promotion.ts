const MAX_PROMOTION_DEPTH = 20;

export interface ClassPromotionNode {
  id: string;
  active: boolean | null;
  promotedToClassId: string | null;
}

export interface PromotionDestination {
  id: string;
  forwarded: boolean;
}

/** Follow a promotion chain without coupling the traversal to a database. */
export async function followClassPromotion(
  initialClassId: string,
  loadClass: (classId: string) => Promise<ClassPromotionNode | null>,
): Promise<PromotionDestination | null> {
  let classId = initialClassId;
  const visited = new Set<string>();

  for (let depth = 0; depth < MAX_PROMOTION_DEPTH; depth += 1) {
    if (visited.has(classId)) return null;
    visited.add(classId);

    const classRecord = await loadClass(classId);
    if (!classRecord) return null;
    // Once a successor exists, the lineage is authoritative even if someone
    // later toggles the historical class active by mistake.
    if (classRecord.promotedToClassId) {
      classId = classRecord.promotedToClassId;
      continue;
    }
    if (classRecord.active) {
      return {
        id: classRecord.id,
        forwarded: classRecord.id !== initialClassId,
      };
    }
    return null;
  }

  return null;
}
