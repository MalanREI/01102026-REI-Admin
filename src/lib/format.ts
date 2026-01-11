export function prettyDate(d: string | Date) { const dt = typeof d === 'string' ? new Date(d) : d; return dt.toLocaleString(); }
