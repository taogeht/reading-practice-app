import {
  ANIMALS,
  OBJECTS,
  type VisualPasswordOption,
} from '@/components/auth/visual-password-options';

export type LoginCardLayout = 'double_sided' | 'qr' | 'passcode';

export interface StudentCardData {
  id: string;
  firstName: string;
  lastName: string;
  loginToken: string | null;
  visualPasswordType: 'animal' | 'object' | null;
  visualPasswordData: { animal?: string; object?: string } | null;
}

export interface ClassCardData {
  id: string;
  name: string;
  slug: string | null;
}

export interface RenderLoginCardsHtmlOptions {
  classData: ClassCardData;
  students: StudentCardData[];
  baseUrl: string;
  layout: LoginCardLayout;
}

export function lookupPasswordOption(student: StudentCardData): VisualPasswordOption | null {
  const data = student.visualPasswordData;
  if (!data) return null;
  if (student.visualPasswordType === 'animal' && data.animal) {
    return ANIMALS.find((o) => o.id === data.animal) ?? null;
  }
  if (student.visualPasswordType === 'object' && data.object) {
    return OBJECTS.find((o) => o.id === data.object) ?? null;
  }
  return null;
}

/**
 * Pairs a 4-student chunk into front and back grid layouts.
 * Front:
 *   [S0, S1]
 *   [S2, S3]
 * Back (horizontally mirrored for flip on long edge / book style duplex):
 *   [S1, S0]
 *   [S3, S2]
 */
export function buildDuplexCardGrid(chunk: (StudentCardData | null)[]): {
  front: (StudentCardData | null)[];
  back: (StudentCardData | null)[];
} {
  const s0 = chunk[0] ?? null;
  const s1 = chunk[1] ?? null;
  const s2 = chunk[2] ?? null;
  const s3 = chunk[3] ?? null;

  return {
    front: [s0, s1, s2, s3],
    back: [s1, s0, s3, s2],
  };
}

/**
 * Splits a list of students into chunks of 4 (for 2x2 grid per letter/A4 sheet).
 */
export function chunkStudents<T>(items: T[], chunkSize = 4): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    chunks.push(items.slice(i, i + chunkSize));
  }
  return chunks;
}
