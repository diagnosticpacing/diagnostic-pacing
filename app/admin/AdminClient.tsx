"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminTabs from "./components/AdminTabs";
import ManeuverWorkspace from "./components/ManeuverWorkspace";
import SpreadsheetTable from "./components/SpreadsheetTable";
import Toolbar from "./components/Toolbar";
import { exportKnowledgeWorkbook } from "./workbookExport";
import {
  initialData,
  maneuverSheets,
  sheetDefinitions,
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

const copyInitialData = () =>
  structuredClone(initialData) as Record<SheetId, SpreadsheetRow[]>;

const makeRowId = () =>
  `row-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;

export default function AdminPage() {
  const [activeTab, setActiveTab] =
    useState<TopLevelTabId>("maneuvers");

  const [activeManeuverSheet, setActiveManeuverSheet] =
    useState<ManeuverSheetId>("maneuverDefinitions");

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

    return activeTab;
  }, [activeManeuverSheet, activeTab]);

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
          const details = (result.issues ?? [])
            .slice(0, 8)
            .map((item: { message: string }) => `• ${item.message}`)
            .join("\n");
          throw new Error(`Validation failed.\n\n${details}`);
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

  const activeManeuverDescription =
    maneuverSheets.find(
      (sheet) => sheet.id === activeManeuverSheet,
    )?.description ?? "";

  return (
    <main className="adminShell">
      <header className="adminTopbar">
        <div>
          {/* "Diagnostic Pacing" and the page title used to be a
              stacked eyebrow + <h1>, with an explanatory line below —
              collapsed to one <h1> line at Murph's request; the
              explanatory line is gone outright, not relocated. See
              ADMIN-TOPBAR-SINGLE-LINE-2026-08-11. */}
          <h1>
            <span className="adminTopbarEyebrow">Diagnostic Pacing</span>
            Knowledge-Base Administration
          </h1>
        </div>

        <div className="adminTopbarActions">
          <Link href="/">Return to clinical workspace</Link>
          <button
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

        {/* Sheet identity (name) is expressed by the selectable menus
            alone now — AdminTabs above, and ManeuverWorkspace's subnav
            for the Maneuvers tab — rather than restated again here. See
            ADMIN-SHEET-HEADING-DEDUP-2026-08-10. Only the one line of
            further explanation (the sheet's description) remains. */}
        <div className="adminSheetHeading">
          <div>
            <p>
              {activeTab === "maneuvers"
                ? activeManeuverDescription
                : activeDefinition.description}
            </p>
          </div>
        </div>

        <Toolbar
          rowCount={activeRows.length}
          isDirty={isDirty}
          onAddRow={handleAddRow}
          onSave={() => void handleSave()}
          onDownload={handleDownload}
        />

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
