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

const required: Partial<Record<SheetId, string[]>> = {
  clinicalTerms: ["termId", "name"],
  diagnoses: ["diagnosisId", "name"],
  maneuverDefinitions: ["maneuverId", "name", "enabled"],
  maneuverResponseFields: ["maneuverId", "fieldId", "order", "prompt", "inputType", "required"],
  maneuverResponseOptions: ["maneuverId", "fieldId", "optionId", "order", "displayLabel", "storedValue"],
  clinicalReasoning: ["reasoningId", "maneuverId", "fieldId", "operator", "expectedValue", "diagnosisId", "effect", "enabled"],
  references: ["referenceId", "citation"]
};

const idColumn: Partial<Record<SheetId, string>> = {
  clinicalTerms: "termId",
  diagnoses: "diagnosisId",
  maneuverDefinitions: "maneuverId",
  maneuverResponseFields: "fieldId",
  maneuverResponseOptions: "optionId",
  clinicalReasoning: "reasoningId",
  references: "referenceId"
};

const n = (value?: string) => (value ?? "").trim();
const fieldKey = (maneuverId?: string, fieldId?: string) =>
  `${n(maneuverId).toUpperCase()}::${n(fieldId).toUpperCase()}`;

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

  for (const sheetId of Object.keys(sheetDefinitions) as SheetId[]) {
    const rows = sheets[sheetId];
    if (!Array.isArray(rows)) {
      issue(issues, sheetId, null, null, "Sheet data must be an array.");
      continue;
    }

    const allowed = new Set(["__rowId", ...sheetDefinitions[sheetId].columns.map(c => c.key)]);
    const rowIds = new Set<string>();
    const ids = new Set<string>();

    for (const row of rows) {
      if (!n(row.__rowId)) issue(issues, sheetId, row, "__rowId", "Internal row ID is required.");
      else if (rowIds.has(row.__rowId)) issue(issues, sheetId, row, "__rowId", `Duplicate internal row ID "${row.__rowId}".`);
      else rowIds.add(row.__rowId);

      for (const key of Object.keys(row)) {
        if (!allowed.has(key)) issue(issues, sheetId, row, key, `Unexpected column "${key}".`);
      }

      for (const key of required[sheetId] ?? []) {
        if (!n(row[key])) issue(issues, sheetId, row, key, `${sheetDefinitions[sheetId].label}: ${key} is required.`);
      }

      const key = idColumn[sheetId];
      if (key && n(row[key])) {
        const value = n(row[key]).toUpperCase();
        if (ids.has(value)) issue(issues, sheetId, row, key, `Duplicate ${key} "${row[key]}".`);
        else ids.add(value);
      }
    }
  }

  const maneuverIds = new Set(sheets.maneuverDefinitions.map(r => n(r.maneuverId).toUpperCase()));
  const diagnosisIds = new Set(sheets.diagnoses.map(r => n(r.diagnosisId).toUpperCase()));
  const referenceIds = new Set(sheets.references.map(r => n(r.referenceId).toUpperCase()));
  const fields = new Set<string>();

  for (const row of sheets.maneuverResponseFields) {
    if (n(row.maneuverId) && !maneuverIds.has(n(row.maneuverId).toUpperCase())) {
      issue(issues, "maneuverResponseFields", row, "maneuverId", `Unknown maneuver ID "${row.maneuverId}".`);
    }
    const key = fieldKey(row.maneuverId, row.fieldId);
    if (fields.has(key)) issue(issues, "maneuverResponseFields", row, "fieldId", `Duplicate field "${row.fieldId}" within maneuver "${row.maneuverId}".`);
    else fields.add(key);
  }

  const optionValues = new Set<string>();
  for (const row of sheets.maneuverResponseOptions) {
    if (n(row.maneuverId) && !maneuverIds.has(n(row.maneuverId).toUpperCase())) {
      issue(issues, "maneuverResponseOptions", row, "maneuverId", `Unknown maneuver ID "${row.maneuverId}".`);
    }
    if (n(row.fieldId) && !fields.has(fieldKey(row.maneuverId, row.fieldId))) {
      issue(issues, "maneuverResponseOptions", row, "fieldId", `Unknown response field "${row.fieldId}" for maneuver "${row.maneuverId}".`);
    }
    const optionKey = `${fieldKey(row.maneuverId, row.fieldId)}::${n(row.storedValue).toUpperCase()}`;
    if (optionValues.has(optionKey)) issue(issues, "maneuverResponseOptions", row, "storedValue", `Duplicate stored value "${row.storedValue}" for this field.`);
    else optionValues.add(optionKey);
  }

  for (const row of sheets.clinicalReasoning) {
    if (n(row.maneuverId) && !maneuverIds.has(n(row.maneuverId).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "maneuverId", `Unknown maneuver ID "${row.maneuverId}".`);
    }
    if (n(row.fieldId) && !fields.has(fieldKey(row.maneuverId, row.fieldId))) {
      issue(issues, "clinicalReasoning", row, "fieldId", `Unknown response field "${row.fieldId}" for maneuver "${row.maneuverId}".`);
    }
    if (n(row.diagnosisId) && !diagnosisIds.has(n(row.diagnosisId).toUpperCase())) {
      issue(issues, "clinicalReasoning", row, "diagnosisId", `Unknown diagnosis ID "${row.diagnosisId}".`);
    }
    for (const ref of n(row.referenceIds).split(",").map(v => v.trim()).filter(Boolean)) {
      if (!referenceIds.has(ref.toUpperCase())) {
        issue(issues, "clinicalReasoning", row, "referenceIds", `Unknown reference ID "${ref}".`);
      }
    }
  }

  return issues;
}

export function assertValidWorkbook(workbook: KnowledgeWorkbook) {
  const issues = validateWorkbook(workbook);
  if (issues.length) throw new WorkbookValidationError(issues);
}
