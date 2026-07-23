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
  const currentManeuver = maneuvers[selectedManeuver];

  return (
    <main className="appShell">
      <header className="topbar">
        <div className="brand">
          <div className="brandMark">DP</div>
          <div>
            <p>EP decision workspace</p>
            <h1>Diagnostic Pacing</h1>
          </div>
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
          <button className="secondaryButton">New case</button>
          <button className="primaryButton">Save case</button>
        </div>
      </header>

      <section className="caseStrip">
        {[
          ["Rhythm", "Regular SVT"],
          ["Tachycardia CL", "330 ms"],
          ["VA interval", "42 ms"],
          ["Induction state", "Baseline"],
          ["Isoproterenol", "Off"],
        ].map(([label, value]) => (
          <div className="metric" key={label}>
            <span>{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
        <button className="editButton">Edit case details</button>
      </section>

      <section className="workspace">
        <Panel eyebrow="Diagnostic state" title="Working differential">
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

        <Panel eyebrow="Recommended action" title="Next diagnostic maneuver">
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
        </Panel>
      </section>

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
