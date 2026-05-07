import { db } from '@/lib/db';
import { classes } from '@/lib/db/schema';
import { and, eq, ne } from 'drizzle-orm';

const MIN_LEN = 3;
const MAX_LEN = 60;
// Lowercase a-z / 0-9, hyphen-separated; no leading/trailing hyphen, no double
// hyphens. The "must contain at least one letter" rule is enforced separately
// (see allHexLike) so slugs never collide with the UUID-prefix shortcode space.
const SHAPE = /^[a-z0-9](?:-?[a-z0-9])*$/;

// Strings that look like the start of a UUID — pure hex digits. Banning these
// keeps the /c/<code> resolver unambiguous: it can try slug first, then UUID
// prefix, with no overlap.
const ALL_HEX = /^[0-9a-f]+$/;

function allHexLike(s: string): boolean {
  return ALL_HEX.test(s);
}

export function isValidSlug(s: string): boolean {
  if (typeof s !== 'string') return false;
  if (s.length < MIN_LEN || s.length > MAX_LEN) return false;
  if (!SHAPE.test(s)) return false;
  if (allHexLike(s)) return false;
  return true;
}

// Best-effort transliteration of a class name + year into a URL-safe slug.
// CJK / non-ASCII characters get stripped, so "二年級 (2026)" collapses to a
// short fallback — the caller can append a uniqueness suffix or let the
// teacher type a manual one. The output is NOT guaranteed unique.
export function suggestSlug(name: string, academicYear: string | null | undefined): string {
  const raw = `${name ?? ''}-${academicYear ?? ''}`;
  let slug = raw
    .toLowerCase()
    // Collapse anything that isn't a-z / 0-9 into a single hyphen.
    .replace(/[^a-z0-9]+/g, '-')
    // Trim leading/trailing hyphens.
    .replace(/^-+|-+$/g, '');

  if (slug.length > MAX_LEN) {
    slug = slug.slice(0, MAX_LEN).replace(/-+$/g, '');
  }

  // Edge case: nothing slugifiable in the input (e.g., name was all CJK,
  // year was empty). Fall back to a stable random tag prefixed with "class"
  // so the result is still recognizable.
  if (slug.length < MIN_LEN || allHexLike(slug)) {
    const random = Math.random().toString(36).slice(2, 6);
    slug = `class-${random}`;
  }

  return slug;
}

// Returns a slug guaranteed-not-currently-taken by appending -2, -3, …
// until we find a free one. excludeClassId lets edit flows keep a class's
// own current slug (so re-saving without changing it doesn't 409).
export async function findUniqueSlug(
  base: string,
  excludeClassId?: string,
): Promise<string> {
  if (!isValidSlug(base)) {
    throw new Error(`Invalid slug "${base}"`);
  }

  // Trim space so adding a "-2" suffix doesn't push us past MAX_LEN.
  const root = base.length > MAX_LEN - 4 ? base.slice(0, MAX_LEN - 4).replace(/-+$/, '') : base;

  for (let n = 1; n < 1000; n++) {
    const candidate = n === 1 ? root : `${root}-${n}`;
    const conflict = await db
      .select({ id: classes.id })
      .from(classes)
      .where(
        excludeClassId
          ? and(eq(classes.slug, candidate), ne(classes.id, excludeClassId))
          : eq(classes.slug, candidate),
      )
      .limit(1);
    if (conflict.length === 0) return candidate;
  }
  throw new Error('Could not find a unique slug after 1000 attempts');
}

// True when `candidate` is currently free (or already belongs to the class
// identified by excludeClassId — i.e., the teacher saved without changing it).
export async function isSlugAvailable(
  candidate: string,
  excludeClassId?: string,
): Promise<boolean> {
  if (!isValidSlug(candidate)) return false;
  const rows = await db
    .select({ id: classes.id })
    .from(classes)
    .where(
      excludeClassId
        ? and(eq(classes.slug, candidate), ne(classes.id, excludeClassId))
        : eq(classes.slug, candidate),
    )
    .limit(1);
  return rows.length === 0;
}
