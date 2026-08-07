import type { ClinicalState } from "@/app/clinical/model";
import { findPerformance, formatClinicalStateTag } from "@/app/clinical/model";
import type {
  ManeuverCatalogEntry,
  ManeuverCatalogField,
  RefractoryPeriodDirection,
} from "@/app/maneuvers/knowledge";

/**
 * One named refractory period result — a single tagged Response Field IS
 * the whole result now, not a group of separately-tagged sibling fields.
 * Always has up to three value slots (a second and third extrastimulus
 * are optional, left blank if not performed) — see
 * REFRACTORY-PERIODS-SIMPLIFY-2026-08-06 for why this is now a fixed
 * constant rather than a per-field Type-driven choice. `label` is the
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
  /** Always 3 — see the module doc comment above. */
  componentCount: 3;
};

/** Every refractory period field always renders/stores up to three
 * value boxes now (the Functional-vs-Effective 1-vs-3 distinction was
 * dropped along with the Type column). Kept as a named constant, not
 * inlined, so every call site still reads "how many boxes" rather
 * than a bare magic number. */
export const REFRACTORY_PERIOD_COMPONENT_COUNT = 3 as const;

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
    componentCount: REFRACTORY_PERIOD_COMPONENT_COUNT,
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
 * slash-joined components with trailing blanks dropped (so entering
 * only one or two of the three boxes never trails a stray "/"). Returns
 * "" if the maneuver hasn't been performed under this state at all, or
 * if no value has been entered yet.
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
