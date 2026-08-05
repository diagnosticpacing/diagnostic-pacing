import type { CaseRecord, ClinicalState } from "@/app/clinical/model";

// Same reasoning as the knowledge base's "no patient data is being
// transmitted" design: a case can legitimately contain de-identified but
// still sensitive clinical detail, so Save/Open work entirely client-side
// — a downloaded JSON file and a local file picker, never a network
// request. This mirrors the admin site's "Download Workbook" pattern
// (client-side export, no server round trip needed to produce a file).
export const CASE_FILE_FORMAT = "diagnostic-pacing-case" as const;
export const CASE_FILE_SCHEMA_VERSION = 1 as const;

export type CaseFile = {
  fileFormat: typeof CASE_FILE_FORMAT;
  schemaVersion: typeof CASE_FILE_SCHEMA_VERSION;
  exportedAt: string;
  case: CaseRecord;
};

function slugify(value: string): string {
  const slug = value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return slug || "diagnostic-pacing-case";
}

function dateStamp(): string {
  return new Date().toISOString().slice(0, 10);
}

/** Triggers a browser download of the case as a JSON file — no request
 * ever leaves the browser. */
export function exportCaseRecord(caseRecord: CaseRecord): void {
  const file: CaseFile = {
    fileFormat: CASE_FILE_FORMAT,
    schemaVersion: CASE_FILE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    case: caseRecord,
  };

  const blob = new Blob([JSON.stringify(file, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);

  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `${slugify(caseRecord.title)}-${dateStamp()}.json`;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);

  URL.revokeObjectURL(url);
}

function isValidClinicalState(value: unknown): value is ClinicalState {
  if (!value || typeof value !== "object") return false;
  const state = value as Record<string, unknown>;

  return (
    typeof state.id === "string" &&
    Boolean(state.context) &&
    typeof state.context === "object" &&
    Boolean(state.measurements) &&
    typeof state.measurements === "object" &&
    Array.isArray(state.performances)
  );
}

function isValidCaseRecord(value: unknown): value is CaseRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    Array.isArray(record.clinicalStates) &&
    record.clinicalStates.length > 0 &&
    record.clinicalStates.every(isValidClinicalState)
  );
}

/**
 * Reads and validates a case file selected via a file input. Throws with a
 * message suitable for showing directly to the user (window.alert) on
 * anything that isn't a well-formed Diagnostic Pacing case export —
 * unparsable JSON, a file from something else entirely, a newer schema
 * version than this build understands, or a structurally incomplete case.
 */
export async function importCaseRecordFromFile(file: File): Promise<CaseRecord> {
  const text = await file.text();

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new Error("That file isn't valid JSON.");
  }

  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as Record<string, unknown>).fileFormat !== CASE_FILE_FORMAT
  ) {
    throw new Error(
      "That file doesn't look like a Diagnostic Pacing case export.",
    );
  }

  const schemaVersion = (parsed as Record<string, unknown>).schemaVersion;
  if (schemaVersion !== CASE_FILE_SCHEMA_VERSION) {
    throw new Error(
      `This case file uses a newer format (v${String(schemaVersion)}) than this version of the app supports.`,
    );
  }

  const candidate = (parsed as Record<string, unknown>).case;
  if (!isValidCaseRecord(candidate)) {
    throw new Error("That case file is missing required data.");
  }

  return candidate;
}
