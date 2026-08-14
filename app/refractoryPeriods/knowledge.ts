import type { ClinicalState } from "@/app/clinical/model";
import { findPerformance, formatClinicalStateTag } from "@/app/clinical/model";
import {
  DEFAULT_NUMERIC_OPERATOR,
  numericFieldOperatorKey,
  type ManeuverCatalogEntry,
  type ManeuverCatalogField,
  type RefractoryPeriodDirection,
} from "@/app/maneuvers/knowledge";

/**
 * One named refractory period result — a single tagged Response Field IS
 * the whole result now, not a group of separately-tagged sibling fields.
 * How many value slots it has (a second and third extrastimulus, etc.)
 * comes entirely from the field's own Number of Fields column on
 * Maneuver Response Fields — the same column and mechanism any other
 * multi-box Number Field response uses (see
 * MANEUVER-RESPONSE-NUMBER-OF-FIELDS-2026-08-12 in
 * docs/PROJECT_DESIGN.md). Tagging a field with a Refractory Period
 * Direction no longer implies anything about box count on its own — an
 * earlier version fixed every Refractory Period field at exactly 3
 * boxes regardless of what Number of Fields said, which silently
 * overrode the admin's actual configuration; removed in
 * MANEUVER-FIELD-COUNT-FROM-COLUMN-ONLY-2026-08-14. `label` is the
 * field's own Response Prompt text, not a composed string — the admin
 * is expected to write the full clinician-facing name directly (e.g.
 * "AVN ERP"), since the Refractory Periods panel already groups by
 * Direction into separate rows and doesn't need it repeated in the
 * label.
 */
export type RefractoryPeriodDefinition = {
  id: string;
  direction: RefractoryPeriodDirection;
  label: string;
  fieldId: string;
  prompt: string;
  maneuverId: string;
  maneuverName: string;
  /** From the field's own Number of Fields column — see the module doc
   * comment above. No longer a fixed constant. */
  componentCount: number;
};

/**
 * The storage key for one value slot of a refractory period field within a
 * ManeuverPerformance's `values` map. The first slot always uses the
 * field's own fieldId with no suffix, so a naive lookup by fieldId alone
 * always finds the first box; only the second and third slots get a
 * suffix, e.g. `FID-042.2`, `FID-042.3`.
 */
export function refractoryPeriodComponentKey(fieldId: string, component: number): string {
  return component <= 1 ? fieldId : `${fieldId}.${component}`;
}

function toDefinition(
  entry: ManeuverCatalogEntry,
  field: ManeuverCatalogField,
): RefractoryPeriodDefinition | null {
  const tag = field.refractoryPeriod;
  if (!tag) return null;

  return {
    id: field.fieldId,
    direction: tag.direction,
    label: field.prompt,
    fieldId: field.fieldId,
    prompt: field.prompt,
    maneuverId: entry.definition.maneuverId,
    maneuverName: entry.definition.maneuverName,
    componentCount: field.numberOfFields,
  };
}

/**
 * Builds one Refractory Period definition per tagged Response Field across
 * the whole maneuver catalog — no cross-field grouping needed, since a
 * single field is always the complete result now.
 */
export function buildRefractoryPeriodCatalog(
  catalog: ManeuverCatalogEntry[],
): RefractoryPeriodDefinition[] {
  const definitions: RefractoryPeriodDefinition[] = [];

  for (const entry of catalog) {
    for (const field of entry.fields) {
      const definition = toDefinition(entry, field);
      if (definition) definitions.push(definition);
    }
  }

  return definitions.sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reads a refractory period's current recorded value for a given Clinical
 * State, formatted the same way the original ERP card always did:
 * slash-joined components with trailing blanks dropped (so leaving any
 * trailing box blank — out of however many Number of Fields configures
 * — never trails a stray "/"). Returns "" if the maneuver hasn't been
 * performed under this state at all, or
 * if no value has been entered yet. Prefixed with the field's selected
 * comparison operator (e.g. ">400") whenever it's set to something
 * other than the default "=" — the same operator ManeuverCard.tsx's
 * entry side and Maneuver Card findings show, read from the same
 * numericFieldOperatorKey so a Refractory Period result reads
 * identically everywhere it's shown. See
 * MANEUVER-FIELD-OPERATOR-2026-08-14 in docs/PROJECT_DESIGN.md.
 */
export function formatRefractoryPeriodValue(
  definition: RefractoryPeriodDefinition,
  clinicalState: ClinicalState,
): string {
  const performance = findPerformance(clinicalState, definition.maneuverId);
  if (!performance) return "";

  const values: string[] = [];
  for (let component = 1; component <= definition.componentCount; component += 1) {
    const key = refractoryPeriodComponentKey(definition.fieldId, component);
    values.push(performance.values[key]?.trim() ?? "");
  }

  while (values.length > 0 && values[values.length - 1] === "") {
    values.pop();
  }

  if (values.length === 0) return "";

  const operator = performance.values[numericFieldOperatorKey(definition.fieldId)]?.trim();
  const prefix = operator && operator !== DEFAULT_NUMERIC_OPERATOR ? operator : "";

  return `${prefix}${values.join("/")}`;
}

/**
 * The compact state tag shown next to each Refractory Periods finding —
 * e.g. "Pre · Iso off" — so a panel that shows every recorded value
 * across every Clinical State (not just the active one) still tells you
 * which state produced which number. Moved to clinical/model.ts as
 * formatClinicalStateTag (MANEUVER-CARD-REDESIGN-2026-08-05) once
 * Maneuver Card findings needed the exact same tag — this is just the
 * original name kept as an alias so nothing else in this file needs to
 * change.
 */
export const formatRefractoryPeriodStateTag = formatClinicalStateTag;

/** One recorded value for a Refractory Period definition, under one
 * specific Clinical State. */
export type RefractoryPeriodFinding = {
  clinicalStateId: string;
  value: string;
  stateTag: string;
};

/**
 * Every recorded value for one Refractory Period definition, across every
 * Clinical State in the case — not just whichever one happens to be
 * active. The panel this feeds is permanently affixed rather than
 * state-dependent, so a maneuver performed more than once (e.g. once off
 * isoproterenol, once on) surfaces every result side by side, each
 * labeled via formatRefractoryPeriodStateTag so they stay distinguishable.
 */
export function collectRefractoryPeriodFindings(
  definition: RefractoryPeriodDefinition,
  clinicalStates: ClinicalState[],
): RefractoryPeriodFinding[] {
  const findings: RefractoryPeriodFinding[] = [];

  for (const clinicalState of clinicalStates) {
    const value = formatRefractoryPeriodValue(definition, clinicalState);
    if (!value) continue;

    findings.push({
      clinicalStateId: clinicalState.id,
      value,
      stateTag: formatRefractoryPeriodStateTag(clinicalState.context),
    });
  }

  return findings;
}
