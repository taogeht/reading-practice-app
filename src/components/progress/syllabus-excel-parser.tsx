"use client";

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, AlertCircle, X, CheckCircle2, Calendar } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';

export interface ParsedWeek {
    weekNumber: number;
    title: string;
    startDate: string | null;
    endDate: string | null;
    assignments: { bookId: string; pages: string }[];
}

interface SyllabusExcelParserProps {
    books: { id: string; name: string }[];
    onImport: (weeks: ParsedWeek[]) => Promise<void>;
    onCancel: () => void;
}

interface ExcelColumn {
    colIndex: number;
    bookName: string;
}

export function SyllabusExcelParser({ books, onImport, onCancel }: SyllabusExcelParserProps) {
    const [file, setFile] = useState<File | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [isProcessing, setIsProcessing] = useState(false);
    const [columnsFound, setColumnsFound] = useState<ExcelColumn[]>([]);
    const [sheetData, setSheetData] = useState<any[][]>([]);
    const [mappings, setMappings] = useState<Record<string, string>>({}); // Excel Book Name -> DB Book ID
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
        const selectedFile = e.target.files?.[0];
        if (!selectedFile) return;

        setFile(selectedFile);
        setError(null);
        processExcel(selectedFile);
    };

    const processExcel = (uploadedFile: File) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                const data = new Uint8Array(e.target?.result as ArrayBuffer);
                // raw: false ensures dates or numbers like "4-7" don't become float math
                const workbook = XLSX.read(data, { type: 'array', cellDates: true, dateNF: 'yyyy-mm-dd' });

                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                // Get everything as strings so page ranges "4-7" don't turn into Excel dates (e.g. 46119)
                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1, raw: false }) as string[][];
                setSheetData(jsonData);

                if (jsonData.length < 3) {
                    throw new Error("Spreadsheet doesn't have enough rows to identify headers.");
                }

                // Find the header row by looking for "Wk" or "Week" in the first column
                let headerRowIndex = 0;
                for (let i = 0; i < Math.min(10, jsonData.length); i++) {
                    const firstCol = jsonData[i]?.[0]?.toString().trim().toLowerCase();
                    if (firstCol === 'wk' || firstCol === 'week' || firstCol === 'week no') {
                        headerRowIndex = i;
                        break;
                    }
                }

                const bookNamesRow = jsonData[headerRowIndex] || [];
                const subHeadersRow = jsonData[headerRowIndex + 1] || [];

                let currentBookName = "";
                const columnsToMap: ExcelColumn[] = [];

                // Books usually start at Column C (index 2)
                const isPageSubheader = (val: string) => ['page', 'pages', 'p.', 'p'].includes(val);
                const isUnitSubheader = (val: string) => ['unit', 'units', 'u.', 'u'].includes(val);
                const maxCol = Math.max(bookNamesRow.length, subHeadersRow.length, 10);
                for (let c = 2; c < maxCol; c++) {
                    const rawBookName = bookNamesRow[c]?.toString().trim();
                    if (rawBookName) {
                        currentBookName = rawBookName.replace(/\n/g, ' ').replace(/\s+/g, ' ');
                    }

                    if (!currentBookName) continue;

                    const subHeaderVal = subHeadersRow[c]?.toString().trim().toLowerCase() || "";

                    // If subheader explicitly says "Page", always use this column.
                    // If a non-page column was already added for this book (e.g. "Unit"), replace it.
                    if (isPageSubheader(subHeaderVal)) {
                        const existingIdx = columnsToMap.findIndex(col => col.bookName === currentBookName);
                        if (existingIdx !== -1) {
                            // Replace the fallback (Unit) column with the explicit Page column
                            columnsToMap[existingIdx] = { bookName: currentBookName, colIndex: c };
                        } else {
                            columnsToMap.push({ bookName: currentBookName, colIndex: c });
                        }
                    } else if (isUnitSubheader(subHeaderVal)) {
                        // Only add Unit column if there's no mapping for this book yet.
                        // It will be replaced if a Page column is found later.
                        const existingForBook = columnsToMap.find(col => col.bookName === currentBookName);
                        if (!existingForBook) {
                            columnsToMap.push({ bookName: currentBookName, colIndex: c });
                        }
                    } else {
                        // No subheader or unknown subheader — use this column if no mapping exists yet.
                        // Ignore columns explicitly named "Theme" or "Topic".
                        const existingForBook = columnsToMap.find(col => col.bookName === currentBookName);
                        if (!existingForBook && currentBookName.toLowerCase() !== 'theme' && currentBookName.toLowerCase() !== 'topic') {
                            columnsToMap.push({ bookName: currentBookName, colIndex: c });
                        }
                    }
                }

                if (columnsToMap.length === 0) {
                    throw new Error("Could not detect any valid book columns starting from Column C.");
                }

                setColumnsFound(columnsToMap);
            } catch (err: any) {
                console.error(err);
                setError(err.message || 'Failed to parse the Excel file.');
                setFile(null);
                setColumnsFound([]);
            }
        };
        reader.readAsArrayBuffer(uploadedFile);
    };

    const [week1StartDate, setWeek1StartDate] = useState<string>(''); // YYYY-MM-DD

    const handleMappingChange = (excelBookName: string, dbBookId: string) => {
        setMappings(prev => ({ ...prev, [excelBookName]: dbBookId === 'ignore' ? '' : dbBookId }));
    };

    // Given a YYYY-MM-DD string for Week 1's Monday, return { startDate, endDate }
    // for any weekNumber (1-based). Handles it in UTC to avoid timezone shifts.
    const computeWeekDates = (week1Monday: string, weekNumber: number): { startDate: string; endDate: string } => {
        const [y, m, d] = week1Monday.split('-').map(Number);
        const base = new Date(Date.UTC(y, m - 1, d)); // Monday of week 1
        const offsetDays = (weekNumber - 1) * 7;
        const monday = new Date(base.getTime() + offsetDays * 86400000);
        const friday = new Date(monday.getTime() + 4 * 86400000);
        const fmt = (dt: Date) => dt.toISOString().split('T')[0];
        return { startDate: fmt(monday), endDate: fmt(friday) };
    };

    // Parse date ranges like "02/23-02/26" or "03/30-04/02" from column B.
    // Detects the year from header rows (e.g. "(2026/02/23 ~ 2026/06/30)") or falls back to current year.
    const parseDateRange = (dateVal: string, data: any[][]): { startDate: string; endDate: string } | null => {
        if (!dateVal) return null;
        // Match patterns like "02/23-02/26", "03/30-04/02"
        const match = dateVal.match(/^(\d{1,2})\/(\d{1,2})\s*-\s*(\d{1,2})\/(\d{1,2})$/);
        if (!match) return null;

        // Try to detect year from header rows (look for a year pattern like "2026/..." in first few rows)
        let year = new Date().getFullYear();
        for (let r = 0; r < Math.min(5, data.length); r++) {
            for (let c = 0; c < (data[r]?.length || 0); c++) {
                const cell = data[r]?.[c]?.toString() || '';
                const yearMatch = cell.match(/\b(20\d{2})\//);
                if (yearMatch) {
                    year = parseInt(yearMatch[1]);
                    break;
                }
            }
            if (year !== new Date().getFullYear()) break;
        }

        const [, sm, sd, em, ed] = match.map(Number);
        // Handle year rollover (e.g. start in Dec, end in Jan)
        const startYear = year;
        const endYear = em < sm ? year + 1 : year;
        const fmt = (y: number, m: number, d: number) =>
            `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
        return {
            startDate: fmt(startYear, sm, sd),
            endDate: fmt(endYear, em, ed),
        };
    };

    const handleImport = async () => {
        if (Object.values(mappings).every(val => !val)) {
            setError("Please map at least one column to a book.");
            return;
        }

        setIsProcessing(true);
        setError(null);

        try {
            const weeks: ParsedWeek[] = [];

            // Find where the actual data starts (the first row with a number 1 in column 0)
            let dataStartRow = 1;
            for (let r = 0; r < Math.min(10, sheetData.length); r++) {
                const wkVal = sheetData[r][0]?.trim();
                if (wkVal === '1' || wkVal === 1) {
                    dataStartRow = r;
                    break;
                }
            }

            for (let r = dataStartRow; r < sheetData.length; r++) {
                const row = sheetData[r];
                if (!row || row.length === 0) continue;

                const wkVal = row[0]?.toString().trim();
                if (!wkVal || isNaN(parseInt(wkVal))) continue; // Skip non-week rows

                const weekNumber = parseInt(wkVal);
                const dateVal = row[1]?.toString().trim() || "";
                let title = `Week ${weekNumber}`;
                if (dateVal) title += ` (${dateVal})`;

                const assignments: { bookId: string, pages: string }[] = [];

                // Apply mappings
                for (const col of columnsFound) {
                    const dbBookId = mappings[col.bookName];
                    if (dbBookId) {
                        const pageVal = row[col.colIndex]?.toString().trim();
                        // Ignore empty, Review, Test, etc.
                        if (pageVal && !['review', 'test', 'mid term'].includes(pageVal.toLowerCase())) {
                            assignments.push({ bookId: dbBookId, pages: pageVal });
                        }
                    }
                }

                // Parse dates: prefer actual dates from column B (e.g. "02/23-02/26"),
                // fall back to computed dates from Week 1 start date picker
                let startDate: string | null = null;
                let endDate: string | null = null;
                const parsedDates = parseDateRange(dateVal, sheetData);
                if (parsedDates) {
                    startDate = parsedDates.startDate;
                    endDate = parsedDates.endDate;
                } else if (week1StartDate) {
                    const dates = computeWeekDates(week1StartDate, weekNumber);
                    startDate = dates.startDate;
                    endDate = dates.endDate;
                }

                weeks.push({
                    weekNumber,
                    title,
                    startDate,
                    endDate,
                    assignments
                });
            }

            await onImport(weeks);
        } catch (err: any) {
            setError(err.message || "Failed to generate import data.");
            setIsProcessing(false);
        }
    };


    if (!file || columnsFound.length === 0) {
        return (
            <Card className="border-dashed bg-muted/30">
                <CardContent className="flex flex-col items-center justify-center py-10">
                    <FileSpreadsheet className="h-12 w-12 text-muted-foreground mb-4" />
                    <h3 className="text-lg font-medium mb-2">Import from Excel</h3>
                    <p className="text-sm text-muted-foreground text-center max-w-md mb-6">
                        Upload your syllabus spreadsheet (.xlsx or .xls). Ensure it follows the template format with 'Wk' in Column A and books starting in Column C.
                    </p>

                    <input
                        type="file"
                        ref={fileInputRef}
                        className="hidden"
                        accept=".xlsx, .xls, application/vnd.openxmlformats-officedocument.spreadsheetml.sheet, application/vnd.ms-excel"
                        onChange={handleFileUpload}
                    />

                    <div className="flex gap-4">
                        <Button variant="outline" onClick={onCancel}>Cancel</Button>
                        <Button onClick={() => fileInputRef.current?.click()}>
                            <Upload className="mr-2 h-4 w-4" /> Select Excel File
                        </Button>
                    </div>

                    {error && (
                        <Alert variant="destructive" className="mt-6 max-w-md">
                            <AlertCircle className="h-4 w-4" />
                            <AlertDescription>{error}</AlertDescription>
                        </Alert>
                    )}
                </CardContent>
            </Card>
        );
    }

    return (
        <Card className="border-primary/20 shadow-md">
            <CardHeader className="bg-primary/5 pb-4 border-b">
                <div className="flex justify-between items-start">
                    <div>
                        <CardTitle className="flex items-center text-lg">
                            <CheckCircle2 className="mr-2 h-5 w-5 text-green-500" />
                            File Parsed Successfully
                        </CardTitle>
                        <CardDescription className="mt-1">
                            Found {columnsFound.length} valid book columns in <strong>{file.name}</strong>. Map them below to your actual class books.
                        </CardDescription>
                    </div>
                    <Button variant="ghost" size="icon" onClick={() => setFile(null)}>
                        <X className="h-4 w-4" />
                    </Button>
                </div>
            </CardHeader>

            <CardContent className="pt-6 space-y-6">
                {error && (
                    <Alert variant="destructive">
                        <AlertCircle className="h-4 w-4" />
                        <AlertDescription>{error}</AlertDescription>
                    </Alert>
                )}

                {/* Date anchor */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 space-y-3">
                    <div className="flex items-start gap-3">
                        <Calendar className="h-5 w-5 text-blue-600 mt-0.5 shrink-0" />
                        <div className="flex-1">
                            <p className="font-medium text-blue-900 text-sm">Week 1 Start Date <span className="font-normal text-blue-600">(fallback)</span></p>
                            <p className="text-xs text-blue-700 mt-0.5">
                                If the spreadsheet has date ranges in column B (e.g. &quot;02/23-02/26&quot;), those will be used automatically.
                                Otherwise, pick the Monday that Week 1 begins to compute Mon–Fri dates for each week.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-3 flex-wrap">
                        <Input
                            type="date"
                            className="w-44 h-9 text-sm bg-white"
                            value={week1StartDate}
                            onChange={e => setWeek1StartDate(e.target.value)}
                        />
                        {week1StartDate && (() => {
                            const [y, m, d] = week1StartDate.split('-').map(Number);
                            const mon = new Date(Date.UTC(y, m - 1, d));
                            const fri = new Date(mon.getTime() + 4 * 86400000);
                            const fmt = (dt: Date) => dt.toLocaleDateString('en-US', { month: 'short', day: 'numeric', timeZone: 'UTC' });
                            return (
                                <span className="text-sm text-blue-800 font-medium">
                                    Week 1: {fmt(mon)} – {fmt(fri)}
                                </span>
                            );
                        })()}
                    </div>
                </div>

                <div className="space-y-4">

                    <div className="grid grid-cols-2 gap-4 pb-2 border-b font-medium text-sm text-muted-foreground">
                        <div>Column Header in Excel</div>
                        <div>Database Book Match</div>
                    </div>

                    {columnsFound.map((col, idx) => (
                        <div key={idx} className="grid grid-cols-2 gap-4 items-center">
                            <Label className="text-base truncate" title={col.bookName}>{col.bookName}</Label>
                            <Select
                                value={mappings[col.bookName] || "ignore"}
                                onValueChange={(val) => handleMappingChange(col.bookName, val)}
                            >
                                <SelectTrigger>
                                    <SelectValue placeholder="Select a book..." />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="ignore" className="text-muted-foreground italic">-- Ignore this column --</SelectItem>
                                    {books.map(b => (
                                        <SelectItem key={b.id} value={b.id}>{b.name}</SelectItem>
                                    ))}
                                </SelectContent>
                            </Select>
                        </div>
                    ))}
                </div>

                <Alert className="bg-blue-50 text-blue-800 border-blue-200">
                    <AlertCircle className="h-4 w-4 text-blue-600" />
                    <AlertDescription>
                        Importing will <strong>overwrite and replace</strong> any existing syllabus weeks you have created for this class.
                    </AlertDescription>
                </Alert>

                <div className="flex justify-end gap-3 pt-4 border-t">
                    <Button variant="outline" onClick={() => setFile(null)} disabled={isProcessing}>
                        Start Over
                    </Button>
                    <Button onClick={handleImport} disabled={isProcessing} className="bg-green-600 hover:bg-green-700">
                        {isProcessing ? "Importing..." : "Run Bulk Import"}
                    </Button>
                </div>
            </CardContent>
        </Card>
    );
}
