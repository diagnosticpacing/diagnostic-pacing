import { ablationModalityOptions } from "@/app/clinical/model";
import type {
  AblationSession,
  CaseRecord,
  ClinicalState,
} from "@/app/clinical/model";

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

/** The on-disk JSON shape, shared by both the one-shot download
 * (exportCaseRecord) and the autosave write path (writeCaseRecordToHandle)
 * below, so a file produced either way is equally readable by
 * importCaseRecordFromFile. */
function buildCaseFile(caseRecord: CaseRecord): CaseFile {
  return {
    fileFormat: CASE_FILE_FORMAT,
    schemaVersion: CASE_FILE_SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    case: caseRecord,
  };
}

/** Triggers a browser download of the case as a JSON file — no request
 * ever leaves the browser. */
export function exportCaseRecord(caseRecord: CaseRecord): void {
  const blob = new Blob([JSON.stringify(buildCaseFile(caseRecord), null, 2)], {
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

// --- Autosave (File System Access API) ---------------------------------
//
// A separate, opt-in path from Save/Open above: instead of a one-shot
// download, the user picks or creates a file once via a native picker and
// the app keeps a live handle to it, silently rewriting it as the case
// changes (debounced in page.tsx). Chromium-only (Chrome/Edge/Opera/Arc) —
// Firefox and Safari don't implement the File System Access API at all, so
// every call site behind this feature must check
// isFileSystemAccessSupported() first and fall back to the existing manual
// Save case button when it's false. See CASE-AUTOSAVE-2026-08-08 in
// PROJECT_DESIGN.md and app/case/file-system-access.d.ts for the ambient
// types this relies on (TypeScript's bundled DOM lib doesn't declare
// showSaveFilePicker).

/** Whether this browser can do live-file autosave at all. Always false
 * during server-side rendering (no `window`), so callers can use it
 * directly in a client-only useEffect/useState without a hydration
 * mismatch. */
export function isFileSystemAccessSupported(): boolean {
  return typeof window !== "undefined" && "showSaveFilePicker" in window;
}

/**
 * Opens the native "save file" picker so the user can create or overwrite
 * the file autosave should target, and returns the resulting handle. The
 * file is written immediately (not left empty) so the picker's result is a
 * real, valid case file the instant it's created. Rejects (AbortError) if
 * the user cancels the picker — callers should treat that as a silent
 * no-op, not an error to surface.
 */
export async function pickCaseFileForAutosave(
  caseRecord: CaseRecord,
): Promise<FileSystemFileHandle> {
  const handle = await window.showSaveFilePicker({
    suggestedName: `${slugify(caseRecord.title)}-${dateStamp()}.json`,
    types: [
      {
        description: "Diagnostic Pacing case file",
        accept: { "application/json": [".json"] },
      },
    ],
  });

  await writeCaseRecordToHandle(handle, caseRecord);
  return handle;
}

/** Overwrites the given file handle with the current case, in the same
 * shape exportCaseRecord downloads. Used both for the initial write in
 * pickCaseFileForAutosave and for every debounced autosave write
 * afterward. */
export async function writeCaseRecordToHandle(
  handle: FileSystemFileHandle,
  caseRecord: CaseRecord,
): Promise<void> {
  const writable = await handle.createWritable();
  try {
    await writable.write(JSON.stringify(buildCaseFile(caseRecord), null, 2));
  } finally {
    await writable.close();
  }
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

const ablationModalitySet: ReadonlySet<string> = new Set(ablationModalityOptions);

function isValidAblationSession(value: unknown): value is AblationSession {
  if (!value || typeof value !== "object") return false;
  const session = value as Record<string, unknown>;

  return (
    typeof session.id === "string" &&
    Array.isArray(session.modalities) &&
    session.modalities.every(
      (modality) => typeof modality === "string" && ablationModalitySet.has(modality),
    ) &&
    typeof session.location === "string" &&
    typeof session.count === "string" &&
    typeof session.durationSeconds === "string"
  );
}

function isValidCaseRecord(value: unknown): value is CaseRecord {
  if (!value || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;

  // ablationSessions is optional here on purpose — a case file exported
  // before the Ablation section existed won't have it at all, and that's
  // fine (importCaseRecordFromFile defaults it to []), but if it's
  // present it needs to actually be well-formed.
  const ablationSessions = record.ablationSessions;
  const hasValidAblationSessions =
    ablationSessions === undefined ||
    (Array.isArray(ablationSessions) &&
      ablationSessions.every(isValidAblationSession));

  return (
    typeof record.id === "string" &&
    typeof record.title === "string" &&
    Array.isArray(record.clinicalStates) &&
    record.clinicalStates.length > 0 &&
    record.clinicalStates.every(isValidClinicalState) &&
    hasValidAblationSessions
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

  // Older exports (before the Ablation section existed) won't have this
  // field at all — default it rather than rejecting the whole file.
  return {
    ...candidate,
    ablationSessions: candidate.ablationSessions ?? [],
  };
}
