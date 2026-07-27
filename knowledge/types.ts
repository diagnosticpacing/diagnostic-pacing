import type { SheetId, SpreadsheetRow } from "@/app/admin/model";

export const KNOWLEDGE_SCHEMA_VERSION = 1 as const;
export type WorkbookSheets = Record<SheetId, SpreadsheetRow[]>;

export type KnowledgeWorkbook = {
  schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION;
  sheets: WorkbookSheets;
};

export type RevisionMetadata = {
  revision: number;
  createdAt: string;
  createdBy: { userId: string | null; displayName: string };
  changeSummary: string;
  previousRevision: number | null;
  restoredFromRevision: number | null;
};

export type KnowledgeRevision = {
  metadata: RevisionMetadata;
  workbook: KnowledgeWorkbook;
};

export type CurrentPointer = {
  currentRevision: number;
  updatedAt: string;
};

export type RevisionIndex = {
  schemaVersion: typeof KNOWLEDGE_SCHEMA_VERSION;
  revisions: RevisionMetadata[];
};

export type KnowledgeSnapshot = {
  revision: number;
  metadata: RevisionMetadata;
  workbook: KnowledgeWorkbook;
};

export type SaveKnowledgeRequest = {
  expectedRevision: number;
  changeSummary: string;
  sheets: WorkbookSheets;
};

export type RestoreKnowledgeRequest = {
  expectedRevision: number;
  revisionToRestore: number;
  changeSummary: string;
};
