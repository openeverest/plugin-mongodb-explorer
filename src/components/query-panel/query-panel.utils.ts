import type { MongoDocument } from 'api/explorer.types';

const MAX_COLUMNS = 12;

export function formatCellValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'object') return JSON.stringify(value);
  return String(value);
}

export function formatDetailValue(value: unknown): string {
  return typeof value === 'object' && value !== null ? JSON.stringify(value, null, 2) : formatCellValue(value);
}

// Documents are schemaless, so columns are the first distinct keys across all results.
export function resultColumns(documents: MongoDocument[]): string[] {
  return Array.from(new Set(documents.flatMap((doc) => Object.keys(doc)))).slice(0, MAX_COLUMNS);
}
