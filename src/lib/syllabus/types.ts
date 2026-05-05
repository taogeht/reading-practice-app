// Shared shapes for the syllabus import. Used by both the client-side parser
// (so the preview matches what the server expects) and the server-side
// importer.

export interface BookForImport {
  id: string;
  title: string;
}

export interface ParsedAssignment {
  bookId: string;
  pages: string;
}

export interface ParsedWeek {
  weekNumber: number;
  title: string | null;
  startDate: string; // ISO yyyy-mm-dd
  endDate: string;   // ISO yyyy-mm-dd
  assignments: ParsedAssignment[];
  vocabulary: string | null;
  spellingTestInfo: string | null;
  grammarTestInfo: string | null;
  homework: string | null;
}

export interface ParseWarning {
  rowIndex: number; // 0-based, excluding header row
  message: string;
}

export interface ParseResult {
  weeks: ParsedWeek[];
  warnings: ParseWarning[];
  // The exact column headers we expected (computed from the class's books) and
  // the column headers we found. The dialog renders unmatched headers in the
  // preview as a heads-up.
  expectedHeaders: string[];
  foundHeaders: string[];
}

// Fixed columns the parser always looks for. Book columns are added on top of
// these dynamically based on the class's books.
export const FIXED_HEADERS = {
  week: 'Week',
  title: 'Title',
  startDate: 'Start Date',
  endDate: 'End Date',
  vocabulary: 'Vocabulary',
  spellingTest: 'Spelling Test',
  grammarTest: 'Grammar Test',
  homework: 'Homework',
} as const;

export const REQUIRED_HEADERS = [
  FIXED_HEADERS.week,
  FIXED_HEADERS.startDate,
  FIXED_HEADERS.endDate,
] as const;

export function bookColumnHeader(bookTitle: string): string {
  return `Pages: ${bookTitle}`;
}
