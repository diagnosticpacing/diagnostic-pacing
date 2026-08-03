"use client";

import { useEffect, useState } from "react";

import {
  createClinicalState,
  createInitialCase,
  findPerformance,
  medicationSummary,
  phaseOptions,
  rhythmOptions,
  sedationOptions,
  upsertPerformance,
  workspaceConfigurations,
  type ClinicalStateContext,
  effectiveRefractoryPeriodComponentId,
  effectiveRefractoryPeriodValues,
  formatEffectiveRefractoryPeriod,
} from "./clinical/model";
import {
  buildManeuverCatalog,
  scoreManeuverRelevance,
  type ManeuverCatalogEntry,
} from "./maneuvers/knowledge";
import ManeuverCard from "./maneuvers/ManeuverCard";

const diagnoses = [
  {
    abbreviation: "AVNRT",
    name: "AV nodal reentrant tachycardia",
    status: "Leading",
    confidence: 72,
    reason: "Short VA interval and concentric retrograde activation.",
  },
  {
    abbreviation: "ORT",
    name: "Orthodromic reciprocating tachycardia",
    status: "Possible",
    confidence: 48,
    reason: "Accessory pathway participation has not been excluded.",
  },
  {
    abbreviation: "AT",
    name: "Atrial tachycardia",
    status: "Less likely",
    confidence: 21,
    reason: "Current findings favor an AV node-dependent mechanism.",
  },
  {
    abbreviation: "JT",
    name: "Junctional tachycardia",
    status: "Excluded",
    confidence: 4,
    reason: "Current observations argue against an automatic junctional rhythm.",
  },
];

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
  const [aboutOpen, setAboutOpen] = useState(false);
  const [caseRecord, setCaseRecord] = useState(createInitialCase);
  const [activeClinicalStateId, setActiveClinicalStateId] = useState(
    "clinical-state-1",
  );
  const [stateChanges, setStateChanges] = useState<string[]>([]);

  const [maneuverCatalog, setManeuverCatalog] = useState<
    ManeuverCatalogEntry[]
  >([]);
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
        setManeuverCatalog(
          buildManeuverCatalog(
            data.sheets as Parameters<typeof buildManeuverCatalog>[0],
          ),
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

  const activeClinicalState =
    caseRecord.clinicalStates.find(
      (clinicalState) => clinicalState.id === activeClinicalStateId,
    ) ?? caseRecord.clinicalStates[0];

  const activeClinicalStateIndex = caseRecord.clinicalStates.findIndex(
    (clinicalState) => clinicalState.id === activeClinicalState.id,
  );
  const activeClinicalStateLabel = `Clinical State ${
    activeClinicalStateIndex === -1 ? 1 : activeClinicalStateIndex + 1
  }`;

  // Diagnoses not yet excluded — the fallback signal maneuver relevance is
  // scored against until a real differential-diagnosis engine exists (see
  // scoreManeuverRelevance in ./maneuvers/knowledge).
  const activeDiagnosisAbbreviations = new Set(
    diagnoses
      .filter((diagnosis) => diagnosis.status !== "Excluded")
      .map((diagnosis) => diagnosis.abbreviation.toUpperCase()),
  );

  const sortedManeuverCatalog = [...maneuverCatalog].sort(
    (a, b) =>
      scoreManeuverRelevance(b.definition, activeDiagnosisAbbreviations) -
      scoreManeuverRelevance(a.definition, activeDiagnosisAbbreviations),
  );

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

  const effectiveRefractoryPeriodSection =
    activeWorkspace.sections.find((section) =>
      section.fields.some((field) => field.effectiveRefractoryPeriod),
    );

  const effectiveRefractoryPeriodBadge =
    activeClinicalState.context.rhythm === "Atrial Pacing"
      ? "Antegrade"
      : activeClinicalState.context.rhythm === "Ventricular Pacing"
        ? "Retrograde"
        : activeClinicalState.context.rhythm;

  const effectiveRefractoryPeriodFieldOrder =
    activeClinicalState.context.rhythm === "Atrial Pacing"
      ? [
          "erp.fast-pathway",
          "erp.slow-pathway",
          "erp.accessory-pathway-1",
          ...(activeClinicalState.erpDisplay.showAccessoryPathway2
            ? ["erp.accessory-pathway-2"]
            : []),
          "erp.av-node",
          "erp.atrial",
        ]
      : activeClinicalState.context.rhythm === "Ventricular Pacing"
        ? [
            "erp.accessory-pathway-1",
            ...(activeClinicalState.erpDisplay.showAccessoryPathway2
              ? ["erp.accessory-pathway-2"]
              : []),
            "erp.retrograde",
            "erp.ventricular",
          ]
        : [];

  const visibleEffectiveRefractoryPeriodFields =
    effectiveRefractoryPeriodFieldOrder
      .map((fieldId) =>
        effectiveRefractoryPeriodSection?.fields.find(
          (field) => field.id === fieldId,
        ),
      )
      .filter(
        (
          field,
        ): field is NonNullable<
          typeof effectiveRefractoryPeriodSection
        >["fields"][number] => Boolean(field),
      );

  const standardMeasurementSections =
    activeWorkspace.sections.filter(
      (section) =>
        !section.fields.some((field) => field.effectiveRefractoryPeriod),
    );

  const enteredMeasurementCount = (
    clinicalState: (typeof caseRecord.clinicalStates)[number],
  ) => {
    const workspace = workspaceConfigurations[clinicalState.context.rhythm];

    return workspace.sections.reduce(
      (count, section) =>
        count +
        section.fields.filter((field) => {
          if (field.effectiveRefractoryPeriod) {
            return (
              formatEffectiveRefractoryPeriod(
                clinicalState.measurements,
                field.id,
              ) !== ""
            );
          }

          return (
            clinicalState.measurements[field.id]?.trim() !== ""
          );
        }).length,
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

  function updateEffectiveRefractoryPeriod(
    fieldId: string,
    componentNumber: 1 | 2 | 3,
    value: string,
    label: string,
  ) {
    const componentId = effectiveRefractoryPeriodComponentId(
      fieldId,
      componentNumber,
    );

    let formattedValue = "";

    updateActiveClinicalState((current) => {
      const measurements = {
        ...current.measurements,
        [componentId]: value,
      };

      formattedValue = formatEffectiveRefractoryPeriod(
        measurements,
        fieldId,
      );

      return {
        ...current,
        measurements,
      };
    });

    logStateChange(
      label,
      formattedValue ? `${formattedValue} ms` : "",
    );
  }

  function addAccessoryPathway2() {
    updateActiveClinicalState((current) => ({
      ...current,
      erpDisplay: {
        ...current.erpDisplay,
        showAccessoryPathway2: true,
      },
    }));

    logStateChange("ERP display", "Added Accessory Pathway 2");
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
    <main className="appShell">
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

        <nav className="tabs">
          <button className="active">Workspace</button>
          <button>Reference</button>
        </nav>

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

                <strong>{clinicalState.context.phase}</strong>
                <p>{clinicalState.context.rhythm}</p>

                <div className="clinicalStateMeta">
                  <span>
                    {medicationSummary(
                      clinicalState.context.isoproterenol,
                    )}
                  </span>
                  <span>
                    {enteredMeasurementCount(clinicalState)} measurements
                  </span>
                </div>
              </button>
            );
          })}
        </div>

      </aside>

      <aside
        className="differentialDiagnosisRail"
        aria-label="Differential diagnosis monitor"
      >
        <Panel eyebrow="Differential diagnosis" title="">
          <div className="diagnosisList">
            {diagnoses.map((diagnosis) => (
              <article className="diagnosisCard" key={diagnosis.abbreviation}>
                <div className="diagnosisTop">
                  <span className="abbreviation">
                    {diagnosis.abbreviation}
                  </span>
                  <div className="diagnosisText">
                    <h3>{diagnosis.name}</h3>
                    <p>{diagnosis.reason}</p>
                  </div>
                  <span
                    className={`status ${diagnosis.status
                      .toLowerCase()
                      .replace(" ", "-")}`}
                  >
                    {diagnosis.status}
                  </span>

                  <button
                    className="diagnosisWhyButton"
                    type="button"
                    title="Show justification"
                    onClick={() => window.alert(diagnosis.reason)}
                  >
                    Why?
                  </button>
                </div>

                <div className="confidence">
                  <div>
                    <span style={{ width: `${diagnosis.confidence}%` }} />
                  </div>
                  <small>{diagnosis.confidence}%</small>
                </div>
              </article>
            ))}
          </div>
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

        {standardMeasurementSections.map((section) => (
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
                if (field.effectiveRefractoryPeriod) {
                  const values = effectiveRefractoryPeriodValues(
                    activeClinicalState.measurements,
                    field.id,
                  );

                  return (
                    <div
                      className="toolbarField intervalField erpField"
                      key={field.id}
                    >
                      <label>{field.label}</label>

                      <div className="erpSeriesInput">
                        {values.map((value, index) => {
                          const componentNumber = (index + 1) as 1 | 2 | 3;
                          const componentId =
                            effectiveRefractoryPeriodComponentId(
                              field.id,
                              componentNumber,
                            );

                          return (
                            <div
                              className="erpSeriesComponent"
                              key={componentId}
                            >
                              {index > 0 && (
                                <span
                                  className="erpSeriesSeparator"
                                  aria-hidden="true"
                                >
                                  /
                                </span>
                              )}

                              <input
                                id={`measurement-${componentId}`}
                                inputMode="numeric"
                                value={value}
                                onChange={(event) =>
                                  updateActiveClinicalState((current) => ({
                                    ...current,
                                    measurements: {
                                      ...current.measurements,
                                      [componentId]: event.target.value,
                                    },
                                  }))
                                }
                                onBlur={(event) =>
                                  updateEffectiveRefractoryPeriod(
                                    field.id,
                                    componentNumber,
                                    event.target.value,
                                    field.label,
                                  )
                                }
                                aria-label={`${field.label}, value ${componentNumber} in milliseconds`}
                              />
                            </div>
                          );
                        })}

                        <span className="erpSeriesUnit">{field.unit}</span>
                      </div>
                    </div>
                  );
                }

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

      {effectiveRefractoryPeriodSection && (
        <section
          className="effectiveRefractoryPeriodCard"
          aria-labelledby="effective-refractory-periods-heading"
        >
          <header className="effectiveRefractoryPeriodCardHeader">
            <div>
              <p>Clinical state measurements</p>
              <h2 id="effective-refractory-periods-heading">
                Effective Refractory Periods
              </h2>
            </div>

            <span className="effectiveRefractoryPeriodStateLabel">
              {effectiveRefractoryPeriodBadge}
            </span>
          </header>

          <div className="effectiveRefractoryPeriodGrid">
            {visibleEffectiveRefractoryPeriodFields.map((field) => {
              const values = effectiveRefractoryPeriodValues(
                activeClinicalState.measurements,
                field.id,
              );

              return (
                <div className="effectiveRefractoryPeriodItem" key={field.id}>
                  <div className="effectiveRefractoryPeriodItemHeader">
                    <label className="effectiveRefractoryPeriodLabel">
                      {field.label}
                    </label>

                    {field.id === "erp.accessory-pathway-1" &&
                      !activeClinicalState.erpDisplay.showAccessoryPathway2 && (
                        <button
                          className="addAccessoryPathwayButton"
                          onClick={addAccessoryPathway2}
                          type="button"
                        >
                          Add
                        </button>
                      )}
                  </div>

                  <div className="effectiveRefractoryPeriodInputs">
                    {values.map((value, index) => {
                      const componentNumber = (index + 1) as 1 | 2 | 3;
                      const componentId =
                        effectiveRefractoryPeriodComponentId(
                          field.id,
                          componentNumber,
                        );

                      return (
                        <div
                          className="effectiveRefractoryPeriodComponent"
                          key={componentId}
                        >
                          {index > 0 && (
                            <span
                              className="effectiveRefractoryPeriodSeparator"
                              aria-hidden="true"
                            >
                              /
                            </span>
                          )}

                          <input
                            id={`measurement-${componentId}`}
                            inputMode="numeric"
                            value={value}
                            onChange={(event) =>
                              updateActiveClinicalState((current) => ({
                                ...current,
                                measurements: {
                                  ...current.measurements,
                                  [componentId]: event.target.value,
                                },
                              }))
                            }
                            onBlur={(event) =>
                              updateEffectiveRefractoryPeriod(
                                field.id,
                                componentNumber,
                                event.target.value,
                                field.label,
                              )
                            }
                            aria-label={`${field.label}, value ${componentNumber} in milliseconds`}
                          />
                        </div>
                      );
                    })}

                    <span className="effectiveRefractoryPeriodUnit">
                      {field.unit}
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      <section className="workspace">


        <Panel eyebrow="Pacing maneuvers" title="">
          <p className="maneuverGridSubhead">
            Ordered by relevance to the current differential — no separate
            &ldquo;already performed&rdquo; section, since a maneuver can
            become relevant again under a different Clinical State. Showing
            results for <strong>{activeClinicalStateLabel}</strong>.
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
                  const relevanceScore = scoreManeuverRelevance(
                    entry.definition,
                    activeDiagnosisAbbreviations,
                  );
                  const otherStatesPerformedCount =
                    caseRecord.clinicalStates.filter(
                      (clinicalState) =>
                        clinicalState.id !== activeClinicalState.id &&
                        findPerformance(
                          clinicalState,
                          entry.definition.maneuverId,
                        ) !== null,
                    ).length;

                  return (
                    <ManeuverCard
                      key={entry.definition.maneuverId}
                      entry={entry}
                      performance={findPerformance(
                        activeClinicalState,
                        entry.definition.maneuverId,
                      )}
                      otherStatesPerformedCount={otherStatesPerformedCount}
                      isSuggested={relevanceScore > 0}
                      activeClinicalStateLabel={activeClinicalStateLabel}
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

              <button
                aria-label="Close About window"
                className="modalClose"
                onClick={() => setAboutOpen(false)}
                type="button"
              >
                ×
              </button>
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
                <h3>Open-source downloads</h3>

                <div className="downloadCard">
                  <div>
                    <strong>Diagnostic engine package</strong>
                    <span>
                      Framework-independent TypeScript reasoning engine
                    </span>
                  </div>
                  <button disabled type="button">
                    Coming soon
                  </button>
                </div>

                <div className="downloadCard">
                  <div>
                    <strong>Clinical logic and rules</strong>
                    <span>
                      Versioned maneuver definitions and diagnostic rules
                    </span>
                  </div>
                  <button disabled type="button">
                    Coming soon
                  </button>
                </div>
              </div>

              <p className="modalNotice">
                This early GUI draft contains demonstration content only. The
                clinical reasoning engine has not yet been connected.
              </p>
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
