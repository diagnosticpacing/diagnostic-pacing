"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import AdminTabs from "../admin/components/AdminTabs";
import ClinicalStateWorkspace from "../admin/components/ClinicalStateWorkspace";
import ManeuverWorkspace from "../admin/components/ManeuverWorkspace";
import SpreadsheetTable from "../admin/components/SpreadsheetTable";
import Toolbar from "../admin/components/Toolbar";
import { exportKnowledgeWorkbook } from "../admin/workbookExport";
import {
  clinicalStateSheets,
  initialData,
  maneuverSheets,
  sheetDefinitions,
  type ClinicalStateSheetId,
  type ManeuverSheetId,
  type SheetId,
  type SpreadsheetRow,
  type TopLevelTabId,
} from "../admin/model";

const maneuverSheetIds = new Set<SheetId>(
  maneuverSheets.map((sheet) => sheet.id),
);

const clinicalStateSheetIds = new Set<SheetId>(
  clinicalStateSheets.map((sheet) => sheet.id),
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

  const [activeClinicalStateSheet, setActiveClinicalStateSheet] =
    useState<ClinicalStateSheetId>("clinicalStatePhases");

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
    if (activeTab === "clinicalStates") {
      return activeClinicalStateSheet;
    }

    return activeTab;
  }, [activeClinicalStateSheet, activeManeuverSheet, activeTab]);

  const activeDefinition = sheetDefinitions[activeSheetId];
  const activeRows = data[activeSheetId];

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

  const activeClinicalStateDescription =
    clinicalStateSheets.find((sheet) => sheet.id === activeClinicalStateSheet)
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

        {activeTab === "clinicalStates" && (
          <ClinicalStateWorkspace
            activeSheet={activeClinicalStateSheet}
            onChange={setActiveClinicalStateSheet}
          />
        )}

        {/* Sheet identity (name) is expressed by the selectable menus
            alone now — AdminTabs above, and ManeuverWorkspace's/
            ClinicalStateWorkspace's subnav for their respective grouped
            tabs — rather than restated again here. See
            ADMIN-SHEET-HEADING-DEDUP-2026-08-10 and
            CLINICAL-STATES-SUB-SHEETS-2026-08-14. Only the one line of
            further explanation (the sheet's description) remains. */}
        <div className="adminSheetHeading">
          <div>
            <p>
              {activeTab === "maneuvers"
                ? activeManeuverDescription
                : activeTab === "clinicalStates"
                  ? activeClinicalStateDescription
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
