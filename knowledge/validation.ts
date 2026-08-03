import { sheetDefinitions, type SheetId, type SpreadsheetRow } from "@/app/admin/model";
import { KNOWLEDGE_SCHEMA_VERSION, type KnowledgeWorkbook } from "./types";

export type ValidationIssue = {
  sheetId: SheetId;
  rowId: string | null;
  columnKey: string | null;
  message: string;
};

export class WorkbookValidationError extends Error {
  constructor(public readonly issues: ValidationIssue[]) {
    super("The knowledge workbook is invalid.");
    this.name = "WorkbookValidationError";
  }
}

const idColumn: Partial<Record<SheetId, string>> = {
  clinicalTerms: "termId",
  clinicalStates: "stateId",
  diagnoses: "diagnosisId",
  maneuverDefinitions: "maneuverId",
  maneuverResponseFields: "fieldId",
  maneuverResponseOptions: "optionId",
  clinicalReasoning: "reasoningId",
  references: "referenceId",
};

const n = (value?: string) => (value ?? "").trim();
const splitList = (value?: string) =>
  n(value)
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

function issue(
  issues: ValidationIssue[],
  sheetId: SheetId,
  row: SpreadsheetRow | null,
  columnKey: string | null,
  message: string,
) {
  issues.push({ sheetId, rowId: row?.__rowId ?? null, columnKey, message });
}

export function validateWorkbook(workbook: KnowledgeWorkbook): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const sheets = workbook.sheets;

  if (workbook.schemaVersion !== KNOWLEDGE_SCHEMA_VERSION) {
    issue(issues, "clinicalTerms", null, null, `Unsupported schema version ${workbook.schemaVersion}.`);
  }

  // Generic per-sheet checks driven directly by the column definitions:
  // unexpected columns, required-but-blank, ID prefix, and duplicate IDs.
  for (const sheetId of Object.keys(sheetDefinitions) as SheetId[]) {
    const definition = sheetDefinitions[sheetId];
    const rows = sheets[sheetId];
    if (!Array.isArray(rows)) {
      issue(issues, sheetId, null, null, "Sheet data must be an array.");
      continue;
    }

    const allowed = new Set(["__rowId", ...definition.columns.map((c) => c.key)]);
    const rowIds = new Set<string>();
    const ids = new Set<string>();
    const idKey = idColumn[sheetId];

    for (const row of rows) {
      if (!n(row.__rowId)) issue(issues, sheetId, row, "__rowId", "Internal row ID is required.");
      else if (rowIds.has(row.__rowId)) issue(issues, sheetId, row, "__rowId", `Duplicate internal row ID "${row.__rowId}".`);
      else rowIds.add(row.__rowId);

      for (const key of Object.keys(row)) {
        if (!allowed.has(key)) issue(issues, sheetId, row, key, `Unexpected column "${key}".`);
      }

      for (const column of definition.columns) {
        const value = n(row[column.key]);

        if (column.required && !value) {
          issue(issues, sheetId, row, column.key, `${definition.label}: ${column.label} is required.`);
          continue;
        }

        if (value && column.idPrefix && !value.startsWith(column.idPrefix)) {
          issue(
            issues,
            sheetId,
            row,
            column.key,
            `${definition.label}: ${column.label} must begin with "${column.idPrefix}".`,
          );
        }
      }

      if (idKey && n(row[idKey])) {
        const value = n(row[idKey]).toUpperCase();
        if (ids.has(value)) issue(issues, sheetId, row, idKey, `Duplicate ${idKey} "${row[idKey]}".`);
        else ids.add(value);
      }
    }
  }

  // Cross-sheet referential integrity.
  const maneuverIds = new Set(sheets.maneuverDefinitions.map((r) => n(r.maneuverId).toUpperCase()));
  const diagnosisAbbreviations = new Set(sheets.diagnoses.map((r) => n(r.abbreviatedName).toUpperCase()));
  const diagnosisIds = new Set(sheets.diagnoses.map((r) => n(r.diagnosisId).toUpperCase()));
  const clinicalStateAbbreviations = new Set(sheets.clinicalStates.map((r) => n(r.abbreviatedName).toUpperCase()));
  const fieldIds = new Set(sheets.maneuverResponseFields.map((r) => n(r.fieldId).toUpperCase()));
  const referenceIds = new Set(sheets.references.map((r) => n(r.referenceId).toUpperCase()));
  const referenceTitles = new Set(sheets.references.map((r) => n(r.referenceTitle).toUpperCase()));

  for (const row of sheets.maneuverDefinitions) {
    for (const abbr of splitList(row.relevantDiagnoses)) {
      if (!diagnosisAbbreviations.has(abbr.toUpperCase())) {
        issue(issues, "maneuverDefinitions", row, "relevantDiagnoses", `Unknown diagnosis "${abbr}" in Relevant Diagnoses.`);
      }
    }
    for (const abbr of splitList(row.requiredStates)) {
      if (!clinicalStateAbbreviations.has(abbr.toUpperCase())) {
        issue(issues, "maneuverDefinitions", row, "requiredStates", `Unknown clinical state "${abbr}" in Required States.`);
      }
    }
  }

  for (const row of sheets.maneuverResponseFields) {
    if (n(row.associatedManeuverId) && !maneuverIds.has(n(row.associatedManeuverId).toUpperCase())) {
      issue(issues, "maneuverResponseFields", row, "associatedManeuverId", `Unknown maneuver ID "${row.associatedManeuverId}".`);
    }
  }

  for (const row of sheets.maneuverResponseOptions) {
    if (n(row.associatedFieldId) && !fieldIds.has(n(row.associatedFieldId).toUpperCase())) {
      issue(issues, "maneuverResponseOptions", row, "associatedFieldId", `Unknown field ID "${row.associatedFieldId}".`);
    }
  }

  for (const row of sheets.clinicalReasoning) {
    if (n(row.maneuverId) && !maneuverIds.has(n(row.maneuverId).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "maneuverId", `Unknown maneuver ID "${row.maneuverId}".`);
    }
    if (n(row.fieldId) && !fieldIds.has(n(row.fieldId).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "fieldId", `Unknown field ID "${row.fieldId}".`);
    }
    if (n(row.diagnosisId) && !diagnosisIds.has(n(row.diagnosisId).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "diagnosisId", `Unknown diagnosis ID "${row.diagnosisId}".`);
    }
    if (n(row.referenceId) && !referenceIds.has(n(row.referenceId).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "referenceId", `Unknown reference ID "${row.referenceId}".`);
    }
    if (n(row.referenceTitle) && !referenceTitles.has(n(row.referenceTitle).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "referenceTitle", `Unknown reference title "${row.referenceTitle}".`);
    }
    if (n(row.requiredClinicalState) && !clinicalStateAbbreviations.has(n(row.requiredClinicalState).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "requiredClinicalState", `Unknown clinical state "${row.requiredClinicalState}".`);
    }
  }

  return issues;
}

export function assertValidWorkbook(workbook: KnowledgeWorkbook) {
  const issues = validateWorkbook(workbook);
  if (issues.length) throw new WorkbookValidationError(issues);
}
