"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminTabs from "../admin/components/AdminTabs";
import ManeuverWorkspace from "../admin/components/ManeuverWorkspace";
import SpreadsheetTable from "../admin/components/SpreadsheetTable";
import Toolbar from "../admin/components/Toolbar";
import { exportKnowledgeWorkbook } from "../admin/workbookExport";
import {
  initialData,
  maneuverSheets,
  sheetDefinitions,
  type ManeuverSheetId,
  type SheetId,
  type SpreadsheetRow,
  type TopLevelTabId,
} from "../admin/model";

const maneuverSheetIds = new Set<SheetId>(
  maneuverSheets.map((sheet) => sheet.id),
);

const copyInitialData = () =>
  structuredClone(initialData) as Record<SheetId, SpreadsheetRow[]>;

// SpreadsheetTable's mutation callbacks are required props — in read-only
// mode none of the controls that would call them are even rendered, so
// these never actually run. Passing no-ops keeps the component's prop
// contract unchanged rather than making every callback optional just for
// this one read-only caller.
const noop = () => {};
const noopCell = () => {};
const noopToggleLock = () => {};

export default function KnowledgeClient() {
  const [activeTab, setActiveTab] = useState<TopLevelTabId>("maneuvers");

  const [activeManeuverSheet, setActiveManeuverSheet] =
    useState<ManeuverSheetId>("maneuverDefinitions");

  const [data, setData] =
    useState<Record<SheetId, SpreadsheetRow[]>>(copyInitialData);

  const [hasLoaded, setHasLoaded] = useState(false);
  const [revision, setRevision] = useState<number | null>(null);
  const [highlightRowId, setHighlightRowId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        const response = await fetch("/api/knowledge/public", {
          cache: "no-store",
        });
        if (!response.ok) {
          throw new Error("Could not load the knowledge base.");
        }
        const snapshot = (await response.json()) as {
          revision: number;
          sheets: Record<SheetId, SpreadsheetRow[]>;
        };
        if (!cancelled) {
          setData(snapshot.sheets);
          setRevision(snapshot.revision);
        }
      } catch (error) {
        console.error("Could not load the public knowledge base.", error);
        window.alert(
          error instanceof Error
            ? error.message
            : "The knowledge base could not be loaded.",
        );
      } finally {
        if (!cancelled) setHasLoaded(true);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const activeSheetId: SheetId = useMemo(() => {
    if (activeTab === "maneuvers") {
      return activeManeuverSheet;
    }

    return activeTab;
  }, [activeManeuverSheet, activeTab]);

  const activeDefinition = sheetDefinitions[activeSheetId];
  const activeRows = data[activeSheetId];

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

  const handleDownload = () => {
    if (revision === null) {
      window.alert(
        "The knowledge base must finish loading before it can be downloaded.",
      );
      return;
    }

    try {
      exportKnowledgeWorkbook(data, revision);
    } catch (error) {
      console.error("Could not create the Excel workbook.", error);
      window.alert(
        error instanceof Error
          ? error.message
          : "The Excel workbook could not be created.",
      );
    }
  };

  const activeManeuverDescription =
    maneuverSheets.find((sheet) => sheet.id === activeManeuverSheet)
      ?.description ?? "";

  return (
    <main className="adminShell">
      <header className="adminTopbar">
        <div>
          <p className="adminEyebrow">Diagnostic Pacing</p>
          <h1>Knowledge Base</h1>
          <p>
            Read-only view of the clinical content and transparent
            reasoning used by the application.
          </p>
        </div>

        <div className="adminTopbarActions">
          <Link href="/">Return to clinical workspace</Link>
        </div>
      </header>

      <AdminTabs activeTab={activeTab} onChange={setActiveTab} />

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
          isDirty={false}
          readOnly
          onAddRow={noop}
          onSave={noop}
          onDownload={handleDownload}
        />

        {hasLoaded && (
          <SpreadsheetTable
            key={activeSheetId}
            definition={activeDefinition}
            rows={activeRows}
            allData={data}
            readOnly
            onAddRow={noop}
            onCellChange={noopCell}
            onDeleteRow={noop}
            onToggleLock={noopToggleLock}
            onNavigateToReference={handleNavigateToReference}
            highlightRowId={highlightRowId}
          />
        )}
      </section>
    </main>
  );
}
