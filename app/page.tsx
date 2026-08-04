"use client";

import { useEffect, useRef, useState } from "react";
import type { CSSProperties, MouseEvent as ReactMouseEvent } from "react";
import Link from "next/link";

import {
  clinicalStateSummary,
  createClinicalState,
  createInitialCase,
  findPerformance,
  phaseOptions,
  rhythmOptions,
  sedationOptions,
  upsertPerformance,
  workspaceConfigurations,
  type ClinicalState,
  type ClinicalStateContext,
} from "./clinical/model";
import {
  buildManeuverCatalog,
  scoreManeuverRelevance,
  type ManeuverCatalogEntry,
} from "./maneuvers/knowledge";
import ManeuverCard from "./maneuvers/ManeuverCard";
import {
  buildRefractoryPeriodCatalog,
  formatRefractoryPeriodValue,
} from "./refractoryPeriods/knowledge";
import {
  evaluateDifferential,
  explainDifferentialResult,
  type DifferentialResult,
  type DifferentialStatus,
} from "./differential/engine";
import type { SheetId, SpreadsheetRow } from "./admin/model";

// Display-only relabeling of the differential engine's internal status
// values — "Possible" reads as "Included" on the cards, since a diagnosis
// in that tier hasn't been ruled out (it's included in the active
// differential), which is clearer to a clinician scanning the list than
// "Possible" sitting next to "Confirmed." The internal DifferentialStatus
// type, sort logic, and CSS class (`status.toLowerCase()`, still
// "possible") are all unchanged — same precedent as the Clinical Terms ->
// Intervals rename (label-only, no underlying key change).
const DIFFERENTIAL_STATUS_LABEL: Record<DifferentialStatus, string> = {
  Confirmed: "Confirmed",
  Possible: "Included",
  Excluded: "Excluded",
};

type RailId = "clinicalStates" | "differentialDiagnosis";

const RAIL_WIDTH_DEFAULT = 190;
const RAIL_WIDTH_MIN = 160;
const RAIL_WIDTH_MAX = 480;

const RAIL_WIDTH_STORAGE_KEY: Record<RailId, string> = {
  clinicalStates: "diagnostic-pacing-rail-width:clinical-states",
  differentialDiagnosis: "diagnostic-pacing-rail-width:differential-diagnosis",
};

function loadStoredRailWidth(rail: RailId): number {
  if (typeof window === "undefined") return RAIL_WIDTH_DEFAULT;
  const raw = window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY[rail]);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? RAIL_WIDTH_DEFAULT : parsed;
}

/** Keeps a dragged rail width within a sane range, and never lets both
 * rails together crowd out the center workspace on a narrow window. */
function clampRailWidth(width: number): number {
  const viewportCap =
    typeof window === "undefined"
      ? RAIL_WIDTH_MAX
      : Math.max(RAIL_WIDTH_MIN, window.innerWidth * 0.32);

  return Math.min(RAIL_WIDTH_MAX, viewportCap, Math.max(RAIL_WIDTH_MIN, width));
}

/**
 * Looks up `value` against the Clinical States knowledge-base sheet's Full
 * Name column and, if a row matches, returns its Abbreviated Name instead —
 * e.g. "Normal Sinus Rhythm" -> "NSR", once that row exists. Falls back to
 * `value` unchanged whenever there's no match (the sheet is still empty,
 * the row hasn't been added yet, or the value — Phase, for instance — isn't
 * part of this vocabulary at all), so it's safe to call before or after the
 * knowledge base is populated. This only ever shortens display text; the
 * Clinical States rail cards wrap rather than truncate regardless, so
 * nothing is ever cut off even when no abbreviation is available.
 */
function abbreviateClinicalStateLabel(
  value: string,
  clinicalStates: SpreadsheetRow[] | undefined,
): string {
  const trimmed = value.trim();
  if (!trimmed || !clinicalStates) return value;

  const match = clinicalStates.find(
    (row) => (row.fullName ?? "").trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const abbreviation = match?.abbreviatedName?.trim();
  return abbreviation ? abbreviation : value;
}

function Panel({
  eyebrow,
  title,
  children,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="panel">
      <header className="panelHeader">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </header>
      <div className="panelBody">{children}</div>
    </section>
  );
}

export default function Home() {
  // Opens on every load, not just on the About button — it's the site's
  // one link to the read-only Knowledge Base, and there's no other nav
  // pointing there. Still closeable/reopenable via the About button as
  // before.
  const [aboutOpen, setAboutOpen] = useState(true);
  const [caseRecord, setCaseRecord] = useState(createInitialCase);
  const [activeClinicalStateId, setActiveClinicalStateId] = useState(
    "clinical-state-1",
  );
  const [stateChanges, setStateChanges] = useState<string[]>([]);

  const [maneuverCatalog, setManeuverCatalog] = useState<
    ManeuverCatalogEntry[]
  >([]);
  const [knowledgeSheets, setKnowledgeSheets] = useState<
    Partial<Record<SheetId, SpreadsheetRow[]>>
  >({});
  const [maneuverCatalogStatus, setManeuverCatalogStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");

  useEffect(() => {
    let cancelled = false;

    fetch("/api/knowledge/public")
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json();
      })
      .then((data: { sheets: Record<string, unknown> }) => {
        if (cancelled) return;
        const sheets = data.sheets as Partial<Record<SheetId, SpreadsheetRow[]>>;
        setKnowledgeSheets(sheets);
        setManeuverCatalog(
          buildManeuverCatalog(sheets as Parameters<typeof buildManeuverCatalog>[0]),
        );
        setManeuverCatalogStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setManeuverCatalogStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const [clinicalRailWidth, setClinicalRailWidth] = useState<number>(() =>
    loadStoredRailWidth("clinicalStates"),
  );
  const [diagnosisRailWidth, setDiagnosisRailWidth] = useState<number>(() =>
    loadStoredRailWidth("differentialDiagnosis"),
  );
  const [draggingRail, setDraggingRail] = useState<RailId | null>(null);

  const railResizeRef = useRef<{
    rail: RailId;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const resizing = railResizeRef.current;
      if (!resizing) return;

      const delta = event.clientX - resizing.startX;
      // The differential diagnosis rail is anchored to the right edge of
      // the screen, so dragging left (a negative delta) should widen it.
      const signedDelta =
        resizing.rail === "differentialDiagnosis" ? -delta : delta;
      const nextWidth = clampRailWidth(resizing.startWidth + signedDelta);

      if (resizing.rail === "clinicalStates") setClinicalRailWidth(nextWidth);
      else setDiagnosisRailWidth(nextWidth);
    }

    function handleMouseUp() {
      railResizeRef.current = null;
      setDraggingRail(null);
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      RAIL_WIDTH_STORAGE_KEY.clinicalStates,
      String(clinicalRailWidth),
    );
  }, [clinicalRailWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      RAIL_WIDTH_STORAGE_KEY.differentialDiagnosis,
      String(diagnosisRailWidth),
    );
  }, [diagnosisRailWidth]);

  function startRailResize(rail: RailId, event: ReactMouseEvent) {
    event.preventDefault();
    railResizeRef.current = {
      rail,
      startX: event.clientX,
      startWidth: rail === "clinicalStates" ? clinicalRailWidth : diagnosisRailWidth,
    };
    setDraggingRail(rail);
  }

  const activeClinicalState =
    caseRecord.clinicalStates.find(
      (clinicalState) => clinicalState.id === activeClinicalStateId,
    ) ?? caseRecord.clinicalStates[0];

  // Compact, clinically meaningful stand-in for the old ordinal "Clinical
  // State 1"/"Clinical State 2" label — Phase, isoproterenol status, and
  // sedation level, the three things that actually distinguish one
  // recorded state from another (see clinicalStateSummary in
  // app/clinical/model.ts).
  const activeClinicalStateSummary = clinicalStateSummary(
    activeClinicalState.context,
  );

  const differentialResults: DifferentialResult[] = evaluateDifferential(
    caseRecord,
    knowledgeSheets,
  );

  // Diagnoses not yet excluded — the fallback signal maneuver relevance is
  // scored against (see scoreManeuverRelevance in ./maneuvers/knowledge)
  // until Clinical Reasoning rules exist that speak to a given maneuver.
  const activeDiagnosisAbbreviations = new Set(
    differentialResults
      .filter((result) => result.status !== "Excluded")
      .map((result) => result.diagnosis.abbreviatedName.toUpperCase()),
  );

  // Relevance score first (highest first); Base Rank breaks ties (lowest
  // first) — this is the knob that controls the grid's default layout
  // before any relevance scoring differentiates maneuvers, and still
  // settles ties once it does, same tiebreak role Base Rank already
  // plays for diagnoses in the differential engine.
  const sortedManeuverCatalog = [...maneuverCatalog].sort((a, b) => {
    const relevanceDelta =
      scoreManeuverRelevance(b.definition, activeDiagnosisAbbreviations) -
      scoreManeuverRelevance(a.definition, activeDiagnosisAbbreviations);
    if (relevanceDelta !== 0) return relevanceDelta;
    return a.definition.baseRank - b.definition.baseRank;
  });

  // Refractory periods are results recorded on the back of whichever
  // maneuver produces them (tagged via Refractory Period Type/Direction/
  // Structure on Maneuver Response Fields — one field is the whole
  // result), not direct entry — see app/refractoryPeriods/knowledge.ts.
  // Only entries with an actual
  // recorded value for the active Clinical State are shown, so a not-yet-
  // measured Accessory Pathway 2, for instance, simply doesn't appear
  // rather than needing a manual "Add" toggle the way the old direct-
  // entry ERP card did.
  const refractoryPeriodCatalog = buildRefractoryPeriodCatalog(maneuverCatalog);
  const visibleRefractoryPeriods = refractoryPeriodCatalog
    .map((definition) => ({
      definition,
      value: formatRefractoryPeriodValue(definition, activeClinicalState),
    }))
    .filter((entry) => entry.value !== "");

  function saveManeuverPerformance(
    maneuverId: string,
    values: Record<string, string>,
  ) {
    updateActiveClinicalState((current) =>
      upsertPerformance(current, maneuverId, values),
    );
    logStateChange("Maneuver result", maneuverId);
  }

  const activeWorkspace =
    workspaceConfigurations[activeClinicalState.context.rhythm];

  const enteredMeasurementCount = (
    clinicalState: (typeof caseRecord.clinicalStates)[number],
  ) => {
    const workspace = workspaceConfigurations[clinicalState.context.rhythm];

    return workspace.sections.reduce(
      (count, section) =>
        count +
        section.fields.filter(
          (field) => clinicalState.measurements[field.id]?.trim() !== "",
        ).length,
      0,
    );
  };

  function logStateChange(field: string, value: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setStateChanges((current) => [
      ...current,
      `${timestamp} — ${field}: ${value || "blank"}`,
    ]);
  }

  function updateActiveClinicalState(
    updater: (
      current: (typeof caseRecord.clinicalStates)[number],
    ) => (typeof caseRecord.clinicalStates)[number],
  ) {
    setCaseRecord((currentCase) => ({
      ...currentCase,
      clinicalStates: currentCase.clinicalStates.map((clinicalState) =>
        clinicalState.id === activeClinicalStateId
          ? updater(clinicalState)
          : clinicalState,
      ),
    }));
  }

  function updateContext<K extends keyof ClinicalStateContext>(
    key: K,
    value: ClinicalStateContext[K],
    label: string,
  ) {
    updateActiveClinicalState((current) => ({
      ...current,
      context: {
        ...current.context,
        [key]: value,
      },
    }));

    logStateChange(label, String(value));
  }

  function updateMeasurement(
    measurementId: string,
    value: string,
    label: string,
  ) {
    updateActiveClinicalState((current) => ({
      ...current,
      measurements: {
        ...current.measurements,
        [measurementId]: value,
      },
    }));

    logStateChange(label, value ? `${value} ms` : "");
  }

  function addClinicalState() {
    const nextNumber = caseRecord.clinicalStates.length + 1;
    const id = `clinical-state-${Date.now()}`;
    const nextState = createClinicalState(id, {
      phase: activeClinicalState.context.phase,
      sedation: activeClinicalState.context.sedation,
    });

    setCaseRecord((current) => ({
      ...current,
      clinicalStates: [...current.clinicalStates, nextState],
    }));
    setActiveClinicalStateId(id);
    logStateChange("Clinical state", `Added state ${nextNumber}`);
  }

  return (
    <main
      className="appShell"
      style={
        {
          "--clinical-state-rail-width": `${clinicalRailWidth}px`,
          "--diagnosis-monitor-width": `${diagnosisRailWidth}px`,
        } as CSSProperties
      }
    >
      <header className="topbar">
        <div className="brandArea">
          <div className="brand">
            <div className="brandMark">DP</div>
            <h1>Diagnostic Pacing Maneuvers</h1>
          </div>

          <button
            className="aboutButton"
            onClick={() => setAboutOpen(true)}
            type="button"
          >
            About
          </button>
        </div>

        <div className="topActions">
          <div className="activeCase">
            <span />
            <div>
              <small>Active case</small>
              <strong>{caseRecord.title}</strong>
            </div>
          </div>
          <button className="secondaryButton" type="button">
            New case
          </button>
          <button className="primaryButton" type="button">
            Save case
          </button>
          <button className="secondaryButton" type="button">
            Report
          </button>
        </div>
      </header>

      <aside className="clinicalStatesRail" aria-label="Clinical states">
        <div className="clinicalStatesRailHeader">
          <div>
            <p>Case structure</p>
            <h2>Clinical States</h2>
          </div>

          <span>{caseRecord.clinicalStates.length}</span>
        </div>

        <div className="clinicalStateCards">
          {caseRecord.clinicalStates.map((clinicalState, index) => {
            const isActive = clinicalState.id === activeClinicalStateId;

            return (
              <button
                className={`clinicalStateCard${isActive ? " active" : ""}`}
                key={clinicalState.id}
                onClick={() => setActiveClinicalStateId(clinicalState.id)}
                type="button"
              >
                <div className="clinicalStateCardTop">
                  <span className="clinicalStateNumber">{index + 1}</span>
                  <span className="clinicalStateStatus">
                    {isActive ? "Active" : "Recorded"}
                  </span>
                </div>

                <div className="clinicalStateFields">
                  <div className="clinicalStateField">
                    <span className="clinicalStateFieldLabel">Phase</span>
                    <span
                      className="clinicalStateFieldValue"
                      title={clinicalState.context.phase}
                    >
                      {abbreviateClinicalStateLabel(
                        clinicalState.context.phase,
                        knowledgeSheets.clinicalStates,
                      )}
                    </span>
                  </div>
                  <div className="clinicalStateField">
                    <span className="clinicalStateFieldLabel">Rhythm</span>
                    <span
                      className="clinicalStateFieldValue"
                      title={clinicalState.context.rhythm}
                    >
                      {abbreviateClinicalStateLabel(
                        clinicalState.context.rhythm,
                        knowledgeSheets.clinicalStates,
                      )}
                    </span>
                  </div>
                  <div className="clinicalStateField">
                    <span className="clinicalStateFieldLabel">Iso</span>
                    <span
                      className="clinicalStateFieldValue"
                      title={clinicalState.context.isoproterenol.trim() || "Off"}
                    >
                      {abbreviateClinicalStateLabel(
                        clinicalState.context.isoproterenol.trim() || "Off",
                        knowledgeSheets.clinicalStates,
                      )}
                    </span>
                  </div>
                </div>

                <div className="clinicalStateMeta">
                  <span>
                    {enteredMeasurementCount(clinicalState)} measurements
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div
          className={`railResizeHandle${
            draggingRail === "clinicalStates" ? " isDragging" : ""
          }`}
          onMouseDown={(event) => startRailResize("clinicalStates", event)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Clinical States panel"
        />
      </aside>

      <aside
        className="differentialDiagnosisRail"
        aria-label="Differential diagnosis monitor"
      >
        <div
          className={`railResizeHandle${
            draggingRail === "differentialDiagnosis" ? " isDragging" : ""
          }`}
          onMouseDown={(event) =>
            startRailResize("differentialDiagnosis", event)
          }
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Differential Diagnosis panel"
        />

        <Panel eyebrow="Differential diagnosis" title="">
          {maneuverCatalogStatus === "loading" && (
            <p className="maneuverCatalogStatus">Loading knowledge base…</p>
          )}

          {maneuverCatalogStatus === "error" && (
            <p className="maneuverCatalogStatus isError">
              Couldn&rsquo;t load the knowledge base. Try reloading the page.
            </p>
          )}

          {maneuverCatalogStatus === "ready" &&
            differentialResults.length === 0 && (
              <p className="maneuverCatalogStatus">
                No diagnoses are defined in the knowledge base yet — add them
                in the admin editor.
              </p>
            )}

          {maneuverCatalogStatus === "ready" &&
            differentialResults.length > 0 && (
              <div className="diagnosisList">
                {differentialResults.map((result) => (
                  <article
                    className="diagnosisCard"
                    key={result.diagnosis.diagnosisId}
                  >
                    <div className="diagnosisTop">
                      <span className="abbreviation">
                        {result.diagnosis.abbreviatedName}
                      </span>
                      <div className="diagnosisText">
                        <h3>{result.diagnosis.fullName}</h3>
                        <p>{result.diagnosis.description}</p>
                      </div>
                      <span
                        className={`status ${result.status.toLowerCase()}`}
                      >
                        {DIFFERENTIAL_STATUS_LABEL[result.status]}
                      </span>

                      <button
                        className="diagnosisWhyButton"
                        type="button"
                        title="Show justification"
                        onClick={() =>
                          window.alert(explainDifferentialResult(result))
                        }
                      >
                        Why?
                      </button>
                    </div>

                    <div className="confidence">
                      <small>
                        {result.status === "Possible"
                          ? `${result.supportCount} supporting finding${
                              result.supportCount === 1 ? "" : "s"
                            }`
                          : `${result.findings.length} clinical reasoning finding${
                              result.findings.length === 1 ? "" : "s"
                            }`}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </Panel>
      </aside>

      <section className="caseStrip" aria-label="Active clinical state">
        <div className="stateToolbarRow">
          <div className="toolbarHeading activeClinicalStateHeading">
            <div className="activeClinicalStateLabel">
              <span className="liveIndicator" />
              <small>Active Clinical State</small>
            </div>

            <button
              className="newClinicalStateButton"
              onClick={addClinicalState}
              type="button"
            >
              NEW
            </button>
          </div>

          <div className="toolbarField phaseField">
            <label htmlFor="phase">Phase</label>
            <select
              id="phase"
              value={activeClinicalState.context.phase}
              onChange={(event) =>
                updateContext(
                  "phase",
                  event.target.value as ClinicalStateContext["phase"],
                  "Phase",
                )
              }
            >
              {phaseOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="toolbarField rhythmField">
            <label htmlFor="rhythm">Rhythm</label>
            <select
              id="rhythm"
              value={activeClinicalState.context.rhythm}
              onChange={(event) =>
                updateContext(
                  "rhythm",
                  event.target.value as ClinicalStateContext["rhythm"],
                  "Rhythm",
                )
              }
            >
              {rhythmOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="toolbarField sedationField">
            <label htmlFor="sedation">Sedation</label>
            <select
              id="sedation"
              value={activeClinicalState.context.sedation}
              onChange={(event) =>
                updateContext(
                  "sedation",
                  event.target.value as ClinicalStateContext["sedation"],
                  "Sedation",
                )
              }
            >
              {sedationOptions.map((option) => (
                <option key={option}>{option}</option>
              ))}
            </select>
          </div>

          <div className="toolbarField">
            <label htmlFor="isoproterenol">Isoproterenol</label>
            <input
              id="isoproterenol"
              inputMode="decimal"
              value={activeClinicalState.context.isoproterenol}
              onChange={(event) =>
                updateActiveClinicalState((current) => ({
                  ...current,
                  context: {
                    ...current.context,
                    isoproterenol: event.target.value,
                  },
                }))
              }
              onBlur={(event) =>
                logStateChange("Isoproterenol", event.target.value)
              }
              aria-label="Isoproterenol value"
            />
          </div>

          <div className="toolbarField">
            <label htmlFor="adenosine">Adenosine</label>
            <input
              id="adenosine"
              inputMode="decimal"
              value={activeClinicalState.context.adenosine}
              onChange={(event) =>
                updateActiveClinicalState((current) => ({
                  ...current,
                  context: {
                    ...current.context,
                    adenosine: event.target.value,
                  },
                }))
              }
              onBlur={(event) =>
                logStateChange("Adenosine", event.target.value)
              }
              aria-label="Adenosine value"
            />
          </div>

          <div className="toolbarField">
            <label htmlFor="epinephrin">Epinephrin</label>
            <input
              id="epinephrin"
              inputMode="decimal"
              value={activeClinicalState.context.epinephrin}
              onChange={(event) =>
                updateActiveClinicalState((current) => ({
                  ...current,
                  context: {
                    ...current.context,
                    epinephrin: event.target.value,
                  },
                }))
              }
              onBlur={(event) =>
                logStateChange("Epinephrin", event.target.value)
              }
              aria-label="Epinephrin value"
            />
          </div>
        </div>

        {activeWorkspace.sections.map((section) => (
          <div className="clinicalMeasurementRow" key={section.id}>
            <div className="intervalsHeading">
              <span>{section.title}</span>
            </div>

            <div
              className="clinicalMeasurementFields"
              style={{
                gridTemplateColumns: `repeat(${section.fields.length}, minmax(120px, 1fr))`,
              }}
            >
              {section.fields.map((field) => {
                return (
                  <div
                    className="toolbarField intervalField"
                    key={field.id}
                  >
                    <label htmlFor={`measurement-${field.id}`}>
                      {field.label}
                    </label>

                    <div className="unitInput">
                      <input
                        id={`measurement-${field.id}`}
                        inputMode="decimal"
                        value={
                          activeClinicalState.measurements[field.id] ?? ""
                        }
                        onChange={(event) =>
                          updateActiveClinicalState((current) => ({
                            ...current,
                            measurements: {
                              ...current.measurements,
                              [field.id]: event.target.value,
                            },
                          }))
                        }
                        onBlur={(event) =>
                          updateMeasurement(
                            field.id,
                            event.target.value,
                            field.label,
                          )
                        }
                        aria-label={`${field.label} in milliseconds`}
                      />
                      <span>{field.unit}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ))}

        {activeWorkspace.sections.length === 0 && (
          <div className="clinicalWorkspacePlaceholder">
            <strong>{activeClinicalState.context.rhythm}</strong>
            <p>{activeWorkspace.placeholder}</p>
          </div>
        )}
      </section>

      <section
        className="effectiveRefractoryPeriodCard"
        aria-labelledby="refractory-periods-heading"
      >
        <div className="clinicalMeasurementRow">
          <div className="intervalsHeading">
            <span id="refractory-periods-heading">Refractory Periods</span>
          </div>

          {maneuverCatalogStatus === "ready" &&
            visibleRefractoryPeriods.length === 0 && (
              <p className="maneuverCatalogStatus">
                No refractory periods recorded yet for{" "}
                {activeClinicalStateSummary} — record one on the back of
                whichever maneuver card produces it.
              </p>
            )}

          {visibleRefractoryPeriods.length > 0 && (
            <div
              className="clinicalMeasurementFields"
              style={{
                gridTemplateColumns: `repeat(${visibleRefractoryPeriods.length}, minmax(150px, 1fr))`,
              }}
            >
              {visibleRefractoryPeriods.map(({ definition, value }) => (
                <div
                  className="toolbarField intervalField"
                  key={definition.id}
                >
                  <label htmlFor={`refractory-period-${definition.id}`}>
                    {definition.label}
                  </label>

                  <div className="unitInput">
                    <input
                      id={`refractory-period-${definition.id}`}
                      value={value}
                      readOnly
                      aria-label={`${definition.label} in milliseconds, via ${definition.maneuverName}`}
                    />
                    <span>ms</span>
                  </div>

                  <p className="refractoryPeriodSource">
                    via {definition.maneuverName}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      <section className="workspace">


        <Panel eyebrow="Pacing maneuvers" title="">
          <p className="maneuverGridSubhead">
            Ordered by relevance to the current differential — no separate
            &ldquo;already performed&rdquo; section, since a maneuver can
            become relevant again under a different Clinical State. Showing
            results for <strong>{activeClinicalStateSummary}</strong>.
          </p>

          {maneuverCatalogStatus === "loading" && (
            <p className="maneuverCatalogStatus">Loading maneuvers…</p>
          )}

          {maneuverCatalogStatus === "error" && (
            <p className="maneuverCatalogStatus isError">
              Couldn&rsquo;t load the maneuver knowledge base. Try reloading
              the page.
            </p>
          )}

          {maneuverCatalogStatus === "ready" &&
            sortedManeuverCatalog.length === 0 && (
              <p className="maneuverCatalogStatus">
                No maneuvers are defined in the knowledge base yet — add them
                from the admin editor.
              </p>
            )}

          {maneuverCatalogStatus === "ready" &&
            sortedManeuverCatalog.length > 0 && (
              <div className="maneuverGrid">
                {sortedManeuverCatalog.map((entry) => {
                  // The actual other states this maneuver's been recorded
                  // under, not just a count — the card needs to show what
                  // each one was (Phase/Iso/Sedation), not merely how many.
                  const otherStatesPerformed: ClinicalState[] =
                    caseRecord.clinicalStates.filter(
                      (clinicalState) =>
                        clinicalState.id !== activeClinicalState.id &&
                        findPerformance(
                          clinicalState,
                          entry.definition.maneuverId,
                        ) !== null,
                    );

                  return (
                    <ManeuverCard
                      key={entry.definition.maneuverId}
                      entry={entry}
                      performance={findPerformance(
                        activeClinicalState,
                        entry.definition.maneuverId,
                      )}
                      otherStatesPerformed={otherStatesPerformed}
                      activeClinicalStateSummary={activeClinicalStateSummary}
                      onSave={(values) =>
                        saveManeuverPerformance(
                          entry.definition.maneuverId,
                          values,
                        )
                      }
                    />
                  );
                })}
              </div>
            )}
        </Panel>

        <Panel eyebrow="Current interpretation" title="Evidence and reasoning">
          <article className="synthesis">
            <small>Current synthesis</small>
            <h3>Typical AVNRT is favored, but ORT remains unresolved.</h3>
            <p>
              The short septal VA interval and concentric retrograde activation
              support AVNRT. A ventricular maneuver is still required before
              excluding a concealed septal accessory pathway.
            </p>
          </article>

          <div className="evidenceList">
            <article>
              <span className="positiveDot" />
              <div>
                <h3>Short septal VA</h3>
                <p>Compatible with typical AVNRT.</p>
              </div>
            </article>

            <article>
              <span className="positiveDot" />
              <div>
                <h3>Concentric atrial activation</h3>
                <p>Earliest atrial activation is septal.</p>
              </div>
            </article>

            <article>
              <span className="unresolvedDot" />
              <div>
                <h3>Accessory pathway unresolved</h3>
                <p>No pathway-specific ventricular maneuver is recorded.</p>
              </div>
            </article>
          </div>

          <div className="safetyNotice">
            <strong>Clinical review required</strong>
            <p>
              Recommendations are decision-support outputs and require review
              against the complete study context.
            </p>
          </div>
        </Panel>
      </section>

      <section className="lowerWorkspace">
        <Panel eyebrow="Current finding" title="Maneuver result entry">
          <div className="emptyState">
            <span>+</span>
            <div>
              <h3>No active maneuver</h3>
              <p>
                Begin a maneuver to enter pacing parameters, observed responses,
                and interpretation.
              </p>
            </div>
            <button className="secondaryButton">Enter manually</button>
          </div>
        </Panel>

        <Panel eyebrow="Recorded steps" title="Case timeline">
          <div className="timeline">
            <div className="timelineHeader">
              <span>Step</span>
              <span>Maneuver</span>
              <span>Observed result</span>
              <span>Diagnostic effect</span>
            </div>

            <div className="timelineRow">
              <span>01</span>
              <strong>Baseline observations</strong>
              <span>Regular narrow-complex tachycardia; TCL 330 ms</span>
              <span>AV node-dependent SVT suspected</span>
            </div>

            <div className="timelineRow">
              <span>02</span>
              <strong>Retrograde activation review</strong>
              <span>Concentric; earliest at the His region</span>
              <span>AVNRT favored</span>
            </div>
          </div>

          <div className="stateLogPanel">
            <div className="stateLogHeader">
              <div>
                <small>Current-state history</small>
                <h3>State log</h3>
              </div>
              <span>{stateChanges.length} changes</span>
            </div>

            {stateChanges.length ? (
              <div className="stateLogList">
                {[...stateChanges]
                  .reverse()
                  .slice(0, 8)
                  .map((change, index) => (
                    <div className="stateLogEntry" key={`${change}-${index}`}>
                      <span>{String(stateChanges.length - index).padStart(2, "0")}</span>
                      <p>{change}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="stateLogEmpty">
                State changes will appear here as rhythm conditions,
                medications, and intervals are updated.
              </div>
            )}
          </div>
        </Panel>
      </section>

      {aboutOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => setAboutOpen(false)}
        >
          <section
            aria-labelledby="about-title"
            aria-modal="true"
            className="aboutModal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modalHeader">
              <div>
                <p>Open-source project</p>
                <h2 id="about-title">About Diagnostic Pacing Maneuvers</h2>
              </div>
            </header>

            <div className="modalBody">
              <p>
                Diagnostic Pacing Maneuvers is an interactive educational and
                clinical decision-support workspace for organizing pacing
                maneuvers, observations, diagnostic reasoning, and case
                reports.
              </p>

              <p>
                The diagnostic engines and logic will be maintained as
                separate open-source packages so they can be inspected,
                tested, and used independently of this interface.
              </p>

              <div className="downloadSection">
                <h3>Knowledge base</h3>

                <div className="downloadCard">
                  <div>
                    <strong>Browse the clinical knowledge base</strong>
                    <span>
                      Every maneuver, diagnosis, and reasoning rule the
                      workspace uses — read-only, with a download to
                      Excel any time
                    </span>
                  </div>
                  <Link
                    className="downloadCardAction"
                    href="/knowledge"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </Link>
                </div>
              </div>

              <p className="modalNotice">
                This early GUI draft contains demonstration content only. The
                clinical reasoning engine has not yet been connected.
              </p>
            </div>

            <div className="modalFooter">
              <button
                className="modalOkButton"
                onClick={() => setAboutOpen(false)}
                type="button"
              >
                OK
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="statusbar">
        <div>
          <span className="onlineDot" />
          <strong>Local draft</strong>
          <span>No patient data is being transmitted</span>
        </div>
        <div>
          <span>Rules engine: not connected</span>
          <span>Autosave: off</span>
          <span>GUI draft v1</span>
        </div>
      </footer>
    </main>
  );
}
