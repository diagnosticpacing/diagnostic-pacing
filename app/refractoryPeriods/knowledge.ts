import type { ClinicalState } from "@/app/clinical/model";
import { findPerformance, formatClinicalStateTag } from "@/app/clinical/model";
import type {
  ManeuverCatalogEntry,
  ManeuverCatalogField,
  RefractoryPeriodDirection,
  RefractoryPeriodStructure,
  RefractoryPeriodType,
} from "@/app/maneuvers/knowledge";

/**
 * One named refractory period result — a single tagged Response Field IS
 * the whole result now, not a group of separately-tagged sibling fields.
 * Functional always has exactly one value slot; Effective always has up
 * to three (a third extrastimulus is optional, left blank if not
 * performed). Uniqueness of (type, direction, structure) is enforced at
 * save/lock time (`knowledge/validation.ts`), so there's exactly one
 * field behind any given definition.
 */
export type RefractoryPeriodDefinition = {
  id: string;
  type: RefractoryPeriodType;
  direction: RefractoryPeriodDirection;
  structure: RefractoryPeriodStructure;
  label: string;
  fieldId: string;
  prompt: string;
  maneuverId: string;
  maneuverName: string;
  /** How many value boxes this definition renders/stores: 1 for Functional, 3 for Effective. */
  componentCount: 1 | 3;
};

const STRUCTURE_ABBREVIATIONS: Record<RefractoryPeriodStructure, string> = {
  Atrial: "Atrial",
  "AV Node": "AV Node",
  "Fast Pathway": "Fast Pathway",
  "Slow Pathway": "Slow Pathway",
  "Accessory Pathway 1": "AP1",
  "Accessory Pathway 2": "AP2",
  Ventricular: "Ventricular",
};

const TYPE_ABBREVIATIONS: Record<RefractoryPeriodType, string> = {
  Functional: "FRP",
  Effective: "ERP",
};

/** Functional Refractory Periods are always a single value; Effective is always up to three. */
export function refractoryPeriodComponentCount(type: RefractoryPeriodType): 1 | 3 {
  return type === "Effective" ? 3 : 1;
}

/**
 * The storage key for one value slot of a refractory period field within a
 * ManeuverPerformance's `values` map. The first slot always uses the
 * field's own fieldId with no suffix — so a Functional field (always one
 * slot) behaves exactly like any other Number Field, and Effective's first
 * box is always what a naive lookup by fieldId alone would find. Only the
 * second and third slots of an Effective field get a suffix, e.g.
 * `FID-042.2`, `FID-042.3`.
 */
export function refractoryPeriodComponentKey(fieldId: string, component: number): string {
  return component <= 1 ? fieldId : `${fieldId}.${component}`;
}

/**
 * Composes the clinician-facing label from the three tag dimensions —
 * e.g. Effective + Retrograde + Accessory Pathway 1 -> "Retrograde AP1
 * ERP". Direction is omitted when it's "n/a" (Atrial/Ventricular
 * refractoriness isn't meaningfully antegrade or retrograde), rather
 * than printing a literal "n/a" in the label.
 */
export function composeRefractoryPeriodLabel(
  type: RefractoryPeriodType,
  direction: RefractoryPeriodDirection,
  structure: RefractoryPeriodStructure,
): string {
  return [
    direction !== "n/a" ? direction : null,
    STRUCTURE_ABBREVIATIONS[structure],
    TYPE_ABBREVIATIONS[type],
  ]
    .filter((part): part is string => Boolean(part))
    .join(" ");
}

function toDefinition(
  entry: ManeuverCatalogEntry,
  field: ManeuverCatalogField,
): RefractoryPeriodDefinition | null {
  const tag = field.refractoryPeriod;
  if (!tag) return null;

  return {
    id: `${tag.type}|${tag.direction}|${tag.structure}`,
    type: tag.type,
    direction: tag.direction,
    structure: tag.structure,
    label: composeRefractoryPeriodLabel(tag.type, tag.direction, tag.structure),
    fieldId: field.fieldId,
    prompt: field.prompt,
    maneuverId: entry.definition.maneuverId,
    maneuverName: entry.definition.maneuverName,
    componentCount: refractoryPeriodComponentCount(tag.type),
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
 * slash-joined components with trailing blanks dropped (so a 2-component
 * Effective result never trails a stray "/"). A Functional definition
 * (componentCount 1) reads its field directly, with no suffix. Returns ""
 * if the maneuver hasn't been performed under this state at all, or if no
 * value has been entered yet.
 */
export function formatRefractoryPeriodValue(
  definition: RefractoryPeriodDefinition,
  clinicalState: ClinicalState,
): string {
  const performance = findPerformance(clinicalState, definition.maneuverId);
  if (!performance) return "";

  if (definition.componentCount === 1) {
    return performance.values[definition.fieldId]?.trim() ?? "";
  }

  const values: string[] = [];
  for (let component = 1; component <= definition.componentCount; component += 1) {
    const key = refractoryPeriodComponentKey(definition.fieldId, component);
    values.push(performance.values[key]?.trim() ?? "");
  }

  while (values.length > 0 && values[values.length - 1] === "") {
    values.pop();
  }

  return values.join("/");
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
