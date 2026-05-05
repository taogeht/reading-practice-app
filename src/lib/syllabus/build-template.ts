import * as XLSX from 'xlsx';
import {
  FIXED_HEADERS,
  bookColumnHeader,
  type BookForImport,
} from './types';

// Produces a fresh .xlsx workbook with the syllabus header row and a couple
// of example weeks already filled in so the teacher has a visual cue. Returns
// the workbook as a Buffer the caller can stream as a download response.

export function buildSyllabusTemplate(opts: {
  className: string;
  books: BookForImport[];
}): Buffer {
  const headers: string[] = [
    FIXED_HEADERS.week,
    FIXED_HEADERS.title,
    FIXED_HEADERS.startDate,
    FIXED_HEADERS.endDate,
    ...opts.books.map((b) => bookColumnHeader(b.title)),
    FIXED_HEADERS.vocabulary,
    FIXED_HEADERS.spellingTest,
    FIXED_HEADERS.grammarTest,
    FIXED_HEADERS.homework,
  ];

  // Two rows of guidance/example so the teacher sees the format without
  // copying from docs.
  const example1: (string | null)[] = [
    '1', // Week
    '', // Title
    '2026-09-01',
    '2026-09-05',
    ...opts.books.map((_, i) => (i === 0 ? '12-15' : '')),
    'cat, dog, bird',
    'Fri — animals list',
    '',
    'Workbook p.20', // homework optional — leave blank to fill weekly
  ];
  const example2: (string | null)[] = [
    '2',
    '',
    '2026-09-08',
    '2026-09-12',
    ...opts.books.map((_, i) => (i === 0 ? '16-19' : '')),
    'run, jump, swim',
    '',
    'Mon — present tense',
    '',
  ];

  const aoa: (string | null)[][] = [headers, example1, example2];
  const sheet = XLSX.utils.aoa_to_sheet(aoa);

  // Generous column widths so headers like "Pages: Family and Friends 1" don't
  // truncate when the teacher opens the file.
  sheet['!cols'] = headers.map((h) => ({ wch: Math.max(h.length + 2, 14) }));

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, sheet, opts.className.slice(0, 31) || 'Syllabus');

  const out = XLSX.write(workbook, { bookType: 'xlsx', type: 'buffer' });
  return out as Buffer;
}
