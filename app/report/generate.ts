import type { CaseRecord, ClinicalState } from "@/app/clinical/model";
import { workspaceConfigurations } from "@/app/clinical/model";
import type { ManeuverCatalogEntry } from "@/app/maneuvers/knowledge";
import {
  buildRefractoryPeriodCatalog,
  collectRefractoryPeriodFindings,
  composeRefractoryPeriodLabel,
  type RefractoryPeriodDefinition,
} from "@/app/refractoryPeriods/knowledge";

const isIsoOn = (state: ClinicalState) => state.context.isoproterenol.trim() !== "";

// Post-ablation and Post-ablation 2 are both "post" for report purposes —
// same two-bucket simplification the Refractory Periods panel's state tag
// already uses (see CLINICAL-STATE-CARD-WRAP-AND-ABBREVIATION-2026-08-04 /
// REFRACTORY-PERIODS-TWO-ROW-2026-08-05 in PROJECT_DESIGN.md).
const isPreAblation = (state: ClinicalState) => state.context.phase === "Pre-ablation";

/** Every non-blank measurement recorded for a Clinical State, labeled
 * against whichever Rhythm's field set it was recorded under. */
function intervalLines(state: ClinicalState): string[] {
  const workspace = workspaceConfigurations[state.context.rhythm];
  const lines: string[] = [];

  for (const section of workspace.sections) {
    for (const field of section.fields) {
      const value = state.measurements[field.id]?.trim();
      if (value) lines.push(`${field.label}: ${value} ${field.unit}`);
    }
  }

  return lines;
}

/**
 * Every recorded value, across the given states, for every definition in
 * `catalog` running the given direction — labeled without the direction
 * prefix `composeRefractoryPeriodLabel` normally includes, since the
 * report already says "Antegrade"/"Retrograde" as the enclosing section
 * heading and repeating it on every line would just be noise.
 */
function refractoryPeriodLines(
  catalog: RefractoryPeriodDefinition[],
  direction: "Antegrade" | "Retrograde",
  states: ClinicalState[],
): string[] {
  const lines: string[] = [];

  for (const definition of catalog) {
    if (definition.direction !== direction) continue;
    const label = composeRefractoryPeriodLabel(definition.type, "n/a", definition.structure);

    for (const finding of collectRefractoryPeriodFindings(definition, states)) {
      lines.push(`${label}: ${finding.value} ms`);
    }
  }

  return lines;
}

function indent(lines: string[], levels: number): string[] {
  const prefix = "  ".repeat(levels);
  return lines.length > 0
    ? lines.map((line) => `${prefix}${line}`)
    : [`${prefix}None recorded`];
}

/** Renders one Pre-/Post-Ablation Measurements section (2 or 4): Off/On
 * Isoproterenol, each split into Antegrade/Retrograde findings. */
function ablationMeasurementsSection(
  sectionNumber: "2" | "4",
  catalog: RefractoryPeriodDefinition[],
  offIsoStates: ClinicalState[],
  onIsoStates: ClinicalState[],
): string[] {
  const lines: string[] = [];

  lines.push(`  ${sectionNumber}.a. Off Isoproterenol`, "");
  lines.push(`    ${sectionNumber}.a.1. Antegrade`);
  lines.push(...indent(refractoryPeriodLines(catalog, "Antegrade", offIsoStates), 3), "");
  lines.push(`    ${sectionNumber}.a.2. Retrograde`);
  lines.push(...indent(refractoryPeriodLines(catalog, "Retrograde", offIsoStates), 3), "");

  lines.push(`  ${sectionNumber}.b. On Isoproterenol`, "");
  lines.push(`    ${sectionNumber}.b.1. Antegrade`);
  lines.push(...indent(refractoryPeriodLines(catalog, "Antegrade", onIsoStates), 3), "");
  lines.push(`    ${sectionNumber}.b.2. Retrograde`);
  lines.push(...indent(refractoryPeriodLines(catalog, "Retrograde", onIsoStates), 3), "");

  return lines;
}

/**
 * The plain-text case report — see REPORT-GENERATOR-2026-08-05 in
 * PROJECT_DESIGN.md for the full section-by-section rationale. Pure
 * function of the case data and the live maneuver catalog (needed to
 * resolve which Response Fields are tagged as refractory periods); no
 * DOM/browser API use, so it's trivially testable and reusable for both
 * the on-screen preview and the copy/print actions.
 */
export function generateCaseReport(
  caseRecord: CaseRecord,
  maneuverCatalog: ManeuverCatalogEntry[],
): string {
  const catalog = buildRefractoryPeriodCatalog(maneuverCatalog);
  const [baseline, ...rest] = caseRecord.clinicalStates;
  const lines: string[] = [];

  lines.push(`${caseRecord.title} — Diagnostic Pacing Report`);
  lines.push(`Generated ${new Date().toLocaleString()}`);
  lines.push("");

  // 1. Baseline State — the first Clinical State recorded, whatever its
  // Rhythm happens to be (in practice this is where a study starts, before
  // anything has been induced or ablated).
  lines.push("1. Baseline State", "");
  if (baseline) {
    lines.push(`Rhythm: ${baseline.context.rhythm}`);
    lines.push(...indent(intervalLines(baseline), 0));
  } else {
    lines.push("None recorded");
  }
  lines.push("");

  // 2. Pre-Ablation Measurements — every Clinical State tagged
  // Pre-ablation, including the baseline state itself if it qualifies
  // (which it does by default), not just states after it.
  const preOff = caseRecord.clinicalStates.filter(
    (state) => isPreAblation(state) && !isIsoOn(state),
  );
  const preOn = caseRecord.clinicalStates.filter(
    (state) => isPreAblation(state) && isIsoOn(state),
  );
  lines.push("2. Pre-Ablation Measurements", "");
  lines.push(...ablationMeasurementsSection("2", catalog, preOff, preOn));

  // 3. Rhythms Induced — Tachycardia states other than the baseline state,
  // labeled by their position in the Clinical States list (matching the
  // numbering already visible on the rail cards) plus when they were
  // recorded, since there's no other name to give an induced rhythm.
  lines.push("3. Rhythms Induced", "");
  const induced = rest
    .map((state, index) => ({ state, number: index + 2 }))
    .filter(({ state }) => state.context.rhythm === "Tachycardia");

  if (induced.length === 0) {
    lines.push("None recorded");
  } else {
    for (const { state, number } of induced) {
      const iso = isIsoOn(state) ? "Iso on" : "Iso off";
      lines.push(
        `Clinical State ${number}: Tachycardia — ${state.context.phase}, ${iso}`,
      );
      lines.push(...indent(intervalLines(state), 1), "");
    }
  }
  lines.push("");

  // 4. Post-Ablation Measurements — every Clinical State tagged
  // Post-ablation or Post-ablation 2 (collapsed together, same as
  // section 2's Pre-ablation bucket).
  const postOff = caseRecord.clinicalStates.filter(
    (state) => !isPreAblation(state) && !isIsoOn(state),
  );
  const postOn = caseRecord.clinicalStates.filter(
    (state) => !isPreAblation(state) && isIsoOn(state),
  );
  lines.push("4. Post-Ablation Measurements", "");
  lines.push(...ablationMeasurementsSection("4", catalog, postOff, postOn));

  return lines.join("\n").trimEnd();
}
