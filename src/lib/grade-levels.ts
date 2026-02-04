// Grade level constants and utilities
// Using numeric values: -1 = Pre-school, 0 = Kindergarten, 1-12 = Grades 1-12

export interface GradeLevel {
    value: number;
    label: string;
    shortLabel: string;
}

// Grade options from Pre-school through Grade 6 (can extend to 12 if needed)
export const GRADE_LEVELS: GradeLevel[] = [
    { value: -1, label: "Pre-school", shortLabel: "Pre-K" },
    { value: 0, label: "Kindergarten", shortLabel: "K" },
    { value: 1, label: "1st Grade", shortLabel: "1" },
    { value: 2, label: "2nd Grade", shortLabel: "2" },
    { value: 3, label: "3rd Grade", shortLabel: "3" },
    { value: 4, label: "4th Grade", shortLabel: "4" },
    { value: 5, label: "5th Grade", shortLabel: "5" },
    { value: 6, label: "6th Grade", shortLabel: "6" },
];

// Extended grade levels through Grade 8
export const GRADE_LEVELS_EXTENDED: GradeLevel[] = [
    ...GRADE_LEVELS,
    { value: 7, label: "7th Grade", shortLabel: "7" },
    { value: 8, label: "8th Grade", shortLabel: "8" },
];

// Just the numeric values for Pre-school through Grade 6
export const GRADE_VALUES = GRADE_LEVELS.map(g => g.value);

// Just the numeric values for Pre-school through Grade 8
export const GRADE_VALUES_EXTENDED = GRADE_LEVELS_EXTENDED.map(g => g.value);

/**
 * Format a grade level number for display
 * @param grade - The numeric grade level (-1 = Pre-school, 0 = K, 1+ = grades)
 * @param short - Whether to use short format (Pre-K, K, 1, 2...) or long (Pre-school, Kindergarten, 1st Grade...)
 */
export function formatGradeLevel(grade: number | null | undefined, short = false): string {
    if (grade === null || grade === undefined) return "—";

    const found = GRADE_LEVELS_EXTENDED.find(g => g.value === grade);
    if (found) {
        return short ? found.shortLabel : found.label;
    }

    // Handle grades beyond our predefined list
    if (grade > 8) {
        const suffix = grade === 11 ? "th" : grade === 12 ? "th" :
            grade % 10 === 1 ? "st" : grade % 10 === 2 ? "nd" :
                grade % 10 === 3 ? "rd" : "th";
        return short ? String(grade) : `${grade}${suffix} Grade`;
    }

    return String(grade);
}

/**
 * Format multiple grade levels for display
 * @param grades - Array of numeric grade levels
 * @param short - Whether to use short format
 */
export function formatGradeLevels(grades: number[] | null | undefined, short = false): string {
    if (!grades || grades.length === 0) return "—";

    const sorted = [...grades].sort((a, b) => a - b);
    return sorted.map(g => formatGradeLevel(g, short)).join(", ");
}
