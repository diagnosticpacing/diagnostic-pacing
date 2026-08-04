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

export type CaseRecord = {
  id: string;
  title: string;
  clinicalStates: ClinicalState[];
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
// Refractory Period Type/Direction/Structure/Component# columns on
// Maneuver Response Fields — see app/refractoryPeriods/knowledge.ts and
// the derived "Refractory Periods" panel in app/page.tsx. Plain intervals
// (AA, VV, PR, etc.) are unaffected and stay directly-entered here, since
// they're genuinely observed, not the output of a specific maneuver.
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
  };
}

export function medicationSummary(value: string): string {
  return value.trim() ? `Iso ${value.trim()}` : "Iso off";
}
