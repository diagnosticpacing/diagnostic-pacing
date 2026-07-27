import * as XLSX from "xlsx";
import {
  sheetDefinitions,
  type SheetId,
  type SpreadsheetRow,
} from "./model";

type WorkbookSheets = Record<SheetId, SpreadsheetRow[]>;

const sheetOrder: SheetId[] = [
  "clinicalTerms",
  "diagnoses",
  "maneuverDefinitions",
  "maneuverResponseFields",
  "maneuverResponseOptions",
  "clinicalReasoning",
  "references",
];

const worksheetNames: Record<SheetId, string> = {
  clinicalTerms: "Clinical Terms",
  diagnoses: "Diagnoses",
  maneuverDefinitions: "Maneuver Definitions",
  maneuverResponseFields: "Response Fields",
  maneuverResponseOptions: "Response Options",
  clinicalReasoning: "Clinical Reasoning",
  references: "References",
};

const getColumnWidth = (
  label: string,
  key: string,
  rows: SpreadsheetRow[],
) => {
  const longestCell = rows.reduce((longest, row) => {
    const value = String(row[key] ?? "");
    const longestLine = value
      .split(/\r?\n/)
      .reduce(
        (lineLongest, line) =>
          Math.max(lineLongest, line.length),
        0,
      );

    return Math.max(longest, longestLine);
  }, label.length);

  return Math.min(Math.max(longestCell + 2, 12), 48);
};

export function exportKnowledgeWorkbook(
  sheets: WorkbookSheets,
  revision: number,
) {
  const workbook = XLSX.utils.book_new();

  const infoSheet = XLSX.utils.aoa_to_sheet([
    ["Property", "Value"],
    ["Workbook", "Diagnostic Pacing Knowledge Workbook"],
    ["Revision", revision],
    ["Exported At", new Date().toISOString()],
  ]);

  infoSheet["!cols"] = [{ wch: 24 }, { wch: 72 }];
  infoSheet["!autofilter"] = { ref: "A1:B1" };

  XLSX.utils.book_append_sheet(
    workbook,
    infoSheet,
    "Workbook Info",
  );

  for (const sheetId of sheetOrder) {
    const definition = sheetDefinitions[sheetId];
    const rows = sheets[sheetId];
    const headers = definition.columns.map(
      (column) => column.label,
    );

    const values = rows.map((row) =>
      definition.columns.map(
        (column) => row[column.key] ?? "",
      ),
    );

    const worksheet = XLSX.utils.aoa_to_sheet([
      headers,
      ...values,
    ]);

    worksheet["!cols"] = definition.columns.map(
      (column) => ({
        wch: getColumnWidth(
          column.label,
          column.key,
          rows,
        ),
      }),
    );

    if (headers.length > 0) {
      worksheet["!autofilter"] = {
        ref: `A1:${XLSX.utils.encode_col(
          headers.length - 1,
        )}1`,
      };
    }

    XLSX.utils.book_append_sheet(
      workbook,
      worksheet,
      worksheetNames[sheetId],
    );
  }

  const date = new Date().toISOString().slice(0, 10);
  const filename =
    `Diagnostic-Pacing-Knowledge-Workbook-r${String(
      revision,
    ).padStart(4, "0")}-${date}.xlsx`;

  XLSX.writeFile(workbook, filename, {
    bookType: "xlsx",
    compression: true,
  });
}
