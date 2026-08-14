// These are the app's built-in fallback option lists for the Phase/Rhythm/
// Sedation dropdowns — used only when the admin Clinical States knowledge
// base sheet has no categorized entries yet for that field (see
// resolveDropdownOptions in app/clinical/requiredStates.ts and
// MANEUVER-REQUIRED-STATE-CHECK-2026-08-14 in PROJECT_DESIGN.md). Once
// Murph categorizes rows on that sheet, those admin-entered Abbreviated
// Names drive the dropdown instead. Phase/Rhythm/Sedation are plain
// strings now (not closed literal unions) because the admin sheet can add
// entries the app doesn't know about ahead of time; these arrays are also
// still used as createClinicalState()'s literal defaults below.
export const phaseOptions = [
  "Pre-ablation",
  "Ablation",
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

export type Phase = string;
export type Rhythm = string;
export type Sedation = string;

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
  ablation: AblationSession;
};

/**
 * Ablation detail (modality, location, count, duration) for a single
 * Clinical State — strictly for the case report, never wired to clinical
 * reasoning or the Pre-/Post-ablation Phase tag anywhere else (that
 * association is still made manually, the same way it always has been, by
 * however the user tags each Clinical State's Phase). Lives on the
 * Clinical State itself (`ClinicalState.ablation`, always present, only
 * meaningful when that state's Phase is "Ablation") — one ablation entry
 * per Clinical State. Recording a second ablation session means creating a
 * second Clinical State with Phase set to Ablation, the same way every
 * other "new moment in the case" already works; there's deliberately no
 * separate multi-session list anymore (see
 * ABLATION-PER-CLINICAL-STATE-2026-08-09 in PROJECT_DESIGN.md — this used
 * to be a shared case-level array with an add/remove/badge UI before that
 * change). Modality is single-select on purpose (one modality per
 * ablation-phase Clinical State), not the multi-toggle it briefly was.
 */
export const ablationModalityOptions = [
  "Radio Frequency",
  "Pulsed Field",
  "Cryo",
] as const;

export type AblationModality = (typeof ablationModalityOptions)[number];

export type AblationSession = {
  modality: AblationModality | "";
  location: string;
  count: string;
  durationSeconds: string;
};

export function createAblationSession(): AblationSession {
  return { modality: "", location: "", count: "", durationSeconds: "" };
}

/** True once any field on the ablation entry has something in it — used by
 * clinicalStateHasFindings so switching Phase off "Ablation" on a state
 * that already has ablation detail recorded gets the same
 * new-state/keep-here protection measurements and performances get. */
export function hasAblationSessionData(session: AblationSession): boolean {
  return (
    session.modality !== "" ||
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

/** Full-detail summary of an ablation entry — used as the Case Structure
 * card's tooltip (title attribute) for Ablation-phase states, since the
 * card itself only has room for a compact "{count} {Modality} Ablation"
 * headline plus the location line. */
export function summarizeAblationSession(session: AblationSession): string {
  const parts: string[] = [];
  if (session.modality) parts.push(session.modality);
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

/**
 * Safe accessor for workspaceConfigurations — Rhythm is a plain string now
 * (an admin can add new Rhythm entries via the Clinical States knowledge
 * base sheet), so a direct `workspaceConfigurations[rhythm]` index can miss.
 * Falls back to the shared comprehensivePacingSections field set (the same
 * one Atrial/Ventricular Pacing already use) for any rhythm without a
 * hardcoded entry above, rather than throwing or silently rendering an
 * empty workspace. Use this everywhere instead of indexing
 * workspaceConfigurations directly. See
 * MANEUVER-REQUIRED-STATE-CHECK-2026-08-14 in PROJECT_DESIGN.md.
 */
export function resolveWorkspaceConfiguration(rhythm: Rhythm): WorkspaceConfiguration {
  return (
    workspaceConfigurations[rhythm] ?? {
      sections: comprehensivePacingSections,
    }
  );
}

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
    ablation: createAblationSession(),
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

/**
 * Whether a Clinical State already has anything worth protecting from a
 * context change made against it by mistake — a recorded interval
 * measurement, a maneuver performance with at least one non-blank value
 * entered, or an ablation entry with anything filled in (see
 * ABLATION-PER-CLINICAL-STATE-2026-08-09). Used to decide whether changing
 * Phase, Rhythm, Sedation, Isoproterenol, Adenosine, or Epinephrin on the
 * active Clinical State should prompt for a new Clinical State instead of
 * silently rewriting the context a recorded finding was read under —
 * see CONTEXT-CHANGE-PROMPT-2026-08-08. Blank-valued performances
 * (a maneuver card opened and left with nothing entered) don't count,
 * matching how performances only get committed in the first place —
 * see the lastCommittedValuesRef guard in ManeuverCard.tsx.
 */
/**
 * The tachycardia cycle length — the shorter of the AA and VV interval
 * measurements, whichever is present (if only one was measured, that's
 * the best available number; if both were, the shorter one is the
 * actual cycle length). Used to headline Case Structure cards
 * alongside "Tachycardia" — see CASE-STRUCTURE-CARD-REWORK-2026-08-08.
 * "interval.aa"/"interval.vv" are the fixed field ids the Tachycardia
 * workspace configuration always uses (see the `interval()` helper
 * above) — hardcoded source, not admin-editable knowledge base data,
 * so safe to reference directly here. Returns null if the state isn't
 * Tachycardia at all, or neither field has a valid positive number
 * entered yet.
 */
export function tachycardiaCycleLengthMs(clinicalState: ClinicalState): number | null {
  if (clinicalState.context.rhythm !== "Tachycardia") return null;

  const candidates = ["interval.aa", "interval.vv"]
    .map((fieldId) =>
      Number.parseFloat((clinicalState.measurements[fieldId] ?? "").trim()),
    )
    .filter((value) => Number.isFinite(value) && value > 0);

  return candidates.length > 0 ? Math.min(...candidates) : null;
}

export function clinicalStateHasFindings(clinicalState: ClinicalState): boolean {
  const hasMeasurement = Object.values(clinicalState.measurements).some(
    (value) => value.trim() !== "",
  );
  if (hasMeasurement) return true;

  const hasPerformance = clinicalState.performances.some((performance) =>
    Object.values(performance.values).some((value) => value.trim() !== ""),
  );
  if (hasPerformance) return true;

  return hasAblationSessionData(clinicalState.ablation);
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
 * tried and rejected as insufficiently specific. Sedation is used
 * verbatim too, as whatever Abbreviated Name the admin Clinical States
 * sheet gives that Sedation entry — sedationAbbreviation()'s old
 * hardcoded Awake/Sedated/GA switch is gone as of
 * MANEUVER-REQUIRED-STATE-CHECK-2026-08-14, since the admin sheet is now
 * the source of the abbreviated form and Murph is expected to enter it
 * short to begin with. Rhythm and the other drug fields (adenosine,
 * epinephrine) are deliberately left out of this compact form — already
 * visible on the Clinical States rail card, and not what this project's
 * users have asked to see repeated on every maneuver card.
 */
export function clinicalStateSummary(context: ClinicalStateContext): string {
  return [
    context.phase,
    medicationSummary(context.isoproterenol),
    context.sedation,
  ].join(" · ");
}

/** The two fixed tag strings for ablation phase — see
 * formatClinicalStateTag below for the standardized vocabulary these
 * belong to. */
export type ClinicalStateAblationTag = "Pre-ABL" | "Post-ABL";

/** The two fixed tag strings for isoproterenol status — see
 * formatClinicalStateTag below. */
export type ClinicalStateIsoTag = "Iso-On" | "Iso-Off";

/**
 * Phase collapsed to just two buckets — deliberately coarser than the
 * Phase field itself (Pre-ablation / Ablation / Post-ablation /
 * Post-ablation 2), and a distinct, narrowly-scoped abbreviation from
 * clinicalStateSummary above (which spells Phase out in full on purpose
 * — see CLINICAL-STATE-COMPACT-SUMMARY-2026-08-04). Folding Post-ablation
 * 2 into "Post-ABL" is the intended behavior here, not a compromise.
 * "Ablation" itself (the phase used while lesions are actively being
 * made — see ABLATION-AS-PHASE-2026-08-08) buckets as "Pre-ABL": the
 * ablation isn't complete yet, so anything recorded during that phase
 * should read the same as pre-ablation findings until the case is
 * explicitly moved to a Post-ablation phase.
 */
export function clinicalStateAblationTag(phase: Phase): ClinicalStateAblationTag {
  return phase === "Post-ablation" || phase === "Post-ablation 2"
    ? "Post-ABL"
    : "Pre-ABL";
}

/** Whether isoproterenol is running, tagged as "Iso-On"/"Iso-Off" — any
 * non-blank dose counts as on, regardless of the actual value entered. */
export function clinicalStateIsoTag(isoproterenol: string): ClinicalStateIsoTag {
  return isoproterenol.trim() ? "Iso-On" : "Iso-Off";
}

/**
 * The compact per-finding state tag — e.g. "Pre-ABL · Iso-On" — used
 * anywhere a result needs to say which Clinical State produced it
 * without repeating the full context: originally built for the
 * Refractory Periods panel (REFRACTORY-PERIODS-TWO-ROW-2026-08-05,
 * where it lived as formatRefractoryPeriodStateTag before moving here)
 * and reused as-is for Maneuver Card findings
 * (MANEUVER-CARD-REDESIGN-2026-08-05). Limited to exactly two axes by
 * design: ablation phase (Pre-ABL/Post-ABL) and isoproterenol
 * (Iso-On/Iso-Off) — the two things that actually change how a recorded
 * result should be read. Rhythm, sedation, and the other drug fields
 * are left out on purpose, same scoping decision clinicalStateSummary()
 * makes above. This exact text, split on " · " and rendered through
 * ClinicalStateTagText, is the standardized form of this tag everywhere
 * it's rendered — see STATE-TAG-STANDARDIZE-2026-08-08 and
 * STATE-TAG-COLOR-2026-08-08 in PROJECT_DESIGN.md.
 */
export function formatClinicalStateTag(context: ClinicalStateContext): string {
  const phase = clinicalStateAblationTag(context.phase);
  const iso = clinicalStateIsoTag(context.isoproterenol);
  return `${phase} · ${iso}`;
}
