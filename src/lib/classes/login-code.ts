import { eq, sql } from 'drizzle-orm';
import { db } from '@/lib/db';
import { classes } from '@/lib/db/schema';
import {
  resolveClassLoginDestination,
  type ClassLoginDestination,
} from '@/lib/classes/login-destination';

/** Resolve a memorable class slug or legacy UUID prefix through promotions. */
export async function resolveClassLoginCode(
  rawCode: string,
): Promise<ClassLoginDestination | null> {
  const code = rawCode.trim().toLowerCase();
  if (!code) return null;

  const [slugMatch] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(eq(classes.slug, code))
    .limit(1);
  if (slugMatch) return resolveClassLoginDestination(slugMatch.id);

  if (code.length < 4) return null;
  const [prefixMatch] = await db
    .select({ id: classes.id })
    .from(classes)
    .where(sql`${classes.id}::text LIKE ${code + '%'}`)
    .limit(1);
  if (!prefixMatch) return null;
  return resolveClassLoginDestination(prefixMatch.id);
}
