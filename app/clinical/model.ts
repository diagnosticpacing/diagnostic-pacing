export const phaseOptions = [
  "Pre-ablation",
  "Post-ablation",
  "Post-ablation 2",
] as const;

export const rhythmOptions = [
  "Normal Sinus Rhythm",
  "Tachycardia",
  "Atrial Pacing",
  "Ventricular Pacing",
  "AV Pacing",
] as const;

export const sedationOptions = [
  "Awake",
  "Conscious sedation",
  "General Anesthesia",
] as const;

export type Phase = (typeof phaseOptions)[number];
export type Rhythm = (typeof rhythmOptions)[number];
export type Sedation = (typeof sedationOptions)[number];

export type MeasurementField = {
  id: string;
  label: string;
  unit: "ms";
};

export type MeasurementSection = {
  id: string;
  title: string;
  fields: MeasurementField[];
};

export type ClinicalStateContext = {
  phase: Phase;
  rhythm: Rhythm;
  sedation: Sedation;
  isoproterenol: string;
  adenosine: string;
  epinephrin: string;
};

/**
 * One recorded pass at a maneuver, scoped to a single Clinical State. A
 * maneuver can legitimately be performed more than once per case (e.g. once
 * off isoproterenol, once on), so performances are keyed by
 * (maneuverId, clinicalStateId), not by maneuverId alone. `values` holds one
 * entry per response field id (from the Maneuver Response Fields sheet),
 * keyed by that field's Field ID.
 */
export type ManeuverPerformance = {
  maneuverId: string;
  values: Record<string, string>;
  recordedAt: string;
};

export type ClinicalState = {
  id: string;
  context: ClinicalStateContext;
  measurements: Record<string, string>;
  performances: ManeuverPerformance[];
};

/**
 * A single ablation application/session — strictly for the case report,
 * never wired to clinical reasoning or the Pre-/Post-ablation Phase tag
 * anywhere else (that association is still made manually, the same way it
 * always has been, by however the user tags each Clinical State's Phase).
 * Lives on CaseRecord directly, not inside a Clinical State — it has no
 * Rhythm/Sedation/measurements of its own and isn't a "moment" in the
 * study the way a Clinical State is.
 */
export const ablationModalityOptions = [
  "Radio Frequency",
  "Pulsed Field",
  "Cryo",
] as const;

export type AblationModality = (typeof ablationModalityOptions)[number];

export type AblationSession = {
  id: string;
  modalities: AblationModality[];
  location: string;
  count: string;
  durationSeconds: string;
};

export function createAblationSession(id: string): AblationSession {
  return { id, modalities: [], location: "", count: "", durationSeconds: "" };
}

/** True once any field on the session has something in it — gates the "+"
 * button so it can't spawn a run of empty "ABL Session N" badges. */
export function hasAblationSessionData(session: AblationSession): boolean {
  return (
    session.modalities.length > 0 ||
    session.location.trim() !== "" ||
    session.count.trim() !== "" ||
    session.durationSeconds.trim() !== ""
  );
}

export function abbreviateAblationModality(modality: AblationModality): string {
  switch (modality) {
    case "Radio Frequency":
      return "RF";
    case "Pulsed Field":
      return "PFA";
    case "Cryo":
      return "Cryo";
    default:
      return modality;
  }
}

/** Tooltip text for a collapsed "ABL Session N" badge — the only place its
 * modality/location/count/duration are still visible once collapsed. */
export function summarizeAblationSession(session: AblationSession): string {
  const parts: string[] = [];
  if (session.modalities.length > 0) parts.push(session.modalities.join(", "));
  if (session.location.trim()) parts.push(session.location.trim());
  if (session.count.trim()) parts.push(`${session.count.trim()} ablations`);
  if (session.durationSeconds.trim()) {
    parts.push(`${session.durationSeconds.trim()}s`);
  }
  return parts.length > 0 ? parts.join(" · ") : "No details recorded";
}

export type CaseRecord = {
  id: string;
  title: string;
  clinicalStates: ClinicalState[];
  ablationSessions: AblationSession[];
};

export type WorkspaceConfiguration = {
  sections: MeasurementSection[];
  placeholder?: string;
};

const interval = (id: string, label: string): MeasurementField => ({
  id: `interval.${id}`,
  label,
  unit: "ms",
});

const comprehensivePacingIntervals: MeasurementField[] = [
  interval("aa", "AA"),
  interval("vv", "VV"),
  interval("va", "VA"),
  interval("pr", "PR"),
  interval("ah", "AH"),
  interval("hv", "HV"),
  interval("qrs", "QRS"),
  interval("qt", "QT"),
];

// Functional and Effective Refractory Periods used to be direct-entry
// fields here (see ADMIN-ROW-LOCKING-era history in PROJECT_DESIGN.md's
// git log for the old shape). They're now results recorded on the back
// of whichever maneuver actually produces them, tagged via the
// Refractory Period Direction column on Maneuver Response Fields — see
// app/refractoryPeriods/knowledge.ts and the derived "Refractory
// Periods" panel in app/page.tsx. Plain intervals (AA, VV, PR, etc.)
// are unaffected and stay directly-entered here, since they're
// genuinely observed, not the output of a specific maneuver.
const comprehensivePacingSections: MeasurementSection[] = [
  {
    id: "intervals",
    title: "Intervals",
    fields: comprehensivePacingIntervals,
  },
];

export const workspaceConfigurations: Record<
  Rhythm,
  WorkspaceConfiguration
> = {
  "Normal Sinus Rhythm": {
    sections: [
      {
        id: "intervals",
        title: "Intervals",
        fields: [
          interval("rr", "RR"),
          interval("pr", "PR"),
          interval("ah", "AH"),
          interval("hv", "HV"),
          interval("qrs", "QRS"),
          interval("qt", "QT"),
        ],
      },
    ],
  },

  Tachycardia: {
    sections: [
      {
        id: "intervals",
        title: "Intervals",
        fields: [
          interval("aa", "AA"),
          interval("vv", "VV"),
          interval("va", "VA"),
          interval("pr", "PR"),
          interval("ah", "AH"),
          interval("hv", "HV"),
          interval("qrs", "QRS"),
          interval("qt", "QT"),
        ],
      },
    ],
  },

  "Atrial Pacing": {
    sections: comprehensivePacingSections,
  },

  "Ventricular Pacing": {
    sections: comprehensivePacingSections,
  },

  "AV Pacing": {
    sections: [],
    placeholder:
      "AV pacing measurements will be configured in a later workflow pass.",
  },
};

export function createClinicalState(
  id: string,
  overrides: Partial<ClinicalStateContext> = {},
): ClinicalState {
  return {
    id,
    context: {
      phase: "Pre-ablation",
      rhythm: "Normal Sinus Rhythm",
      sedation: "Awake",
      isoproterenol: "",
      adenosine: "",
      epinephrin: "",
      ...overrides,
    },
    measurements: {},
    performances: [],
  };
}

/** The recorded performance of a maneuver under a given Clinical State, if any. */
export function findPerformance(
  clinicalState: ClinicalState,
  maneuverId: string,
): ManeuverPerformance | null {
  return (
    clinicalState.performances.find(
      (performance) => performance.maneuverId === maneuverId,
    ) ?? null
  );
}

/** Records or replaces a maneuver's performance under a given Clinical State. */
export function upsertPerformance(
  clinicalState: ClinicalState,
  maneuverId: string,
  values: Record<string, string>,
): ClinicalState {
  const next: ManeuverPerformance = {
    maneuverId,
    values,
    recordedAt: new Date().toISOString(),
  };

  const existingIndex = clinicalState.performances.findIndex(
    (performance) => performance.maneuverId === maneuverId,
  );

  const performances =
    existingIndex === -1
      ? [...clinicalState.performances, next]
      : clinicalState.performances.map((performance, index) =>
          index === existingIndex ? next : performance,
        );

  return { ...clinicalState, performances };
}

export function createInitialCase(): CaseRecord {
  return {
    id: "case-1",
    title: "Untitled study",
    clinicalStates: [createClinicalState("clinical-state-1")],
    ablationSessions: [createAblationSession("ablation-session-1")],
  };
}

export function medicationSummary(value: string): string {
  return value.trim() ? `Iso ${value.trim()}` : "Iso off";
}

/** Short form of a Sedation level, for space-constrained displays. */
export function sedationAbbreviation(sedation: Sedation): string {
  switch (sedation) {
    case "Awake":
      return "Awake";
    case "Conscious sedation":
      return "Sedated";
    case "General Anesthesia":
      return "GA";
    default:
      return sedation;
  }
}

/**
 * A Clinical State's identity, compactly: Phase, isoproterenol status, and
 * sedation level — the three things that actually distinguish one
 * recorded state from another for a clinician scanning the workspace
 * (e.g. "Pre-ablation · Iso off · Awake"). Replaces the old ordinal
 * "Clinical State 1"/"Clinical State 2" labeling, which carried no
 * clinical information — a maneuver's front badge or a "recorded under"
 * chip needs to say *what* the state was, not which number it happened to
 * be created in. Phase is used verbatim (Pre-ablation/Post-ablation/
 * Post-ablation 2) rather than abbreviated — "Pre"/"Post" alone were
 * tried and rejected as insufficiently specific. Sedation is still
 * abbreviated (Awake/Sedated/GA), which reads unambiguously even short.
 * Rhythm and the other drug fields (adenosine, epinephrine) are
 * deliberately left out of this compact form — already visible on the
 * Clinical States rail card, and not what this project's users have
 * asked to see repeated on every maneuver card.
 */
export function clinicalStateSummary(context: ClinicalStateContext): string {
  return [
    context.phase,
    medicationSummary(context.isoproterenol),
    sedationAbbreviation(context.sedation),
  ].join(" · ");
}

/**
 * Phase collapsed to just two buckets — deliberately coarser than the
 * Phase field itself (Pre-ablation / Post-ablation / Post-ablation 2),
 * and a distinct, narrowly-scoped abbreviation from clinicalStateSummary
 * above (which spells Phase out in full on purpose — see
 * CLINICAL-STATE-COMPACT-SUMMARY-2026-08-04). Folding Post-ablation 2
 * into "Post" is the intended behavior here, not a compromise.
 */
function clinicalStateTagPhaseBucket(phase: Phase): "Pre" | "Post" {
  return phase === "Pre-ablation" ? "Pre" : "Post";
}

/**
 * The compact per-finding state tag — e.g. "Pre · Iso off" — used
 * anywhere a result needs to say which Clinical State produced it
 * without repeating the full context: originally built for the
 * Refractory Periods panel (REFRACTORY-PERIODS-TWO-ROW-2026-08-05,
 * where it lived as formatRefractoryPeriodStateTag before moving here)
 * and reused as-is for Maneuver Card findings
 * (MANEUVER-CARD-REDESIGN-2026-08-05). Limited to exactly two axes by
 * design: ablation phase (Pre/Post) and isoproterenol (on/off) — the two
 * things that actually change how a recorded result should be read.
 * Rhythm, sedation, and the other drug fields are left out on purpose,
 * same scoping decision clinicalStateSummary() makes above.
 */
export function formatClinicalStateTag(context: ClinicalStateContext): string {
  const phase = clinicalStateTagPhaseBucket(context.phase);
  const iso = context.isoproterenol.trim() ? "Iso on" : "Iso off";
  return `${phase} · ${iso}`;
}
