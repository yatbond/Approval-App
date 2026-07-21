import readXlsxFile, { type CellValue } from "read-excel-file/node";

export const spreadsheetLimits = {
  maxFileBytes: 5 * 1024 * 1024,
  maxSheets: 20,
  maxRowsPerSheet: 5_000,
  maxColumnsPerSheet: 200,
  maxTotalCells: 100_000,
} as const;

export async function parseBoundedWorkbook(buffer: Buffer) {
  if (buffer.length > spreadsheetLimits.maxFileBytes) {
    throw new SpreadsheetLimitError("Spreadsheet exceeds the 5 MB limit.");
  }
  const workbook = await readXlsxFile(buffer);
  if (workbook.length > spreadsheetLimits.maxSheets) {
    throw new SpreadsheetLimitError(`Spreadsheet exceeds ${spreadsheetLimits.maxSheets} sheets.`);
  }

  let totalCells = 0;
  return workbook.map(({ sheet, data }) => {
    if (data.length > spreadsheetLimits.maxRowsPerSheet + 1) {
      throw new SpreadsheetLimitError(
        `${sheet} exceeds ${spreadsheetLimits.maxRowsPerSheet} data rows.`,
      );
    }
    const width = data.reduce((maximum, row) => Math.max(maximum, row.length), 0);
    if (width > spreadsheetLimits.maxColumnsPerSheet) {
      throw new SpreadsheetLimitError(
        `${sheet} exceeds ${spreadsheetLimits.maxColumnsPerSheet} columns.`,
      );
    }
    totalCells += data.reduce((count, row) => count + row.length, 0);
    if (totalCells > spreadsheetLimits.maxTotalCells) {
      throw new SpreadsheetLimitError(
        `Spreadsheet exceeds ${spreadsheetLimits.maxTotalCells} cells.`,
      );
    }
    const [headerRow = [], ...dataRows] = data;
    const headers = uniqueHeaders(headerRow, width);
    return {
      sheetName: sheet.slice(0, 200),
      rows: dataRows.map((row) => Object.fromEntries(
        headers.map((header, index) => [header, normalizeCell(row[index])]),
      )),
    };
  });
}

export class SpreadsheetLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SpreadsheetLimitError";
  }
}

function uniqueHeaders(headerRow: Array<CellValue | null>, width: number) {
  const seen = new Map<string, number>();
  return Array.from({ length: width }, (_, index) => {
    const base = String(normalizeCell(headerRow[index]) || `Column ${index + 1}`).slice(0, 200);
    const count = (seen.get(base) || 0) + 1;
    seen.set(base, count);
    return count === 1 ? base : `${base} (${count})`;
  });
}

function normalizeCell(value: CellValue | null | undefined) {
  if (value == null) return "";
  if (value instanceof Date) return value.toISOString();
  return value;
}
