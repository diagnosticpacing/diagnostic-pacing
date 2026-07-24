"use client";

import { useState } from "react";

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

const maneuvers = [
  {
    name: "His-refractory PVC",
    category: "Ventricular pacing",
    description:
      "Assess whether a ventricular stimulus advances, delays, or terminates the tachycardia.",
  },
  {
    name: "Ventricular overdrive pacing",
    category: "Entrainment",
    description:
      "Evaluate the post-pacing response, PPI–TCL, and SA–VA.",
  },
  {
    name: "Para-Hisian pacing",
    category: "Accessory pathway",
    description:
      "Compare retrograde atrial timing with and without His capture.",
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
  const [selectedManeuver, setSelectedManeuver] = useState(0);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [phase, setPhase] = useState("Pre-ablation");
  const [rhythm, setRhythm] = useState("Normal Sinus Rhythm");
  const [sedation, setSedation] = useState("Awake");
  const [isoproterenol, setIsoproterenol] = useState("");
  const [adenosine, setAdenosine] = useState("");
  const [epinephrin, setEpinephrin] = useState("");
  const [intervals, setIntervals] = useState({
    rr: "",
    pr: "",
    ah: "",
    hv: "",
    qrsDuration: "",
    qt: "",
  });
  const [refractoryPeriods, setRefractoryPeriods] = useState({
    atrial: "",
    fastPathway: "",
    slowPathway: "",
    accessoryPathway1: "",
    accessoryPathway2: "",
    avNode: "",
    ventricular: "",
    retrograde: "",
  });
  const [stateChanges, setStateChanges] = useState<string[]>([]);

  const currentManeuver = maneuvers[selectedManeuver];

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

  function updateInterval(
    key: keyof typeof intervals,
    label: string,
    value: string,
  ) {
    setIntervals((current) => ({
      ...current,
      [key]: value,
    }));

    logStateChange(label, value ? `${value} ms` : "");
  }

  function updateRefractoryPeriod(
    key: keyof typeof refractoryPeriods,
    label: string,
    value: string,
  ) {
    setRefractoryPeriods((current) => ({
      ...current,
      [key]: value,
    }));

    logStateChange(`${label} refractory period`, value ? `${value} ms` : "");
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
              <strong>Untitled study</strong>
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

      <section className="caseStrip" aria-label="Current rhythm state">
        <div className="stateToolbarRow">
          <div className="toolbarHeading">
            <span className="liveIndicator" />
            <div>
              <small>Current state</small>
            </div>
          </div>

          <div className="toolbarField phaseField">
            <label htmlFor="phase">Phase</label>
            <select
              id="phase"
              value={phase}
              onChange={(event) => {
                setPhase(event.target.value);
                logStateChange("Phase", event.target.value);
              }}
            >
              <option>Pre-ablation</option>
              <option>Post-ablation</option>
            </select>
          </div>

          <div className="toolbarField rhythmField">
            <label htmlFor="rhythm">Rhythm</label>
            <select
              id="rhythm"
              value={rhythm}
              onChange={(event) => {
                setRhythm(event.target.value);
                logStateChange("Rhythm", event.target.value);
              }}
            >
              <option>Normal Sinus Rhythm</option>
              <option>Tachycardia</option>
              <option>A-paced V-sensed</option>
              <option>AV-paced</option>
              <option>A-sensed V-paced</option>
            </select>
          </div>

          <div className="toolbarField sedationField">
            <label htmlFor="sedation">Sedation</label>
            <select
              id="sedation"
              value={sedation}
              onChange={(event) => {
                setSedation(event.target.value);
                logStateChange("Sedation", event.target.value);
              }}
            >
              <option>Awake</option>
              <option>Conscious sedation</option>
              <option>General Anesthesia</option>
            </select>
          </div>

          <div className="toolbarField">
            <label htmlFor="isoproterenol">Isoproterenol</label>
            <input
              id="isoproterenol"
              inputMode="decimal"
              value={isoproterenol}
              onChange={(event) => setIsoproterenol(event.target.value)}
              onBlur={() =>
                logStateChange("Isoproterenol", isoproterenol)
              }
              aria-label="Isoproterenol value"
            />
          </div>

          <div className="toolbarField">
            <label htmlFor="adenosine">Adenosine</label>
            <input
              id="adenosine"
              inputMode="decimal"
              value={adenosine}
              onChange={(event) => setAdenosine(event.target.value)}
              onBlur={() => logStateChange("Adenosine", adenosine)}
              aria-label="Adenosine value"
            />
          </div>

          <div className="toolbarField">
            <label htmlFor="epinephrin">Epinephrin</label>
            <input
              id="epinephrin"
              inputMode="decimal"
              value={epinephrin}
              onChange={(event) => setEpinephrin(event.target.value)}
              onBlur={() => logStateChange("Epinephrin", epinephrin)}
              aria-label="Epinephrin value"
            />
          </div>
        </div>

        <div className="intervalsToolbarRow">
          <div className="intervalsHeading">
            <span>Intervals</span>
          </div>

          {rhythm === "Normal Sinus Rhythm" ? (
            <div className="intervalFields">
              {[
                ["rr", "RR"],
                ["pr", "PR"],
                ["ah", "AH"],
                ["hv", "HV"],
                ["qrsDuration", "QRS duration"],
                ["qt", "QT"],
              ].map(([key, label]) => (
                <div className="toolbarField intervalField" key={key}>
                  <label htmlFor={`interval-${key}`}>{label}</label>
                  <div className="unitInput">
                    <input
                      id={`interval-${key}`}
                      inputMode="decimal"
                      value={intervals[key as keyof typeof intervals]}
                      onChange={(event) =>
                        setIntervals((current) => ({
                          ...current,
                          [key]: event.target.value,
                        }))
                      }
                      onBlur={(event) =>
                        updateInterval(
                          key as keyof typeof intervals,
                          label,
                          event.target.value,
                        )
                      }
                      aria-label={`${label} interval in milliseconds`}
                    />
                    <span>ms</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="intervalPlaceholder">
              Interval fields for the selected rhythm will be added here.
            </div>
          )}
        </div>

        <div className="refractoryPeriodsToolbarRow">
          <div className="intervalsHeading">
            <span>Refractory Periods</span>
          </div>

          <div className="refractoryPeriodFields">
            {[
              ["atrial", "Atrial"],
              ["fastPathway", "Fast Pathway"],
              ["slowPathway", "Slow Pathway"],
              ["accessoryPathway1", "Accessory Pathway 1"],
              ["accessoryPathway2", "Accessory Pathway 2"],
              ["avNode", "AV Node"],
              ["ventricular", "Ventricular"],
              ["retrograde", "Retrograde"],
            ].map(([key, label]) => (
              <div className="toolbarField intervalField" key={key}>
                <label htmlFor={`refractory-period-${key}`}>{label}</label>
                <div className="unitInput">
                  <input
                    id={`refractory-period-${key}`}
                    inputMode="decimal"
                    value={
                      refractoryPeriods[
                        key as keyof typeof refractoryPeriods
                      ]
                    }
                    onChange={(event) =>
                      setRefractoryPeriods((current) => ({
                        ...current,
                        [key]: event.target.value,
                      }))
                    }
                    onBlur={(event) =>
                      updateRefractoryPeriod(
                        key as keyof typeof refractoryPeriods,
                        label,
                        event.target.value,
                      )
                    }
                    aria-label={`${label} refractory period in milliseconds`}
                  />
                  <span>ms</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="workspace">
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

        <Panel eyebrow="Pacing maneuvers" title="">
          <article className="recommendation">
            <span className="stepNumber">
              {String(selectedManeuver + 1).padStart(2, "0")}
            </span>
            <div>
              <small>{currentManeuver.category}</small>
              <h3>{currentManeuver.name}</h3>
              <p>{currentManeuver.description}</p>
            </div>
          </article>

          <div className="rationale">
            <strong>Why this maneuver?</strong>
            <p>
              This is currently the highest-yield step for separating AVNRT
              from an accessory pathway-mediated tachycardia.
            </p>
          </div>

          <div className="buttonRow">
            <button className="primaryButton">Begin maneuver</button>
            <button className="secondaryButton">View guide</button>
          </div>

          <p className="sectionLabel">Alternative maneuvers</p>

          <div className="maneuverList">
            {maneuvers.map((maneuver, index) => (
              <button
                className={selectedManeuver === index ? "selected" : ""}
                key={maneuver.name}
                onClick={() => setSelectedManeuver(index)}
              >
                <span>{String(index + 1).padStart(2, "0")}</span>
                <div>
                  <strong>{maneuver.name}</strong>
                  <small>{maneuver.category}</small>
                </div>
              </button>
            ))}
          </div>
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
