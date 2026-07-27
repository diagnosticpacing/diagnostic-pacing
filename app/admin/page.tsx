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

  const handleSave = async () => {
    if (revision === null || isSaving) return;

    const changeSummary = window.prompt(
      "Briefly describe this revision:",
      "Updated knowledge workbook",
    )?.trim();

    if (!changeSummary) return;

    setIsSaving(true);
    try {
      const response = await fetch("/api/knowledge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          expectedRevision: revision,
          changeSummary,
          sheets: data,
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
          <p className="adminEyebrow">
            Diagnostic Pacing
          </p>
          <h1>Knowledge-Base Administration</h1>
          <p>
            Edit the clinical content and transparent reasoning used
            by the application.
          </p>
        </div>

        <Link href="/">Return to clinical workspace</Link>
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

        <div className="adminSheetHeading">
          <div>
            <p className="adminEyebrow">
              {activeTab === "maneuvers"
                ? "Maneuver workbook"
                : "Knowledge-base sheet"}
            </p>
            <h2>{activeDefinition.label}</h2>
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
            definition={activeDefinition}
            rows={activeRows}
            onAddRow={handleAddRow}
            onCellChange={handleCellChange}
            onDeleteRow={handleDeleteRow}
          />
        )}
      </section>
    </main>
  );
}
