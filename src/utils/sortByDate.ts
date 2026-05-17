/**
 * Parses "Mon YYYY" (e.g. "Feb 2026") into a timestamp for sorting.
 * Falls back to 0 for unparseable dates so they sink to the bottom.
 */
const MONTHS: Record<string, number> = {
    jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5,
    jul: 6, aug: 7, sep: 8, oct: 9, nov: 10, dec: 11,
};

export function parseDateStr(dateStr: string): number {
    const parts = dateStr.trim().split(/\s+/);
    if (parts.length < 2) return 0;

    const month = MONTHS[parts[0].toLowerCase().slice(0, 3)];
    const year = parseInt(parts[1], 10);

    if (month === undefined || isNaN(year)) return 0;
    return new Date(year, month).getTime();
}

export function sortByDateDesc<T extends { date: string }>(items: T[]): T[] {
    return [...items].sort((a, b) => parseDateStr(b.date) - parseDateStr(a.date));
}