import { initialData, normalizeWorkbookSheets, pruneUnknownColumns } from "@/app/admin/model";
import { getKnowledgeRepository } from "./repository";
import { assertValidWorkbook, WorkbookValidationError } from "./validation";
import {
  KNOWLEDGE_SCHEMA_VERSION,
  type KnowledgeRevision,
  type KnowledgeSnapshot,
  type RestoreKnowledgeRequest,
  type RevisionIndex,
  type SaveKnowledgeRequest,
  type WorkbookSheets,
} from "./types";

export class RevisionConflictError extends Error {
  constructor(public currentRevision: number, public expectedRevision: number) {
    super(`Current revision is ${currentRevision}; editor expected ${expectedRevision}.`);
    this.name = "RevisionConflictError";
  }
}
export class RevisionNotFoundError extends Error {
  constructor(public revision: number) {
    super(`Revision ${revision} was not found.`);
    this.name = "RevisionNotFoundError";
  }
}

const clone = (sheets: WorkbookSheets) => structuredClone(sheets) as WorkbookSheets;
const actor = { userId: null, displayName: "Administrator" };

async function createRevision(
  sheets: WorkbookSheets,
  expectedRevision: number,
  changeSummary: string,
  restoredFromRevision: number | null,
): Promise<KnowledgeSnapshot> {
  const repository = getKnowledgeRepository();
  const current = await repository.getCurrent();
  const currentRevision = current?.pointer.currentRevision ?? 0;

  if (currentRevision !== expectedRevision) {
    throw new RevisionConflictError(currentRevision, expectedRevision);
  }

  // Normalize before validating/storing so a workbook saved or restored
  // from before a sheet existed (e.g. Clinical States) doesn't crash
  // validation or leave a missing key in what gets written. Prune after
  // normalizing so a column dropped from the schema after this data was
  // saved (e.g. the old Refractory Period Component # column) doesn't
  // permanently block every future save with an "Unexpected column" error.
  const normalizedSheets = pruneUnknownColumns(normalizeWorkbookSheets(sheets));

  const next = currentRevision + 1;
  const now = new Date().toISOString();
  const revision: KnowledgeRevision = {
    metadata: {
      revision: next,
      createdAt: now,
      createdBy: actor,
      changeSummary: changeSummary.trim() || "Updated knowledge workbook",
      previousRevision: currentRevision || null,
      restoredFromRevision,
    },
    workbook: { schemaVersion: KNOWLEDGE_SCHEMA_VERSION, sheets: clone(normalizedSheets) },
  };

  assertValidWorkbook(revision.workbook);
  await repository.writeRevision(revision);

  const index: RevisionIndex = (await repository.getIndex()) ?? {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    revisions: [],
  };
  await repository.writeIndex({
    ...index,
    revisions: [revision.metadata, ...index.revisions],
  });
  await repository.writeCurrent(
    { currentRevision: next, updatedAt: now },
    current?.etag ?? null,
  );

  return { revision: next, metadata: revision.metadata, workbook: revision.workbook };
}

export async function loadCurrentKnowledge(): Promise<KnowledgeSnapshot> {
  const repository = getKnowledgeRepository();
  const current = await repository.getCurrent();

  if (!current) {
    return createRevision(initialData as WorkbookSheets, 0, "Initial knowledge workbook", null);
  }

  const revision = await repository.getRevision(current.pointer.currentRevision);
  if (!revision) throw new RevisionNotFoundError(current.pointer.currentRevision);
  return {
    revision: revision.metadata.revision,
    metadata: revision.metadata,
    workbook: {
      ...revision.workbook,
      sheets: normalizeWorkbookSheets(revision.workbook.sheets),
    },
  };
}

export function saveKnowledge(request: SaveKnowledgeRequest) {
  return createRevision(request.sheets, request.expectedRevision, request.changeSummary, null);
}

export async function listKnowledgeRevisions() {
  await loadCurrentKnowledge();
  return (await getKnowledgeRepository().getIndex()) ?? {
    schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
    revisions: [],
  };
}

export async function restoreKnowledge(request: RestoreKnowledgeRequest) {
  const source = await getKnowledgeRepository().getRevision(request.revisionToRestore);
  if (!source) throw new RevisionNotFoundError(request.revisionToRestore);
  return createRevision(
    source.workbook.sheets,
    request.expectedRevision,
    request.changeSummary || `Restored revision ${request.revisionToRestore}`,
    request.revisionToRestore,
  );
}

export function serializeKnowledgeError(error: unknown) {
  if (error instanceof WorkbookValidationError) {
    return { status: 422, body: { error: "validation_failed", message: error.message, issues: error.issues } };
  }
  if (error instanceof RevisionConflictError) {
    return { status: 409, body: { error: "revision_conflict", message: error.message, currentRevision: error.currentRevision, expectedRevision: error.expectedRevision } };
  }
  if (error instanceof RevisionNotFoundError) {
    return { status: 404, body: { error: "revision_not_found", message: error.message, revision: error.revision } };
  }
  console.error(error);
  return { status: 500, body: { error: "internal_error", message: error instanceof Error ? error.message : "Unexpected repository error." } };
}
