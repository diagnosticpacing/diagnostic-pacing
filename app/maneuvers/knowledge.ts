import type { SheetId, SpreadsheetRow } from "@/app/admin/model";

export type ManeuverDefinition = {
  maneuverId: string;
  maneuverName: string;
  baseRank: number;
  relevantDiagnoses: string[];
  requiredStates: string[];
  technique: string;
};

/**
 * Only the meaningful values — a field with no direction tagged (raw
 * sheet value "n/a" or blank) isn't a refractory period field at all
 * and never produces a RefractoryPeriodTag in the first place. See
 * REFRACTORY-PERIODS-SIMPLIFY-2026-08-06 in PROJECT_DESIGN.md: Type
 * and Structure were dropped from the schema (the display label now
 * comes straight from the field's own Response Prompt, and every
 * refractory-period field always renders as up to three optional
 * value boxes — the Functional/Effective distinction that used to
 * pick 1-vs-3 boxes is gone), leaving Direction as the sole remaining
 * signal for both "which row of the Refractory Periods panel" and "is
 * this field a refractory period result at all."
 */
export type RefractoryPeriodDirection = "Antegrade" | "Retrograde";

/**
 * A Response Field tagged as a refractory period result in its
 * entirety (see the Refractory Period Direction column on Maneuver
 * Response Fields) — one field IS one named refractory period, not
 * one component of one. Always renders/stores as up to three value
 * boxes (a second and third extrastimulus are optional, left blank if
 * not performed).
 */
export type RefractoryPeriodTag = {
  direction: RefractoryPeriodDirection;
};

/**
 * The comparison operators a Display Operator column can use — identical
 * vocabulary to Clinical Reasoning's Operator column (and evaluated by the
 * same shared evaluateOperator function), so a response field's visibility
 * is checked the same way a Clinical Reasoning row's condition is.
 * "Yes Selected"/"No Selected" are aliases of "Is Checked"/"Is
 * Unchecked" — same comparison, worded for a Yes/No Buttons field
 * instead of a Checkbox field. See evaluateOperator in
 * app/shared/operatorEvaluation.ts.
 */
export type DisplayOperator =
  | "Is Checked"
  | "Is Unchecked"
  | "Yes Selected"
  | "No Selected"
  | "="
  | "≠"
  | ">"
  | "<";

const DISPLAY_OPERATORS: DisplayOperator[] = [
  "Is Checked",
  "Is Unchecked",
  "Yes Selected",
  "No Selected",
  "=",
  "≠",
  ">",
  "<",
];

/**
 * A response field's conditional-visibility rule: this field is only
 * shown once `fieldId` (another Response Field on the same maneuver —
 * enforced by the admin editor's cascading Display Field lookup, not
 * re-checked here) has a recorded response satisfying `operator`/`value`.
 * `null` means "Display When: Always" — the default for every existing
 * row, since the column didn't used to exist. See
 * RESPONSE-FIELD-CONDITIONAL-DISPLAY-2026-08-10 in
 * docs/PROJECT_DESIGN.md.
 *
 * Nothing here prevents a misconfigured row from pointing at itself or
 * at a field that appears later in Order (a self- or forward-reference)
 * — that's an accepted, flagged gap for this first pass, not a crash
 * risk: evaluateOperator returns false against a blank/unrecorded
 * value, so a self-referencing field just never becomes visible rather
 * than looping.
 */
export type DisplayCondition = {
  fieldId: string;
  operator: DisplayOperator;
  value: string;
};

export type ManeuverResponseField = {
  fieldId: string;
  associatedManeuverId: string;
  order: number;
  prompt: string;
  availableTerms: string[];
  inputType: string;
  units: string;
  required: boolean;
  helpText: string;
  refractoryPeriod: RefractoryPeriodTag | null;
  display: DisplayCondition | null;
};

export type ManeuverResponseOption = {
  optionId: string;
  associatedManeuverId: string;
  associatedFieldId: string;
  order: number;
  displayLabel: string;
};

export type ManeuverCatalogField = ManeuverResponseField & {
  options: ManeuverResponseOption[];
};

export type ManeuverCatalogEntry = {
  definition: ManeuverDefinition;
  fields: ManeuverCatalogField[];
};

const trimmed = (value?: string) => (value ?? "").trim();

const splitList = (value?: string) =>
  trimmed(value)
    .split(",")
    .map((token) => token.trim())
    .filter(Boolean);

const toOrder = (value?: string) => {
  const parsed = Number.parseInt(trimmed(value), 10);
  return Number.isNaN(parsed) ? 0 : parsed;
};

// Unparseable/blank sorts last rather than first (0 would misleadingly
// promote a maneuver with a missing Base Rank to the top of the grid) —
// same convention as Diagnoses' baseRank tiebreak in the differential
// engine.
const toBaseRank = (value?: string) => {
  const parsed = Number.parseFloat(trimmed(value));
  return Number.isNaN(parsed) ? Number.MAX_SAFE_INTEGER : parsed;
};

function parseManeuverDefinition(row: SpreadsheetRow): ManeuverDefinition | null {
  const maneuverId = trimmed(row.maneuverId);
  if (!maneuverId) return null;

  return {
    maneuverId,
    maneuverName: trimmed(row.maneuverName),
    baseRank: toBaseRank(row.baseRank),
    relevantDiagnoses: splitList(row.relevantDiagnoses),
    requiredStates: splitList(row.requiredStates),
    technique: trimmed(row.technique),
  };
}

const REFRACTORY_PERIOD_DIRECTIONS: RefractoryPeriodDirection[] = ["Antegrade", "Retrograde"];

/**
 * Parses a Response Field's Refractory Period Direction column into a
 * tag, or null if the field isn't one. "n/a" (or blank) means "not a
 * refractory period field" — Direction is now the only signal for
 * that, since Type and Structure no longer exist on this sheet.
 */
function parseRefractoryPeriodTag(row: SpreadsheetRow): RefractoryPeriodTag | null {
  const direction = trimmed(row.refractoryPeriodDirection);
  if (!direction || direction === "n/a") return null;
  if (!REFRACTORY_PERIOD_DIRECTIONS.includes(direction as RefractoryPeriodDirection)) return null;

  return { direction: direction as RefractoryPeriodDirection };
}

/**
 * Parses a Response Field's Display When/Display Field ID/Display
 * Operator/Display Value columns into a condition, or null when the
 * field is always shown. "Always" (or a blank/missing Display When, for
 * rows saved before this column existed) always wins regardless of
 * what's in the other three columns — same "ignored unless the mode
 * column asks for it" convention Refractory Period Direction and Units
 * already use on this sheet via their "n/a" option. A "If" row missing
 * a valid Display Field ID or Display Operator is treated as
 * misconfigured and falls back to Always, rather than hiding the field
 * with no way to reveal it.
 */
function parseDisplayCondition(row: SpreadsheetRow): DisplayCondition | null {
  if (trimmed(row.displayWhen) !== "If") return null;

  const fieldId = trimmed(row.displayFieldId);
  const operator = trimmed(row.displayOperator);
  if (!fieldId || !DISPLAY_OPERATORS.includes(operator as DisplayOperator)) return null;

  return {
    fieldId,
    operator: operator as DisplayOperator,
    value: trimmed(row.displayValue),
  };
}

function parseResponseField(row: SpreadsheetRow): ManeuverResponseField | null {
  const fieldId = trimmed(row.fieldId);
  const associatedManeuverId = trimmed(row.associatedManeuverId);
  if (!fieldId || !associatedManeuverId) return null;

  return {
    fieldId,
    associatedManeuverId,
    order: toOrder(row.order),
    prompt: trimmed(row.prompt),
    availableTerms: splitList(row.availableTerms),
    inputType: trimmed(row.inputType),
    units: trimmed(row.units),
    required: trimmed(row.required).toLowerCase() === "yes",
    helpText: trimmed(row.helpText),
    refractoryPeriod: parseRefractoryPeriodTag(row),
    display: parseDisplayCondition(row),
  };
}

function parseResponseOption(row: SpreadsheetRow): ManeuverResponseOption | null {
  const optionId = trimmed(row.optionId);
  const associatedFieldId = trimmed(row.associatedFieldId);
  if (!optionId || !associatedFieldId) return null;

  return {
    optionId,
    associatedManeuverId: trimmed(row.associatedManeuverId),
    associatedFieldId,
    order: toOrder(row.order),
    displayLabel: trimmed(row.displayLabel),
  };
}

/**
 * Builds a maneuver -> response-fields -> response-options catalog straight
 * from the knowledge base sheets, in the shape the maneuver card grid needs.
 * Rows missing their linking IDs are skipped defensively rather than
 * crashing — the admin editor's own validation is what keeps entered data
 * consistent; this just tolerates a still-in-progress or partially-restored
 * workbook gracefully.
 */
export function buildManeuverCatalog(
  sheets: Partial<Record<SheetId, SpreadsheetRow[]>>,
): ManeuverCatalogEntry[] {
  const definitions = (sheets.maneuverDefinitions ?? [])
    .map(parseManeuverDefinition)
    .filter((value): value is ManeuverDefinition => value !== null);

  const fields = (sheets.maneuverResponseFields ?? [])
    .map(parseResponseField)
    .filter((value): value is ManeuverResponseField => value !== null);

  const options = (sheets.maneuverResponseOptions ?? [])
    .map(parseResponseOption)
    .filter((value): value is ManeuverResponseOption => value !== null);

  return definitions.map((definition) => {
    const catalogFields: ManeuverCatalogField[] = fields
      .filter((field) => field.associatedManeuverId === definition.maneuverId)
      .sort((a, b) => a.order - b.order)
      .map((field) => ({
        ...field,
        options: options
          .filter((option) => option.associatedFieldId === field.fieldId)
          .sort((a, b) => a.order - b.order),
      }));

    return { definition, fields: catalogFields };
  });
}

/**
 * Placeholder relevance score, per the maneuver-suggestion design note in
 * docs/PROJECT_DESIGN.md: the full algorithm (weighting Clinical Reasoning
 * rows that could Exclude/Confirm a still-possible diagnosis) is explicitly
 * "still open, not resolved" there and needs real Clinical Reasoning data to
 * evaluate against. Until then, this uses the documented fallback — how many
 * of a maneuver's own Relevant Diagnoses are still active (not excluded) in
 * the differential — so cards have a sensible, non-random default order.
 */
export function scoreManeuverRelevance(
  definition: ManeuverDefinition,
  activeDiagnosisAbbreviations: ReadonlySet<string>,
): number {
  if (definition.relevantDiagnoses.length === 0) return 0;

  return definition.relevantDiagnoses.reduce(
    (count, abbreviation) =>
      activeDiagnosisAbbreviations.has(abbreviation.toUpperCase())
        ? count + 1
        : count,
    0,
  );
}
