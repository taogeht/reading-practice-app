"use client";

import React, { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Upload, FileSpreadsheet, AlertCircle, X, CheckCircle2 } from 'lucide-react';
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
                const workbook = XLSX.read(data, { type: 'array' });

                // Assume first sheet
                const firstSheetName = workbook.SheetNames[0];
                const worksheet = workbook.Sheets[firstSheetName];

                const jsonData = XLSX.utils.sheet_to_json(worksheet, { header: 1 }) as any[][];
                setSheetData(jsonData);

                // Find header rows. Assume Row 2 (index 1) has Book Names, Row 3 (index 2) has sub-headers like "Page" or "Unit"
                if (jsonData.length < 3) {
                    throw new Error("Spreadsheet doesn't have enough rows to identify headers.");
                }

                const headersRow = jsonData[1] || [];
                const subHeadersRow = jsonData[2] || [];

                let currentBookName = "";
                const columnsToMap: ExcelColumn[] = [];

                for (let c = 2; c < Math.max(headersRow.length, subHeadersRow.length); c++) {
                    const headerVal = headersRow[c]?.toString().trim();
                    if (headerVal) {
                        currentBookName = headerVal;
                    }

                    if (!currentBookName) continue;

                    const subHeaderVal = subHeadersRow[c]?.toString().trim().toLowerCase() || "";

                    if (subHeaderVal === 'page' || subHeaderVal === 'pages') {
                        columnsToMap.push({ bookName: currentBookName, colIndex: c });
                    } else if (subHeaderVal === '') {
                        if (!columnsToMap.find(col => col.bookName === currentBookName)) {
                            columnsToMap.push({ bookName: currentBookName, colIndex: c });
                        }
                    }
                }

                if (columnsToMap.length === 0) {
                    throw new Error("Could not detect any valid book columns starting from Column C.");
                }

                setColumnsFound(columnsToMap);
            } catch (err: any) {
                setError(err.message || 'Failed to parse the Excel file.');
                setFile(null);
                setColumnsFound([]);
            }
        };
        reader.readAsArrayBuffer(uploadedFile);
    };

    const handleMappingChange = (excelBookName: string, dbBookId: string) => {
        setMappings(prev => ({ ...prev, [excelBookName]: dbBookId === 'ignore' ? '' : dbBookId }));
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

            // Data usually starts at row 4 (index 3)
            for (let r = 3; r < sheetData.length; r++) {
                const row = sheetData[r];
                if (!row || row.length === 0) continue;

                const wkVal = row[0]?.toString().trim();
                if (!wkVal || isNaN(parseInt(wkVal))) {
                    // Stop or skip if no valid week number
                    continue;
                }
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
                        if (pageVal && pageVal !== "Review" && pageVal !== "Test") { // Optional filtering
                            assignments.push({ bookId: dbBookId, pages: pageVal });
                        }
                    }
                }

                weeks.push({
                    weekNumber,
                    title,
                    startDate: null,
                    endDate: null,
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
