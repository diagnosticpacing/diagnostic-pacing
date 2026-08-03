import type { SheetId, SpreadsheetRow } from "@/app/admin/model";

export type ManeuverDefinition = {
  maneuverId: string;
  maneuverName: string;
  relevantDiagnoses: string[];
  requiredStates: string[];
  technique: string;
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
