import type { SheetId, SpreadsheetRow } from "@/app/admin/model";

export type ManeuverDefinition = {
  maneuverId: string;
  maneuverName: string;
  relevantDiagnoses: string[];
  requiredStates: string[];
  technique: string;
};

export type RefractoryPeriodType = "Functional" | "Effective";
export type RefractoryPeriodDirection = "Antegrade" | "Retrograde" | "n/a";
export type RefractoryPeriodStructure =
  | "Atrial"
  | "AV Node"
  | "Fast Pathway"
  | "Slow Pathway"
  | "Accessory Pathway 1"
  | "Accessory Pathway 2"
  | "Ventricular";

/**
 * A Response Field tagged as one component of a refractory period result
 * (see the Refractory Period Type/Direction/Structure/Component# columns
 * on Maneuver Response Fields). `direction` is allowed to be "n/a" —
 * unlike type/structure/component, direction genuinely isn't a meaningful
 * distinction for some structures (Atrial, Ventricular refractoriness
 * isn't "antegrade" or "retrograde," it just is what it is).
 */
export type RefractoryPeriodTag = {
  type: RefractoryPeriodType;
  direction: RefractoryPeriodDirection;
  structure: RefractoryPeriodStructure;
  component: 1 | 2 | 3;
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

function parseManeuverDefinition(row: SpreadsheetRow): ManeuverDefinition | null {
  const maneuverId = trimmed(row.maneuverId);
  if (!maneuverId) return null;

  return {
    maneuverId,
    maneuverName: trimmed(row.maneuverName),
    relevantDiagnoses: splitList(row.relevantDiagnoses),
    requiredStates: splitList(row.requiredStates),
    technique: trimmed(row.technique),
  };
}

const REFRACTORY_PERIOD_TYPES: RefractoryPeriodType[] = ["Functional", "Effective"];
const REFRACTORY_PERIOD_DIRECTIONS: RefractoryPeriodDirection[] = ["Antegrade", "Retrograde"];
const REFRACTORY_PERIOD_STRUCTURES: RefractoryPeriodStructure[] = [
  "Atrial",
  "AV Node",
  "Fast Pathway",
  "Slow Pathway",
  "Accessory Pathway 1",
  "Accessory Pathway 2",
  "Ventricular",
];

/**
 * Parses a Response Field's four Refractory Period columns into a single
 * tag, or null if the field isn't part of one. All four columns use "n/a"
 * as their "not applicable" value (never blank, since they're `required`
 * dropdowns) except Direction, which allows "n/a" as a real, meaningful
 * answer for structures without a directional distinction — so an absent
 * *type/structure/component* means "not a refractory period field," but
 * an absent *direction* on an otherwise-tagged field is valid.
 */
function parseRefractoryPeriodTag(row: SpreadsheetRow): RefractoryPeriodTag | null {
  const type = trimmed(row.refractoryPeriodType);
  const direction = trimmed(row.refractoryPeriodDirection);
  const structure = trimmed(row.refractoryPeriodStructure);
  const component = trimmed(row.refractoryPeriodComponent);

  if (!type || type === "n/a") return null;
  if (!structure || structure === "n/a") return null;
  if (!component || component === "n/a") return null;
  if (!REFRACTORY_PERIOD_TYPES.includes(type as RefractoryPeriodType)) return null;
  if (!REFRACTORY_PERIOD_STRUCTURES.includes(structure as RefractoryPeriodStructure)) return null;
  if (!["1", "2", "3"].includes(component)) return null;

  const resolvedDirection: RefractoryPeriodDirection =
    direction && REFRACTORY_PERIOD_DIRECTIONS.includes(direction as RefractoryPeriodDirection)
      ? (direction as RefractoryPeriodDirection)
      : "n/a";

  return {
    type: type as RefractoryPeriodType,
    direction: resolvedDirection,
    structure: structure as RefractoryPeriodStructure,
    component: Number(component) as 1 | 2 | 3,
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
