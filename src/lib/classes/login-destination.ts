import { db } from '@/lib/db';
import { classes } from '@/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
  followClassPromotion,
  type PromotionDestination,
} from '@/lib/classes/follow-promotion';

export type ClassLoginDestination = PromotionDestination;

/**
 * Resolve an old class login link to the active class at the end of its
 * promotion chain. An inactive class without a successor remains unavailable.
 * The depth/cycle guards keep malformed database state from looping forever.
 */
export async function resolveClassLoginDestination(
  initialClassId: string,
): Promise<ClassLoginDestination | null> {
  return followClassPromotion(initialClassId, async (classId) => {
    const [classRecord] = await db
      .select({
        id: classes.id,
        active: classes.active,
        promotedToClassId: classes.promotedToClassId,
      })
      .from(classes)
      .where(eq(classes.id, classId))
      .limit(1);

    return classRecord ?? null;
  });
}
