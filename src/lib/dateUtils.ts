import { parseISO as dateFnsParseISO, isValid, format } from 'date-fns';

export function safeParseISO(dateVal: any) {
  if (!dateVal) return new Date();
  if (dateVal instanceof Date) return dateVal;
  if (typeof dateVal === 'object' && dateVal.toDate) return dateVal.toDate(); // Firestore Timestamp
  if (typeof dateVal === 'object' && dateVal.seconds) return new Date(dateVal.seconds * 1000);
  try {
    const parsed = dateFnsParseISO(String(dateVal));
    if (isValid(parsed)) return parsed;
  } catch (e) {}
  return new Date();
}

export function safeFormat(dateVal: any, formatStr: string) {
  try {
    return format(safeParseISO(dateVal), formatStr);
  } catch (e) {
    return '';
  }
}

/** Formats full date, hour, minute, and second: "Aug 21, 2026, 02:15:32 AM" */
export function formatExactTimestamp(dateVal: any): string {
  if (!dateVal) return 'Never';
  try {
    return format(safeParseISO(dateVal), 'MMM d, yyyy, hh:mm:ss a');
  } catch (e) {
    return 'Invalid Date';
  }
}

/** Formats time with seconds: "02:15:32 AM" */
export function formatTimeWithSeconds(dateVal: any): string {
  if (!dateVal) return 'Never';
  try {
    return format(safeParseISO(dateVal), 'hh:mm:ss a');
  } catch (e) {
    return '--:--:--';
  }
}

/** Formats concise date + seconds: "Aug 21, 02:15:32 AM" */
export function formatShortTimestampWithSeconds(dateVal: any): string {
  if (!dateVal) return 'Never';
  try {
    return format(safeParseISO(dateVal), 'MMM d, hh:mm:ss a');
  } catch (e) {
    return '--:--:--';
  }
}

