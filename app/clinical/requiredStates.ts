import type { SheetId, SpreadsheetRow } from "@/app/admin/model";
import {
  phaseOptions,
  rhythmOptions,
  sedationOptions,
  type ClinicalStateContext,
} from "@/app/clinical/model";

/**
 * The Clinical States knowledge-base tab's four real sub-sheets — see
 * CLINICAL-STATES-SUB-SHEETS-2026-08-14 in PROJECT_DESIGN.md. Phase,
 * Rhythm, and Sedation entries populate the matching clinical workspace
 * dropdown directly; Medication entries (Iso On/Off, Adenosine
 * Administered, and similar) don't drive a dropdown of their own — they're
 * only ever selectable as a Maneuver Definitions Required States or
 * Clinical Reasoning Required Clinical State value, matched heuristically
 * against the existing free-text Isoproterenol/Adenosine dose fields (see
 * medicationRequirementSatisfied below).
 */
export type ClinicalStateCategory = "Phase" | "Rhythm" | "Sedation" | "Medication";

/** Which admin sheet backs each category — a row's category is implicit
 * in which of these four sheets it lives on, not a column value. */
const CATEGORY_SHEET_ID: Record<ClinicalStateCategory, SheetId> = {
  Phase: "clinicalStatePhases",
  Rhythm: "clinicalStateRhythms",
  Sedation: "clinicalStateSedations",
  Medication: "clinicalStateMedications",
};

const CATEGORIES = Object.keys(CATEGORY_SHEET_ID) as ClinicalStateCategory[];
const DROPDOWN_CATEGORIES: Extract<ClinicalStateCategory, "Phase" | "Rhythm" | "Sedation">[] = [
  "Phase",
  "Rhythm",
  "Sedation",
];

export type ClinicalStateVocabularyEntry = {
  stateId: string;
  category: ClinicalStateCategory;
  fullName: string;
  abbreviatedName: string;
};

export type ClinicalStateVocabulary = {
  entries: ClinicalStateVocabularyEntry[];
  byAbbreviatedName: Map<string, ClinicalStateVocabularyEntry>;
  byCategory: Record<ClinicalStateCategory, ClinicalStateVocabularyEntry[]>;
};

export type DropdownOption = { value: string; label: string };

const trimmed = (value?: string) => (value ?? "").trim();

/**
 * Parses the four admin Clinical State sub-sheets' raw rows into a
 * lookup-ready vocabulary. Takes the whole knowledgeSheets map (rather
 * than one sheet's rows) since the four category sheets are read
 * together. Rows with a blank State ID or Abbreviated Name are dropped
 * (both are required columns, so this only ever happens for a stray
 * incomplete row mid-edit in the admin UI). Safe to call with missing/
 * empty sheets — every category list and the lookup map just come back
 * empty, and resolveDropdownOptions below falls back to the app's
 * built-in option lists in that case.
 */
export function buildClinicalStateVocabulary(
  sheets: Partial<Record<SheetId, SpreadsheetRow[]>> | undefined,
): ClinicalStateVocabulary {
  const entries: ClinicalStateVocabularyEntry[] = [];
  const byAbbreviatedName = new Map<string, ClinicalStateVocabularyEntry>();
  const byCategory: Record<ClinicalStateCategory, ClinicalStateVocabularyEntry[]> = {
    Phase: [],
    Rhythm: [],
    Sedation: [],
    Medication: [],
  };

  for (const category of CATEGORIES) {
    const rows = sheets?.[CATEGORY_SHEET_ID[category]] ?? [];

    for (const row of rows) {
      const stateId = trimmed(row.stateId);
      const abbreviatedName = trimmed(row.abbreviatedName);
      if (!stateId || !abbreviatedName) continue;

      const entry: ClinicalStateVocabularyEntry = {
        stateId,
        category,
        fullName: trimmed(row.fullName),
        abbreviatedName,
      };

      entries.push(entry);
      // Later rows win on an Abbreviated Name collision (including
      // across categories, in the unlikely event two sub-sheets reuse
      // the same abbreviation) — same last-one-wins precedent every
      // other admin lookup-by-name column in this app already follows.
      byAbbreviatedName.set(abbreviatedName, entry);
      byCategory[category].push(entry);
    }
  }

  return { entries, byAbbreviatedName, byCategory };
}

const FALLBACK_OPTIONS: Record<
  Extract<ClinicalStateCategory, "Phase" | "Rhythm" | "Sedation">,
  readonly string[]
> = {
  Phase: phaseOptions,
  Rhythm: rhythmOptions,
  Sedation: sedationOptions,
};

/**
 * The dropdown options for one of the Phase/Rhythm/Sedation clinical
 * workspace selects — drawn from that category's admin sub-sheet when it
 * has any rows, falling back to the app's built-in default list (see
 * clinical/model.ts) when it's still empty. This transition-safety
 * fallback is what keeps the workspace usable the moment this feature
 * ships, before Murph has entered anything on the new sheets.
 */
export function resolveDropdownOptions(
  category: Extract<ClinicalStateCategory, "Phase" | "Rhythm" | "Sedation">,
  vocabulary: ClinicalStateVocabulary,
): DropdownOption[] {
  const categorized = vocabulary.byCategory[category];
  if (categorized.length > 0) {
    return categorized.map((entry) => ({
      value: entry.abbreviatedName,
      label: entry.fullName || entry.abbreviatedName,
    }));
  }
  return FALLBACK_OPTIONS[category].map((value) => ({ value, label: value }));
}

/** True if every DROPDOWN_CATEGORIES field is still running on the
 * built-in fallback list (i.e. nothing has been entered on the admin
 * sub-sheets yet) — not currently used outside this module, kept here as
 * the single place that would need updating if a "still on defaults"
 * banner is ever added to the clinical workspace. */
export function anyCategoryStillOnFallback(vocabulary: ClinicalStateVocabulary): boolean {
  return DROPDOWN_CATEGORIES.some((category) => vocabulary.byCategory[category].length === 0);
}

const hasWord = (haystack: string, word: string) =>
  new RegExp(`\\b${word}\\b`, "i").test(haystack);

/**
 * Heuristic match for a Medication-category requirement (Iso On/Off,
 * Adenosine Administered, and similar) against the existing free-text
 * Isoproterenol/Adenosine dose fields — modeled on the same kind of
 * name-matching heuristic app/differential/engine.ts's
 * normalizeIntervalTerm already uses for Interval Considered. Any
 * non-blank dose counts as "administered"/"on", matching
 * clinicalStateIsoTag's existing convention in clinical/model.ts.
 * Entries that don't recognizably mention adenosine or iso(proterenol)
 * can't be matched at all and fail safe (never satisfied).
 */
function medicationRequirementSatisfied(
  entry: ClinicalStateVocabularyEntry,
  context: ClinicalStateContext,
): boolean {
  const text = `${entry.abbreviatedName} ${entry.fullName}`.toLowerCase();

  if (text.includes("adenosine")) {
    return context.adenosine.trim() !== "";
  }

  if (text.includes("iso")) {
    return hasWord(text, "off")
      ? context.isoproterenol.trim() === ""
      : context.isoproterenol.trim() !== "";
  }

  return false;
}

/**
 * Whether a single Required States value (an Abbreviated Name from one
 * of the Clinical State sub-sheets) is satisfied by a Clinical State's
 * current context. An unrecognized Abbreviated Name (deleted/renamed on
 * the admin sheet since the maneuver was configured) fails safe — treated
 * as unsatisfied rather than silently ignored, so a misconfigured
 * requirement blocks the maneuver instead of quietly letting it through.
 */
export function maneuverRequirementSatisfied(
  requirement: string,
  context: ClinicalStateContext,
  vocabulary: ClinicalStateVocabulary,
): boolean {
  const entry = vocabulary.byAbbreviatedName.get(requirement);
  if (!entry) return false;

  switch (entry.category) {
    case "Phase":
      return context.phase === entry.abbreviatedName;
    case "Rhythm":
      return context.rhythm === entry.abbreviatedName;
    case "Sedation":
      return context.sedation === entry.abbreviatedName;
    case "Medication":
      return medicationRequirementSatisfied(entry, context);
    default:
      return false;
  }
}

/** AND semantics, confirmed with Murph: when a maneuver lists more than
 * one Required State, every one of them must be satisfied simultaneously
 * by the same Clinical State — a maneuver's own empty Required States
 * list is vacuously satisfied (nothing to check). */
export function maneuverRequirementsSatisfied(
  requirements: string[],
  context: ClinicalStateContext,
  vocabulary: ClinicalStateVocabulary,
): boolean {
  return requirements.every((requirement) =>
    maneuverRequirementSatisfied(requirement, context, vocabulary),
  );
}

/**
 * Builds the context a brand-new Clinical State should carry, starting
 * from `baseContext` (the currently active state, so anything not
 * touched by a requirement — e.g. Sedation, when only a Rhythm is
 * required — carries forward unchanged) and applying every requirement's
 * implied field. Phase/Rhythm/Sedation requirements set their field
 * outright. An "off"-flavored Medication requirement clears the matching
 * dose field; an "on"-flavored one is left as whatever baseContext
 * already had — a real dose can't be invented, so the user still has to
 * enter it by hand after the new state is created (flagged to Murph in
 * PROJECT_DESIGN.md as an accepted limitation, not an oversight).
 */
export function buildNewStateContextForRequirements(
  requirements: string[],
  baseContext: ClinicalStateContext,
  vocabulary: ClinicalStateVocabulary,
): ClinicalStateContext {
  const next: ClinicalStateContext = { ...baseContext };

  for (const requirement of requirements) {
    const entry = vocabulary.byAbbreviatedName.get(requirement);
    if (!entry) continue;

    switch (entry.category) {
      case "Phase":
        next.phase = entry.abbreviatedName;
        break;
      case "Rhythm":
        next.rhythm = entry.abbreviatedName;
        break;
      case "Sedation":
        next.sedation = entry.abbreviatedName;
        break;
      case "Medication": {
        const text = `${entry.abbreviatedName} ${entry.fullName}`.toLowerCase();
        if (!hasWord(text, "off")) break;
        if (text.includes("adenosine")) next.adenosine = "";
        else if (text.includes("iso")) next.isoproterenol = "";
        break;
      }
    }
  }

  return next;
}
