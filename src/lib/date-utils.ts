// Centralized date & timezone utilities for school schedule, streaks, and
// activity tracking. Defaults to 'Asia/Taipei' (UTC+8) for school hours.

export const APP_TIMEZONE = 'Asia/Taipei';

/**
 * Returns today's date string formatted as 'YYYY-MM-DD' in the given timezone.
 * Defaults to Asia/Taipei so midnight transitions match school day boundaries.
 */
export function getTodayDateString(timeZone: string = APP_TIMEZONE): string {
    const formatter = new Intl.DateTimeFormat('en-CA', {
        timeZone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
    });
    return formatter.format(new Date());
}

/**
 * Calculates whole integer calendar days between two 'YYYY-MM-DD' date strings.
 */
export function getDaysBetweenDates(earlierIso: string, laterIso: string): number {
    const earlier = new Date(earlierIso + 'T00:00:00Z');
    const later = new Date(laterIso + 'T00:00:00Z');
    return Math.floor((later.getTime() - earlier.getTime()) / (24 * 60 * 60 * 1000));
}

/**
 * Get date parts (year, month, day, weekday, hour) for a given instant in a timezone.
 */
function getTimeZoneParts(date: Date, timeZone: string) {
    const formatter = new Intl.DateTimeFormat('en-US', {
        timeZone,
        year: 'numeric',
        month: 'numeric',
        day: 'numeric',
        weekday: 'narrow',
        hour: 'numeric',
        minute: 'numeric',
        second: 'numeric',
        hour12: false,
    });
    const parts = formatter.formatToParts(date);
    const lookup: Record<string, string> = {};
    for (const p of parts) {
        lookup[p.type] = p.value;
    }
    return {
        year: parseInt(lookup.year, 10),
        month: parseInt(lookup.month, 10),
        day: parseInt(lookup.day, 10),
        hour: parseInt(lookup.hour, 10) % 24,
        minute: parseInt(lookup.minute, 10),
        second: parseInt(lookup.second, 10),
    };
}

/**
 * Constructs a Date representing midnight 00:00:00 on the Monday of the
 * current week in the specified timezone.
 */
export function getStartOfWeek(timeZone: string = APP_TIMEZONE): Date {
    const now = new Date();
    // Get the current local day of week and date in timeZone
    const parts = getTimeZoneParts(now, timeZone);
    // Find what day of week it is (0 = Sunday, 1 = Monday, ... 6 = Saturday)
    // using Intl day of week
    const dayOfWeekFormatter = new Intl.DateTimeFormat('en-US', { timeZone, weekday: 'short' });
    const dayOfWeekStr = dayOfWeekFormatter.format(now);
    const dayMap: Record<string, number> = {
        Sun: 0,
        Mon: 1,
        Tue: 2,
        Wed: 3,
        Thu: 4,
        Fri: 5,
        Sat: 6,
    };
    const day = dayMap[dayOfWeekStr] ?? 1;
    const diffToMonday = day === 0 ? 6 : day - 1;

    // Build the date string for Monday at 00:00:00 in the target timezone
    const mondayLocalDay = parts.day - diffToMonday;
    // Use an approximate local Date, then calculate offset
    const approx = new Date(Date.UTC(parts.year, parts.month - 1, mondayLocalDay, 0, 0, 0));
    // Determine the exact UTC timestamp when timeZone was at that local midnight
    return getMidnightInTimeZone(approx.getUTCFullYear(), approx.getUTCMonth() + 1, approx.getUTCDate(), timeZone);
}

/**
 * Constructs a Date representing midnight 00:00:00 on the 1st of the
 * current month in the specified timezone.
 */
export function getStartOfMonth(timeZone: string = APP_TIMEZONE): Date {
    const parts = getTimeZoneParts(new Date(), timeZone);
    return getMidnightInTimeZone(parts.year, parts.month, 1, timeZone);
}

/**
 * Constructs a Date representing midnight 00:00:00 N days ago in the specified timezone.
 */
export function getDaysAgo(days: number, timeZone: string = APP_TIMEZONE): Date {
    const parts = getTimeZoneParts(new Date(), timeZone);
    const approx = new Date(Date.UTC(parts.year, parts.month - 1, parts.day - days, 0, 0, 0));
    return getMidnightInTimeZone(approx.getUTCFullYear(), approx.getUTCMonth() + 1, approx.getUTCDate(), timeZone);
}

/**
 * Helper to compute the UTC instant corresponding to YYYY-MM-DD 00:00:00 in timeZone.
 */
function getMidnightInTimeZone(year: number, month: number, day: number, timeZone: string): Date {
    // For Asia/Taipei, offset is always UTC+8 (480 minutes).
    // Generic fallback: check difference between UTC and target timezone.
    const isoString = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}T00:00:00Z`;
    const utcMidnight = new Date(isoString);

    const tzParts = getTimeZoneParts(utcMidnight, timeZone);
    const tzAsUtc = Date.UTC(tzParts.year, tzParts.month - 1, tzParts.day, tzParts.hour, tzParts.minute, tzParts.second);
    const offsetMs = tzAsUtc - utcMidnight.getTime();

    // Adjust target date by the negative of offset
    return new Date(utcMidnight.getTime() - offsetMs);
}
