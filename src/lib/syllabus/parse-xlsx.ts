import type { WorkBook } from 'xlsx';
import {
  FIXED_HEADERS,
  REQUIRED_HEADERS,
  bookColumnHeader,
  type BookForImport,
  type ParseResult,
  type ParsedWeek,
  type ParseWarning,
} from './types';

// Pure parser. Takes a parsed Workbook (you supply XLSX.read on either side)
// plus the class's books and returns weeks + warnings. No I/O. Runs identically
// in browser and Node so the preview and the server-side validation can share
// this exact code path.

interface SheetRow {
  [header: string]: unknown;
}

function toIsoDate(value: unknown, rowIndex: number, warnings: ParseWarning[]): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (value instanceof Date) {
    return value.toISOString().slice(0, 10);
  }
  // Excel often returns numeric serial dates when cellDates:false. The xlsx
  // option { cellDates: true } we use server- and client-side gives us Date
  // instances, but we still defend against the numeric fallback.
  if (typeof value === 'number') {
    // Excel epoch is 1899-12-30 for Windows files (1899-12-31 plus the famous
    // leap-year bug correction).
    const ms = (value - 25569) * 86400 * 1000;
    const d = new Date(ms);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  if (typeof value === 'string') {
    // Accept yyyy-mm-dd or mm/dd/yyyy or anything Date can parse.
    const trimmed = value.trim();
    const d = new Date(trimmed);
    if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
  }
  warnings.push({ rowIndex, message: `Couldn't parse date "${String(value)}"` });
  return null;
}

function toCleanString(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  const s = String(value).trim();
  return s.length > 0 ? s : null;
}

function toWeekNumber(
  value: unknown,
  rowIndex: number,
  warnings: ParseWarning[],
): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : parseInt(String(value), 10);
  if (!Number.isFinite(n) || n < 0 || n > 1000) {
    warnings.push({ rowIndex, message: `Invalid Week number "${String(value)}"` });
    return null;
  }
  return n;
}

export function parseSyllabusSheet(workbook: WorkBook, books: BookForImport[]): ParseResult {
  // Pull the first sheet — teachers often rename the default tab. We support
  // any single-sheet workbook.
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  if (!sheet) {
    return {
      weeks: [],
      warnings: [{ rowIndex: 0, message: 'No sheet found in workbook' }],
      expectedHeaders: [],
      foundHeaders: [],
    };
  }

  // Lazy-import xlsx utils so this module stays usable without ahead-of-time
  // bundling. Both the client (Webpack) and server (Node) resolve this fine.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const XLSX = require('xlsx') as typeof import('xlsx');

  const rows = XLSX.utils.sheet_to_json<SheetRow>(sheet, { defval: null, raw: false });
  const headerRow: SheetRow | undefined = rows[0];
  const foundHeaders = headerRow ? Object.keys(headerRow) : [];

  const expectedHeaders = [
    FIXED_HEADERS.week,
    FIXED_HEADERS.title,
    FIXED_HEADERS.startDate,
    FIXED_HEADERS.endDate,
    ...books.map((b) => bookColumnHeader(b.title)),
    FIXED_HEADERS.vocabulary,
    FIXED_HEADERS.spellingTest,
    FIXED_HEADERS.grammarTest,
    FIXED_HEADERS.homework,
  ];

  const warnings: ParseWarning[] = [];
  const weeks: ParsedWeek[] = [];
  const seenWeekNumbers = new Set<number>();

  // Build a lookup from book column header → bookId so we can map cells.
  const headerToBookId = new Map<string, string>();
  for (const b of books) {
    headerToBookId.set(bookColumnHeader(b.title), b.id);
  }

  // Required headers must exist; bail loudly if they don't.
  const missingRequired = REQUIRED_HEADERS.filter(
    (h) => !rows.some((r) => Object.prototype.hasOwnProperty.call(r, h)),
  );
  if (missingRequired.length > 0) {
    warnings.push({
      rowIndex: -1,
      message: `Missing required column${missingRequired.length === 1 ? '' : 's'}: ${missingRequired.join(', ')}`,
    });
    return { weeks: [], warnings, expectedHeaders, foundHeaders };
  }

  rows.forEach((row, index) => {
    const weekNumber = toWeekNumber(row[FIXED_HEADERS.week], index, warnings);
    const startIso = toIsoDate(row[FIXED_HEADERS.startDate], index, warnings);
    const endIso = toIsoDate(row[FIXED_HEADERS.endDate], index, warnings);

    // Skip empty trailing rows silently.
    if (weekNumber === null && !startIso && !endIso) {
      return;
    }
    if (weekNumber === null) {
      warnings.push({ rowIndex: index, message: 'Missing Week number' });
      return;
    }
    if (!startIso || !endIso) {
      warnings.push({ rowIndex: index, message: `Week ${weekNumber} missing start or end date` });
      return;
    }
    if (seenWeekNumbers.has(weekNumber)) {
      warnings.push({ rowIndex: index, message: `Week ${weekNumber} appears more than once` });
      return;
    }
    seenWeekNumbers.add(weekNumber);

    // Pages columns — one per book. Empty cell = book not used this week.
    const assignments: ParsedWeek['assignments'] = [];
    for (const [header, bookId] of headerToBookId) {
      const pages = toCleanString(row[header]);
      if (pages) assignments.push({ bookId, pages });
    }

    weeks.push({
      weekNumber,
      title: toCleanString(row[FIXED_HEADERS.title]),
      startDate: startIso,
      endDate: endIso,
      assignments,
      vocabulary: toCleanString(row[FIXED_HEADERS.vocabulary]),
      spellingTestInfo: toCleanString(row[FIXED_HEADERS.spellingTest]),
      grammarTestInfo: toCleanString(row[FIXED_HEADERS.grammarTest]),
      homework: toCleanString(row[FIXED_HEADERS.homework]),
    });
  });

  weeks.sort((a, b) => a.weekNumber - b.weekNumber);

  return { weeks, warnings, expectedHeaders, foundHeaders };
}
