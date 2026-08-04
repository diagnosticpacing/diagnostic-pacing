import type { ClinicalState } from "@/app/clinical/model";
import { findPerformance } from "@/app/clinical/model";
import type {
  ManeuverCatalogEntry,
  RefractoryPeriodDirection,
  RefractoryPeriodStructure,
  RefractoryPeriodType,
} from "@/app/maneuvers/knowledge";

export type RefractoryPeriodComponentDefinition = {
  component: 1 | 2 | 3;
  fieldId: string;
  prompt: string;
};

/**
 * One named refractory period result — Type + Direction + Structure,
 * grouped from 2-3 tagged Response Fields (its "components") that were
 * found scattered among a maneuver's other, unrelated response fields.
 * Uniqueness of (type, direction, structure, component) is enforced at
 * save/lock time (`knowledge/validation.ts`), so there's exactly one
 * maneuver behind any given definition — this isn't picking a winner
 * among several, it's just the one place this result can live.
 */
export type RefractoryPeriodDefinition = {
  id: string;
  type: RefractoryPeriodType;
  direction: RefractoryPeriodDirection;
  structure: RefractoryPeriodStructure;
  label: string;
  maneuverId: string;
  maneuverName: string;
  components: RefractoryPeriodComponentDefinition[];
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

function definitionKey(
  type: RefractoryPeriodType,
  direction: RefractoryPeriodDirection,
  structure: RefractoryPeriodStructure,
): string {
  return `${type}|${direction}|${structure}`;
}

/**
 * Groups every refractory-period-tagged Response Field across the whole
 * maneuver catalog into one definition per (Type, Direction, Structure).
 * Component fields are sorted 1/2/3 within their group. Fields belonging
 * to the same group are expected to live on the same maneuver (that's
 * the whole point — a refractory period is recorded on the back of the
 * maneuver that produced it) but this doesn't hard-require it; if a
 * knowledge base entry ever split a group across two maneuvers, each
 * component's value still resolves independently through its own
 * maneuver's performances, so display degrades gracefully rather than
 * breaking.
 */
export function buildRefractoryPeriodCatalog(
  catalog: ManeuverCatalogEntry[],
): RefractoryPeriodDefinition[] {
  const groups = new Map<
    string,
    {
      type: RefractoryPeriodType;
      direction: RefractoryPeriodDirection;
      structure: RefractoryPeriodStructure;
      maneuverId: string;
      maneuverName: string;
      components: RefractoryPeriodComponentDefinition[];
    }
  >();

  for (const entry of catalog) {
    for (const field of entry.fields) {
      const tag = field.refractoryPeriod;
      if (!tag) continue;

      const key = definitionKey(tag.type, tag.direction, tag.structure);
      const existing = groups.get(key);

      const component: RefractoryPeriodComponentDefinition = {
        component: tag.component,
        fieldId: field.fieldId,
        prompt: field.prompt,
      };

      if (existing) {
        existing.components.push(component);
      } else {
        groups.set(key, {
          type: tag.type,
          direction: tag.direction,
          structure: tag.structure,
          maneuverId: entry.definition.maneuverId,
          maneuverName: entry.definition.maneuverName,
          components: [component],
        });
      }
    }
  }

  return Array.from(groups.entries())
    .map(([id, group]) => ({
      id,
      type: group.type,
      direction: group.direction,
      structure: group.structure,
      label: composeRefractoryPeriodLabel(group.type, group.direction, group.structure),
      maneuverId: group.maneuverId,
      maneuverName: group.maneuverName,
      components: [...group.components].sort((a, b) => a.component - b.component),
    }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Reads a refractory period's current recorded value for a given Clinical
 * State, formatted the same way the original ERP card always did:
 * slash-joined components with trailing blanks dropped (so a 2-component
 * result never trails a stray "/", and a not-yet-recorded component isn't
 * shown as an empty slot in the middle — only trailing gaps are trimmed,
 * matching how a clinician would naturally write down a partial result).
 * Returns "" if the maneuver hasn't been performed under this state at
 * all, or if no component has a value yet.
 */
export function formatRefractoryPeriodValue(
  definition: RefractoryPeriodDefinition,
  clinicalState: ClinicalState,
): string {
  const performance = findPerformance(clinicalState, definition.maneuverId);
  if (!performance) return "";

  const values = definition.components.map(
    (component) => performance.values[component.fieldId]?.trim() ?? "",
  );

  while (values.length > 0 && values[values.length - 1] === "") {
    values.pop();
  }

  return values.join("/");
}
