"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminTabs from "./components/AdminTabs";
import ClinicalStateWorkspace from "./components/ClinicalStateWorkspace";
import ManeuverWorkspace from "./components/ManeuverWorkspace";
import SpreadsheetTable from "./components/SpreadsheetTable";
import { exportKnowledgeWorkbook } from "./workbookExport";
import {
  clinicalStateSheets,
  initialData,
  sheetDefinitions,
  type ClinicalStateSheetId,
  type ManeuverSheetId,
  type SheetId,
  type SpreadsheetRow,
  type TopLevelTabId,
} from "./model";

const maneuverSheetIds = new Set<SheetId>([
  "maneuverDefinitions",
  "maneuverResponseFields",
  "maneuverResponseOptions",
]);

const clinicalStateSheetIds = new Set<SheetId>(
  clinicalStateSheets.map((sheet) => sheet.id),
);

const copyInitialData = () =>
  structuredClone(initialData) as Record<SheetId, SpreadsheetRow[]>;

const makeRowId = () =>
  `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function AdminPage() {
  const [activeTab, setActiveTab] =
    useState<TopLevelTabId>("maneuvers");

  const [activeManeuverSheet, setActiveManeuverSheet] =
    useState<ManeuverSheetId>("maneuverDefinitions");

  const [activeClinicalStateSheet, setActiveClinicalStateSheet] =
    useState<ClinicalStateSheetId>("clinicalStatePhases");

  const [data, setData] =
    useState<Record<SheetId, SpreadsheetRow[]>>(copyInitialData);

  const [isDirty, setIsDirty] = useState(false);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/knowledge", { cache: "no-store" });
        if (!response.ok) throw new Error("Could not load the knowledge workbook.");
        const snapshot = await response.json() as import("@/knowledge/types").KnowledgeSnapshot;
        if (!cancelled) {
          setData(snapshot.workbook.sheets);
          setRevision(snapshot.revision);
          setIsDirty(false);
        }
      } catch (error) {
        console.error("Could not load administration data.", error);
        window.alert(error instanceof Error ? error.message : "The workbook could not be loaded.");
      } finally {
        if (!cancelled) setHasLoaded(true);
      }
    };

    void load();
    return () => { cancelled = true; };
  }, []);

  const activeSheetId: SheetId = useMemo(() => {
    if (activeTab === "maneuvers") {
      return activeManeuverSheet;
    }
    if (activeTab === "clinicalStates") {
      return activeClinicalStateSheet;
    }

    return activeTab;
  }, [activeClinicalStateSheet, activeManeuverSheet, activeTab]);

  const activeDefinition = sheetDefinitions[activeSheetId];
  const activeRows = data[activeSheetId];

  const handleAddRow = () => {
    const blankRow: SpreadsheetRow = {
      __rowId: makeRowId(),
    };

    for (const column of activeDefinition.columns) {
      blankRow[column.key] = "";
    }

    setData((current) => ({
      ...current,
      [activeSheetId]: [...current[activeSheetId], blankRow],
    }));

    setIsDirty(true);
  };

  const handleCellChange = (
    rowId: string,
    columnKey: string,
    value: string,
  ) => {
    setData((current) => ({
      ...current,
      [activeSheetId]: current[activeSheetId].map((row) =>
        row.__rowId === rowId
          ? { ...row, [columnKey]: value }
          : row,
      ),
    }));

    setIsDirty(true);
  };

  const handleDeleteRow = (rowId: string) => {
    setData((current) => ({
      ...current,
      [activeSheetId]: current[activeSheetId].filter(
        (row) => row.__rowId !== rowId,
      ),
    }));

    setIsDirty(true);
  };

  const handleToggleLock = (rowId: string, locked: boolean) => {
    setData((current) => ({
      ...current,
      [activeSheetId]: current[activeSheetId].map((row) =>
        row.__rowId === rowId
          ? { ...row, __locked: locked ? "true" : "" }
          : row,
      ),
    }));

    setIsDirty(true);
  };

  const handleNavigateToReference = (sheetId: SheetId, rowId: string) => {
    if (maneuverSheetIds.has(sheetId)) {
      setActiveTab("maneuvers");
      setActiveManeuverSheet(sheetId as ManeuverSheetId);
    } else if (clinicalStateSheetIds.has(sheetId)) {
      setActiveTab("clinicalStates");
      setActiveClinicalStateSheet(sheetId as ClinicalStateSheetId);
    } else {
      setActiveTab(sheetId as TopLevelTabId);
    }

    setHighlightRowId(rowId);
  };

  useEffect(() => {
    if (!highlightRowId) return;
    const timeout = window.setTimeout(() => setHighlightRowId(null), 4000);
    return () => window.clearTimeout(timeout);
  }, [highlightRowId, activeSheetId]);

  const handleSave = async () => {
    if (revision === null || isSaving) return;

    const changeSummary = window.prompt(
      "Briefly describe this revision:",
      "Updated knowledge workbook",
    )?.trim();

    if (!changeSummary) return;

    // Saving locks every row across every sheet, not just the one being
    // viewed — a successful save has already passed the exact same
    // validation a manual row-lock requires, so there's nothing left to
    // protect against by leaving anything unlocked. This is computed as a
    // local copy rather than applied to `data` directly: if the save is
    // rejected (validation failure or a revision conflict), `data` stays
    // exactly as the user left it, still editable, with nothing locked
    // that didn't actually get saved.
    const lockedSheets = Object.fromEntries(
      Object.entries(data).map(([sheetId, rows]) => [
        sheetId,
        rows.map((row) => ({ ...row, __locked: "true" })),
      ]),
    ) as Record<SheetId, SpreadsheetRow[]>;

    setIsSaving(true);
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          changeSummary,
          sheets: lockedSheets,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        if (result.error === "validation_failed") {
          // No cap on how many issues are listed — this used to stop at
          // 8, which meant a bulk schema change (like splitting Clinical
          // States into four sheets) could only be fixed 8 issues at a
          // time, reloading and re-saving repeatedly to see the next
          // batch. A plain window.alert can scroll, so showing every
          // issue at once is strictly more useful. See
          // CLINICAL-STATES-VALIDATION-ALERT-2026-08-14.
          const issues: { message: string }[] = result.issues ?? [];
          const details = issues
            .map((item) => `• ${item.message}`)
            .join("\n");
          throw new Error(
            `Validation failed — ${issues.length} issue${issues.length === 1 ? "" : "s"}.\n\n${details}`,
          );
        }
        if (result.error === "revision_conflict") {
          throw new Error(`The workbook changed elsewhere. Live revision: ${result.currentRevision}. Reload before editing.`);
        }
        throw new Error(result.message ?? "The workbook could not be saved.");
      }

      setData(result.workbook.sheets);
      setRevision(result.revision);
      setIsDirty(false);
    } catch (error) {
      console.error("Could not save administration data.", error);
      window.alert(error instanceof Error ? error.message : "The workbook could not be saved.");
    } finally {
      setIsSaving(false);
    }
  };

  const handleDownload = () => {
    if (revision === null) {
      window.alert(
        "The workbook must finish loading before it can be downloaded.",
      );
      return;
    }

    if (isDirty) {
      window.alert(
        "Save the current changes before downloading the workbook.",
      );
      return;
    }

    try {
      exportKnowledgeWorkbook(data, revision);
    } catch (error) {
      console.error(
        "Could not create the Excel workbook.",
        error,
      );
      window.alert(
        error instanceof Error
          ? error.message
          : "The Excel workbook could not be created.",
      );
    }
  };

  return (
    <main className="adminShell">
      {/* Same brand mark + eyebrow-in-h1 header format, and the same
          .topbar/.brandArea/.brand/.topActions classes, as the clinical
          workspace's own header — reused wholesale here instead of the
          admin site's previous bespoke .adminTopbar treatment, per
          Murph's request to match "the same logo and top menu format as
          the clinical site." Save and Download Workbook — previously
          their own row further down, alongside Add Row — now live here
          too, grouped with the Return/Sign-out buttons that already
          lived in the top-right. See
          ADMIN-TOPBAR-CLINICAL-MATCH-2026-08-11. */}
      <header className="topbar">
        <div className="brandArea">
          <div className="brand">
            <span className="brandMark" role="img" aria-label="DiagnosticPacing.org" />
            <h1>
              <span className="adminTopbarEyebrow">Diagnostic Pacing</span>
              Knowledge-Base Administration
            </h1>
          </div>
        </div>

        <div className="topActions">
          <button
            className="primaryButton"
            disabled={revision === null || isSaving}
            onClick={() => void handleSave()}
            type="button"
          >
            {isSaving ? "Saving…" : "Save"}
          </button>
          <button
            className="secondaryButton"
            onClick={handleDownload}
            type="button"
          >
            Download Workbook
          </button>
          <Link className="secondaryButton" href="/">
            Return to clinical workspace
          </Link>
          <button
            className="secondaryButton"
            type="button"
            onClick={async () => {
              await fetch("/api/admin/logout", { method: "POST" });
              window.location.replace("/admin/login");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <AdminTabs
        activeTab={activeTab}
        onChange={setActiveTab}
      />

      <section className="adminWorkspace">
        {activeTab === "maneuvers" && (
          <ManeuverWorkspace
            activeSheet={activeManeuverSheet}
            onChange={setActiveManeuverSheet}
          />
        )}

        {activeTab === "clinicalStates" && (
          <ClinicalStateWorkspace
            activeSheet={activeClinicalStateSheet}
            onChange={setActiveClinicalStateSheet}
          />
        )}

        {/* One consolidated line where there used to be two separate
            bars: a sheet-description heading, and a Toolbar row below it
            for row count / save state (plus the Add Row/Save/Download
            buttons now relocated to the header above and to the bottom
            of the spreadsheet). For the Maneuvers tab specifically, the
            description is left blank on purpose — ManeuverWorkspace's
            subnav above already shows the active sheet's label and
            description together on its own button, so repeating that
            same sentence here would be the exact duplicate description
            Murph flagged ("Response Fields" showing the same text
            twice). Same reasoning applies to Clinical States now that it
            has its own ClinicalStateWorkspace subnav — see
            CLINICAL-STATES-SUB-SHEETS-2026-08-14. Every other tab has no
            subnav, so its description still needs to be stated
            somewhere, and this is that somewhere. See
            ADMIN-CONSOLIDATE-SHEET-META-2026-08-11. */}
        <div className="adminSheetMeta">
          <p>
            {activeTab === "maneuvers" || activeTab === "clinicalStates"
              ? ""
              : activeDefinition.description}
          </p>

          <div className="adminSheetStatus" aria-live="polite">
            <span>
              {activeRows.length} {activeRows.length === 1 ? "row" : "rows"}
            </span>
            <span className={isDirty ? "isDirty" : "isSaved"}>
              {isDirty ? "Unsaved changes" : "Saved"}
            </span>
          </div>
        </div>

        {hasLoaded && (
          <SpreadsheetTable
            key={activeSheetId}
            definition={activeDefinition}
            rows={activeRows}
            allData={data}
            onAddRow={handleAddRow}
            onCellChange={handleCellChange}
            onDeleteRow={handleDeleteRow}
            onToggleLock={handleToggleLock}
            onNavigateToReference={handleNavigateToReference}
            highlightRowId={highlightRowId}
          />
        )}
      </section>
    </main>
  );
}
