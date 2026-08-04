import type { SheetId, SpreadsheetRow } from "@/app/admin/model";
import {
  findPerformance,
  workspaceConfigurations,
  type CaseRecord,
  type MeasurementField,
  type Rhythm,
} from "@/app/clinical/model";

export type DifferentialAction = "Supports" | "Excludes" | "Confirms";
export type DifferentialStatus = "Confirmed" | "Possible" | "Excluded";

export type Diagnosis = {
  diagnosisId: string;
  fullName: string;
  abbreviatedName: string;
  description: string;
  notes: string;
  baseRank: number;
};

export type ReasoningRow = {
  reasoningId: string;
  maneuverId: string;
  fieldId: string;
  intervalName: string;
  operator: string;
  comparedValue: string;
  differentialAction: DifferentialAction;
  diagnosisId: string;
  explanation: string;
  ruleGroupId: string;
  requiredClinicalState: string;
  ruleDescription: string;
};

export type DifferentialFinding = {
  reasoningId: string;
  action: DifferentialAction;
  explanation: string;
  ruleDescription: string;
};

export type DifferentialResult = {
  diagnosis: Diagnosis;
  status: DifferentialStatus;
  supportCount: number;
  findings: DifferentialFinding[];
};

const trimmed = (value?: string) => (value ?? "").trim();

const DIFFERENTIAL_ACTIONS: DifferentialAction[] = ["Supports", "Excludes", "Confirms"];

function toNumber(value?: string): number {
  const parsed = Number.parseFloat(trimmed(value));
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
}

function parseDiagnosis(row: SpreadsheetRow): Diagnosis | null {
  const diagnosisId = trimmed(row.diagnosisId);
  if (!diagnosisId) return null;

  return {
    diagnosisId,
    fullName: trimmed(row.fullName),
    abbreviatedName: trimmed(row.abbreviatedName),
    description: trimmed(row.description),
    notes: trimmed(row.notes),
    baseRank: toNumber(row.baseRank),
  };
}

function parseReasoningRow(row: SpreadsheetRow): ReasoningRow | null {
  const reasoningId = trimmed(row.reasoningId);
  const diagnosisId = trimmed(row.diagnosisId);
  const operator = trimmed(row.operator);
  const differentialAction = trimmed(row.differentialAction) as DifferentialAction;
  const maneuverId = trimmed(row.maneuverId);
  const fieldId = trimmed(row.fieldId);
  const intervalName = trimmed(row.intervalName);

  const usesManeuver = Boolean(maneuverId && fieldId);
  const usesInterval = Boolean(intervalName);

  if (!reasoningId || !diagnosisId || !operator) return null;
  if (!usesManeuver && !usesInterval) return null;
  if (!DIFFERENTIAL_ACTIONS.includes(differentialAction)) return null;

  return {
    reasoningId,
    maneuverId,
    fieldId,
    intervalName,
    operator,
    comparedValue: trimmed(row.comparedValue),
    differentialAction,
    diagnosisId,
    explanation: trimmed(row.explanation),
    ruleGroupId: trimmed(row.ruleGroupId),
    requiredClinicalState: trimmed(row.requiredClinicalState),
    ruleDescription: trimmed(row.ruleDescription),
  };
}

/**
 * Compares a recorded value against a Clinical Reasoning row's operator and
 * Compared Value. Numeric-aware: when both sides parse as numbers, the
 * comparison is numeric (so "80" = "80.0"); otherwise it falls back to a
 * case-insensitive string comparison for "=" / "≠". An unrecorded (blank)
 * actual value never satisfies a condition — "no data" is treated as
 * "unknown", not as a negative result.
 */
function evaluateOperator(
  operator: string,
  actualRaw: string | undefined,
  comparedValue: string,
): boolean {
  const actual = trimmed(actualRaw);
  const compared = trimmed(comparedValue);
  if (!actual) return false;

  switch (operator) {
    case "Is Checked":
      return actual.toLowerCase() === "yes";
    case "Is Unchecked":
      return actual.toLowerCase() === "no";
    case "=":
    case "≠": {
      const actualNumber = Number.parseFloat(actual);
      const comparedNumber = Number.parseFloat(compared);
      const equal =
        !Number.isNaN(actualNumber) && !Number.isNaN(comparedNumber)
          ? actualNumber === comparedNumber
          : actual.toLowerCase() === compared.toLowerCase();
      return operator === "=" ? equal : !equal;
    }
    case ">":
    case "<": {
      const actualNumber = Number.parseFloat(actual);
      const comparedNumber = Number.parseFloat(compared);
      if (Number.isNaN(actualNumber) || Number.isNaN(comparedNumber)) return false;
      return operator === ">" ? actualNumber > comparedNumber : actualNumber < comparedNumber;
    }
    default:
      return false;
  }
}

function normalizeIntervalTerm(value: string): string {
  return value
    .toLowerCase()
    .replace(/\beffective refractory period(s)?\b/g, "erp")
    .replace(/\bfunctional refractory period(s)?\b/g, "frp")
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\berp\b/g, "")
    .replace(/\bfrp\b/g, "")
    .replace(/\binterval\b/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Finds the measurement field within a rhythm's workspace configuration
 * that best matches a Clinical Reasoning row's freeform Interval Name
 * (e.g. "AH Interval"). This is a name-matching heuristic, not a formal ID
 * linkage — the Intervals sheet has no field-level identifiers to join
 * against, so this is the intentional first-pass approach until the
 * knowledge base grows a more direct mapping.
 *
 * Refractory periods (ERP/FRP) no longer flow through this path at all —
 * they're recorded as tagged Maneuver Response Fields now, not direct-
 * entry workspace measurements (see app/refractoryPeriods/knowledge.ts),
 * so a Clinical Reasoning row about one uses Maneuver Considered + an
 * exact Response Field Prompt instead of Interval Considered's fuzzy name
 * match. This function's search space is smaller and more honest as a
 * result — it now only ever needs to cover plain intervals (AH, HV, QRS,
 * and similar), which is exactly what it was always meant for.
 */
function findMatchingMeasurementField(
  rhythm: Rhythm,
  intervalName: string,
): MeasurementField | null {
  const target = normalizeIntervalTerm(intervalName);
  if (!target) return null;

  const fields = workspaceConfigurations[rhythm].sections.flatMap(
    (section) => section.fields,
  );

  const exact = fields.find((field) => normalizeIntervalTerm(field.label) === target);
  if (exact) return exact;

  return (
    fields.find((field) => {
      const label = normalizeIntervalTerm(field.label);
      return label.length > 0 && (target.includes(label) || label.includes(target));
    }) ?? null
  );
}

function readMeasurementValue(
  measurements: Record<string, string>,
  field: MeasurementField,
): string | undefined {
  return measurements[field.id];
}

/**
 * Whether a single Clinical Reasoning row's condition is satisfied anywhere
 * in the case. Checked existentially across every recorded Clinical State
 * rather than being restricted to the row's Required Clinical State — the
 * knowledge base's fixed Clinical States vocabulary doesn't yet have a
 * direct link to the GUI's per-state context fields, so Required Clinical
 * State is not enforced in this first pass (see docs/PROJECT_DESIGN.md).
 */
function rowConditionSatisfied(row: ReasoningRow, caseRecord: CaseRecord): boolean {
  if (row.maneuverId && row.fieldId) {
    return caseRecord.clinicalStates.some((clinicalState) => {
      const performance = findPerformance(clinicalState, row.maneuverId);
      if (!performance) return false;
      return evaluateOperator(row.operator, performance.values[row.fieldId], row.comparedValue);
    });
  }

  if (row.intervalName) {
    return caseRecord.clinicalStates.some((clinicalState) => {
      const field = findMatchingMeasurementField(
        clinicalState.context.rhythm,
        row.intervalName,
      );
      if (!field) return false;
      const actual = readMeasurementValue(clinicalState.measurements, field);
      return evaluateOperator(row.operator, actual, row.comparedValue);
    });
  }

  return false;
}

function groupReasoningRows(rows: ReasoningRow[]) {
  const standalone: ReasoningRow[] = [];
  const groups = new Map<string, ReasoningRow[]>();

  for (const row of rows) {
    if (!row.ruleGroupId) {
      standalone.push(row);
      continue;
    }
    const group = groups.get(row.ruleGroupId) ?? [];
    group.push(row);
    groups.set(row.ruleGroupId, group);
  }

  return { standalone, groups };
}

const statusRank: Record<DifferentialStatus, number> = {
  Confirmed: 0,
  Possible: 1,
  Excluded: 2,
};

function compareDifferentialResults(a: DifferentialResult, b: DifferentialResult): number {
  if (statusRank[a.status] !== statusRank[b.status]) {
    return statusRank[a.status] - statusRank[b.status];
  }
  if (a.status === "Possible" && a.supportCount !== b.supportCount) {
    return b.supportCount - a.supportCount;
  }
  return a.diagnosis.baseRank - b.diagnosis.baseRank;
}

/**
 * Evaluates every Clinical Reasoning row against the recorded case data and
 * returns one result per Diagnosis, sorted per the documented three-tier
 * model: Confirmed first, then Possible (ranked by support count, then Base
 * Rank), then Excluded — each tier internally stable, not re-ordered by
 * evaluation order. Rows sharing a Rule Group ID must all be satisfied
 * (AND) before any of their individual Differential Actions apply; rows
 * with no Rule Group ID are evaluated standalone (OR against everything
 * else).
 */
export function evaluateDifferential(
  caseRecord: CaseRecord,
  sheets: Partial<Record<SheetId, SpreadsheetRow[]>>,
): DifferentialResult[] {
  const diagnoses = (sheets.diagnoses ?? [])
    .map(parseDiagnosis)
    .filter((value): value is Diagnosis => value !== null);

  const rows = (sheets.clinicalReasoning ?? [])
    .map(parseReasoningRow)
    .filter((value): value is ReasoningRow => value !== null);

  const findingsByDiagnosis = new Map<string, DifferentialFinding[]>();

  function addFinding(row: ReasoningRow) {
    const findings = findingsByDiagnosis.get(row.diagnosisId) ?? [];
    findings.push({
      reasoningId: row.reasoningId,
      action: row.differentialAction,
      explanation: row.explanation,
      ruleDescription: row.ruleDescription,
    });
    findingsByDiagnosis.set(row.diagnosisId, findings);
  }

  const { standalone, groups } = groupReasoningRows(rows);

  for (const row of standalone) {
    if (rowConditionSatisfied(row, caseRecord)) addFinding(row);
  }

  for (const group of groups.values()) {
    if (group.every((row) => rowConditionSatisfied(row, caseRecord))) {
      for (const row of group) addFinding(row);
    }
  }

  return diagnoses
    .map((diagnosis) => {
      const findings = findingsByDiagnosis.get(diagnosis.diagnosisId) ?? [];
      const hasConfirm = findings.some((finding) => finding.action === "Confirms");
      const hasExclude = findings.some((finding) => finding.action === "Excludes");
      const supportCount = findings.filter((finding) => finding.action === "Supports").length;

      const status: DifferentialStatus = hasConfirm
        ? "Confirmed"
        : hasExclude
          ? "Excluded"
          : "Possible";

      return { diagnosis, status, supportCount, findings };
    })
    .sort(compareDifferentialResults);
}

/** Builds the clinician-facing "Why?" explanation for a diagnosis result. */
export function explainDifferentialResult(result: DifferentialResult): string {
  if (result.findings.length === 0) {
    return "No clinical reasoning rules have fired yet for this diagnosis — add findings above, or expand the knowledge base's Clinical Reasoning sheet.";
  }

  return result.findings
    .map((finding) => {
      const text = finding.explanation || finding.ruleDescription || "(no explanation entered)";
      return `${finding.action}: ${text}`;
    })
    .join("\n\n");
}
