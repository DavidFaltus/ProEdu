import readXlsxFile, { readSheet } from 'read-excel-file/universal';
import writeXlsxFile from 'write-excel-file/universal';
import type { Cell, Row, Sheet } from 'write-excel-file/universal';

export interface ExcelSheetSpec {
  name: string;
  headers: string[];
  rows: Array<Array<string | number | boolean | null | undefined>>;
  colWidths?: number[];
}

const XLSX_MIME_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
const FORBIDDEN_HEADER_KEYS = new Set(['__proto__', 'constructor', 'prototype']);

function sanitizeSheetName(name: string, index: number): string {
  const cleaned = String(name || '')
    .replace(/[:\\/?*[\]]/g, ' ')
    .trim()
    .slice(0, 31);
  return cleaned || `Sheet${index + 1}`;
}

function toSafeWriteString(raw: string): string {
  // Work around write-excel-file's plain-object sharedStrings map colliding with Object.prototype keys
  if (raw === '__proto__' || Object.prototype.hasOwnProperty.call(Object.prototype, raw)) {
    return `${raw} `;
  }
  return raw;
}

function toWriteCell(value: string | number | boolean | null | undefined): Cell {
  if (value === null || value === undefined || value === '') {
    return null;
  }
  if (typeof value === 'number') {
    return Number.isFinite(value) ? { value, type: Number } : null;
  }
  if (typeof value === 'boolean') {
    return { value, type: Boolean };
  }
  return { value: toSafeWriteString(String(value)), type: String };
}

function rowsToRecords(sheetRows: ReadonlyArray<ReadonlyArray<unknown>>): Record<string, unknown>[] {
  if (!sheetRows || sheetRows.length === 0) {
    return [];
  }

  const headerRow = sheetRows[0] ?? [];
  const columns: Array<{ index: number; key: string }> = [];
  const seenKeys = new Set<string>();

  for (let i = 0; i < headerRow.length; i++) {
    const rawHeader = headerRow[i];
    if (rawHeader === null || rawHeader === undefined) continue;
    const key = String(rawHeader).trim();
    if (!key || FORBIDDEN_HEADER_KEYS.has(key) || seenKeys.has(key)) continue;
    seenKeys.add(key);
    columns.push({ index: i, key });
  }

  if (columns.length === 0) {
    return [];
  }

  const records: Record<string, unknown>[] = [];
  for (let r = 1; r < sheetRows.length; r++) {
    const row = sheetRows[r] ?? [];
    const hasAnyValue = row.some(
      (cell) => cell !== null && cell !== undefined && String(cell) !== ''
    );
    if (!hasAnyValue) {
      continue;
    }

    const record: Record<string, unknown> = {};
    for (const { index, key } of columns) {
      const cell = index < row.length ? row[index] : null;
      record[key] = cell === null || cell === undefined ? '' : cell;
    }
    records.push(record);
  }

  return records;
}

export async function readExcelFirstSheetRows(
  input: ArrayBuffer | Uint8Array,
  preferredSheetMatcher?: (sheetName: string) => boolean
): Promise<Record<string, unknown>[]> {
  if (preferredSheetMatcher) {
    const sheets = await readXlsxFile(input);
    if (!sheets || sheets.length === 0) {
      return [];
    }
    const targetSheet = sheets.find((s) => preferredSheetMatcher(s.sheet)) ?? sheets[0];
    return rowsToRecords(targetSheet.data);
  }

  const sheetData = await readSheet(input);
  return rowsToRecords(sheetData);
}

export async function writeExcelWorkbookBuffer(sheets: ExcelSheetSpec[]): Promise<Uint8Array> {
  if (!Array.isArray(sheets) || sheets.length === 0) {
    throw new Error('At least one worksheet specification is required.');
  }

  const writeSheets: Sheet<Blob>[] = sheets.map((spec, idx) => {
    const headerRow: Row = spec.headers.map((header) => ({
      value: toSafeWriteString(String(header ?? '')),
      type: String,
    }));
    const dataRows: Row[] = spec.rows.map((row) =>
      spec.headers.map((_, colIdx) => toWriteCell(colIdx < row.length ? row[colIdx] : null))
    );

    const sheetObj: Sheet<Blob> = {
      sheet: sanitizeSheetName(spec.name, idx),
      data: [headerRow, ...dataRows],
    };

    if (spec.colWidths && spec.colWidths.length > 0) {
      sheetObj.columns = spec.colWidths.map((w) => ({
        width: Math.max(1, Math.round(w)),
      }));
    }

    return sheetObj;
  });

  const blob = await writeXlsxFile(writeSheets).toBlob();
  const arrayBuffer = await blob.arrayBuffer();
  return new Uint8Array(arrayBuffer);
}

export async function downloadExcelWorkbook(
  filename: string,
  sheets: ExcelSheetSpec[]
): Promise<void> {
  if (typeof document === 'undefined' || typeof URL === 'undefined') {
    throw new Error('Excel file download is only supported in a browser environment.');
  }

  const bytes = await writeExcelWorkbookBuffer(sheets);
  const blob = new Blob([bytes], { type: XLSX_MIME_TYPE });
  const objectUrl = URL.createObjectURL(blob);

  try {
    const link = document.createElement('a');
    link.href = objectUrl;
    link.download = filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`;
    link.rel = 'noopener noreferrer';
    link.style.display = 'none';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } finally {
    setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
  }
}
