export type SpreadsheetRow = {
  __rowId: string;
  [key: string]: string;
};

export type ColumnDefinition = {
  key: string;
  label: string;
  modelUse: string;
  width?: string;
  multiline?: boolean;
  required?: boolean;
  /** If set, this column's value must start with this literal prefix (e.g. "MID-"). */
  idPrefix?: string;
  /** Fixed list of selectable values. Rendered as a dropdown once the admin UI supports it. */
  options?: string[];
  /** When true, the column may hold more than one value (comma-separated). */
  multiSelect?: boolean;
  /**
   * When set, this column's values are picked from another sheet's column
   * rather than typed freely. Rendered as a live dropdown, populated from
   * the current data in that sheet.
   */
  lookup?: { sheet: SheetId; column: string };
  /**
   * When set alongside `lookup`, selecting a value also auto-fills the
   * named column (in the same row) with the matched row's primary ID —
   * e.g. picking a maneuver by name also fills the hidden Maneuver ID
   * column.
   */
  populatesColumn?: string;
  /**
   * When set alongside `populatesColumn`, the auto-filled value is copied
   * from this column of the matched row instead of the target sheet's
   * primary ID column (the default) — e.g. mirroring a human-readable
   * Name rather than filling in a stable ID, for a paired column that
   * isn't referenced elsewhere as a foreign key.
   */
  populatesColumnFrom?: string;
  /** When true, a non-empty value renders an "Open" link to that URL. */
  isUrl?: true;
  /**
   * Names sibling columns (in the same row) that, when any holds a
   * non-blank value, make this column disabled/uneditable — used to keep
   * two alternative paths on one row mutually exclusive (e.g. Maneuver
   * Considered vs. Interval Considered) rather than letting a row
   * combine both.
   */
  disabledWhenFilled?: string[];
  /**
   * When set alongside `lookup`, narrows the option list to only target
   * rows whose `matchColumn` equals this row's own `ownColumn` value —
   * e.g. only show response fields belonging to the maneuver already
   * chosen earlier in this same row. If `ownColumn` is blank, there are
   * no options yet (the prerequisite hasn't been picked).
   *
   * `viaSheet`/`viaListColumn` cover the variant where the constraint
   * lives on a "parent" row as a comma-separated list rather than as one
   * row per allowed value — e.g. narrowing Diagnosis Affected to only the
   * diagnoses named in the chosen maneuver's own Relevant Diagnoses list.
   * When set, rows in `viaSheet` matching `ownColumn`/`matchColumn` supply
   * the allowed-value set (read from `viaListColumn`, comma-separated);
   * `lookup.sheet` still supplies the actual option rows (so cross-sheet
   * reference chips keep pointing at the right sheet), just filtered down
   * to that allowed set.
   *
   * `optional` covers a column that's only sometimes scoped by another —
   * e.g. Diagnosis Affected narrows to a maneuver's relevant diagnoses
   * when Maneuver Considered is used, but a row can instead use Interval
   * Considered, which has no relevant-diagnoses list to narrow by. With
   * `optional: true`, a blank prerequisite falls back to the full
   * unfiltered option list instead of blocking the column entirely.
   */
  filterBy?: {
    ownColumn: string;
    matchColumn: string;
    viaSheet?: SheetId;
    viaListColumn?: string;
    optional?: boolean;
  };
};

export type SheetDefinition = {
  id: SheetId;
  label: string;
  description: string;
  columns: ColumnDefinition[];
};

export type TopLevelTabId =
  | "clinicalTerms"
  | "clinicalStates"
  | "diagnoses"
  | "maneuvers"
  | "clinicalReasoning"
  | "references";

export type ManeuverSheetId =
  | "maneuverDefinitions"
  | "maneuverResponseFields"
  | "maneuverResponseOptions";

export type SheetId =
  | "clinicalTerms"
  | "clinicalStates"
  | "diagnoses"
  | "maneuverDefinitions"
  | "maneuverResponseFields"
  | "maneuverResponseOptions"
  | "clinicalReasoning"
  | "references";

export const topLevelTabs: {
  id: TopLevelTabId;
  label: string;
}[] = [
  { id: "clinicalTerms", label: "Intervals" },
  { id: "clinicalStates", label: "Clinical States" },
  { id: "diagnoses", label: "Diagnoses" },
  { id: "maneuvers", label: "Maneuvers" },
  { id: "clinicalReasoning", label: "Clinical Reasoning" },
  { id: "references", label: "References" },
];

export const maneuverSheets: {
  id: ManeuverSheetId;
  label: string;
  description: string;
}[] = [
  {
    id: "maneuverDefinitions",
    label: "Maneuver Definitions",
    description:
      "Defines each maneuver and supplies the descriptive content used by its tile and expanded detail view.",
  },
  {
    id: "maneuverResponseFields",
    label: "Response Fields",
    description:
      "Defines the questions and data-entry controls displayed for each pacing maneuver.",
  },
  {
    id: "maneuverResponseOptions",
    label: "Response Options",
    description:
      "Defines the selectable answers available to single-select and multi-select response fields.",
  },
];

export const sheetDefinitions: Record<SheetId, SheetDefinition> = {
  clinicalTerms: {
    id: "clinicalTerms",
    label: "Intervals",
    description:
      "Shared interval/measurement vocabulary (AH, HV, VA, and similar) used consistently throughout the application.",
    columns: [
      {
        key: "termId",
        label: "Interval ID",
        modelUse:
          "Stable identifier used when another record needs to reference this interval.",
        width: "170px",
        required: true,
        idPrefix: "TID-",
      },
      {
        key: "name",
        label: "Name",
        modelUse: "The preferred human-readable name of the interval.",
        width: "220px",
        required: true,
      },
      {
        key: "definition",
        label: "Definition",
        modelUse:
          "Defines what the interval means so it can be interpreted consistently in clinical reasoning and explanations.",
        width: "minmax(360px, 1fr)",
        multiline: true,
        required: true,
      },
      {
        key: "numberOfFields",
        label: "Number of Fields",
        modelUse:
          "Defines the format the value is expressed in, e.g. 500 vs 500/300.",
        width: "160px",
        required: true,
        options: ["n/a", "1", "2"],
      },
      {
        key: "unitOfMeasure",
        label: "Unit of Measure",
        modelUse: "The unit of measure used for the interval, if applicable.",
        width: "150px",
        options: ["", "ms", "mV"],
      },
      {
        key: "notes",
        label: "Notes",
        modelUse: "Optional synonyms, cautions, usage guidance, or editorial context.",
        width: "minmax(280px, 0.8fr)",
        multiline: true,
      },
    ],
  },

  clinicalStates: {
    id: "clinicalStates",
    label: "Clinical States",
    description:
      "Fixed vocabulary of pharmacologic and rhythm conditions a maneuver result can be recorded under.",
    columns: [
      {
        key: "stateId",
        label: "State ID",
        modelUse:
          "Stable identifier used by Clinical Reasoning and Maneuver Definitions to reference this clinical state.",
        width: "170px",
        required: true,
        idPrefix: "SID-",
      },
      {
        key: "fullName",
        label: "Full Name",
        modelUse:
          "Full name of the clinical state displayed in reporting and summary explanations.",
        width: "240px",
        required: true,
        options: [
          "Normal Sinus Rhythm",
          "Bradycardia",
          "Tachycardia",
          "Implanted CRM Pacing",
          "Isoproterenol On",
          "Isoproterenol Off",
          "Adenosine Administered",
        ],
      },
      {
        key: "abbreviatedName",
        label: "Abbreviated Name",
        modelUse:
          "Compact label displayed where the full clinical state name would be too long, and the value used elsewhere to reference this state.",
        width: "170px",
        required: true,
        options: [
          "NSR",
          "Brady",
          "Tachy",
          "CRM Paced",
          "Iso On",
          "Iso Off",
          "Adenosine",
        ],
      },
      {
        key: "notes",
        label: "Notes",
        modelUse:
          "Optional caveats, variants, terminology guidance, or state-specific context.",
        width: "minmax(280px, 0.8fr)",
        multiline: true,
      },
    ],
  },

  diagnoses: {
    id: "diagnoses",
    label: "Diagnoses",
    description:
      "Defines the diagnoses displayed and evaluated in the differential diagnosis.",
    columns: [
      {
        key: "diagnosisId",
        label: "Diagnosis ID",
        modelUse: "Stable identifier used by Clinical Reasoning to update this diagnosis.",
        width: "180px",
        required: true,
        idPrefix: "DID-",
      },
      {
        key: "fullName",
        label: "Full Name",
        modelUse:
          "Full name of the arrhythmia mechanism displayed in reporting and summary explanations.",
        width: "280px",
        required: true,
      },
      {
        key: "abbreviatedName",
        label: "Abbreviated Name",
        modelUse: "Compact label displayed where the full diagnosis name would be too long.",
        width: "170px",
        required: true,
      },
      {
        key: "description",
        label: "Description",
        modelUse:
          "Defines the mechanism and important distinguishing characteristics associated with the diagnosis.",
        width: "minmax(380px, 1fr)",
        multiline: true,
      },
      {
        key: "notes",
        label: "Notes",
        modelUse:
          "Optional caveats, variants, terminology guidance, or diagnosis-specific context.",
        width: "minmax(280px, 0.75fr)",
        multiline: true,
      },
      {
        key: "baseRank",
        label: "Base Rank",
        modelUse:
          "Fixed population-frequency order. Used as the default sort position and as the tiebreaker when two diagnoses have equal supporting evidence. Lower numbers are more common.",
        width: "130px",
        required: true,
      },
    ],
  },

  maneuverDefinitions: {
    id: "maneuverDefinitions",
    label: "Maneuver Definitions",
    description:
      "One row represents one maneuver. These fields define the maneuver tile and its expanded educational content.",
    columns: [
      {
        key: "maneuverId",
        label: "Maneuver ID",
        modelUse:
          "Stable identifier connecting this maneuver to response fields, response options, reasoning, references, and saved performances.",
        width: "180px",
        required: true,
        idPrefix: "MID-",
      },
      {
        key: "maneuverName",
        label: "Maneuver Name",
        modelUse: "The maneuver name displayed on the front of its tile and in reporting.",
        width: "280px",
        required: true,
      },
      {
        key: "relevantDiagnoses",
        label: "Relevant Diagnoses",
        modelUse:
          "The diagnoses this maneuver's result can inform. Used to decide which maneuver to suggest next, and as a fallback signal before Clinical Reasoning rules exist for this maneuver.",
        width: "minmax(240px, 0.85fr)",
        multiSelect: true,
        lookup: { sheet: "diagnoses", column: "abbreviatedName" },
      },
      {
        key: "requiredStates",
        label: "Required States",
        modelUse: "The clinical states necessary to perform this pacing maneuver.",
        width: "minmax(220px, 0.8fr)",
        multiSelect: true,
        lookup: { sheet: "clinicalStates", column: "abbreviatedName" },
      },
      {
        key: "technique",
        label: "Technique",
        modelUse: "Description of how to perform the maneuver and record the result.",
        width: "minmax(380px, 1.1fr)",
        multiline: true,
      },
    ],
  },

  maneuverResponseFields: {
    id: "maneuverResponseFields",
    label: "Response Fields",
    description: "One row represents one input control on a maneuver's response.",
    columns: [
      {
        key: "fieldId",
        label: "Field ID",
        modelUse:
          "Stable identifier connecting this response field to response options, reasoning, references, and saved performances.",
        width: "180px",
        required: true,
        idPrefix: "FID-",
      },
      {
        key: "associatedManeuverId",
        label: "Associated Maneuver ID",
        modelUse: "Identifies which maneuver owns this response field.",
        width: "200px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverId" },
      },
      {
        key: "order",
        label: "Order",
        modelUse: "Determines the order in which this field appears among the maneuver's response fields.",
        width: "90px",
        required: true,
        options: ["1", "2", "3", "4", "5", "6", "7", "8"],
      },
      {
        key: "prompt",
        label: "Maneuver Response Prompt",
        modelUse:
          "The question or label displayed to the clinician when prompted to enter pacing maneuver results.",
        width: "minmax(320px, 0.9fr)",
        multiline: true,
        required: true,
      },
      {
        key: "availableTerms",
        label: "Available Terms",
        modelUse:
          "Which comparison operators are valid against this field's result. Filters the operator choices available to Clinical Reasoning.",
        width: "180px",
        required: true,
        multiSelect: true,
        options: ["n/a", "=", ">", "<"],
      },
      {
        key: "inputType",
        label: "Input Type",
        modelUse: "Determines which entry control is rendered for this field.",
        width: "210px",
        required: true,
        options: [
          "Checkbox",
          "Single Select Dropdown",
          "Multi Select Dropdown",
          "Number Field",
          "Text Field(s)",
        ],
      },
      {
        key: "units",
        label: "Units",
        modelUse: "Optional units displayed beside a numeric response.",
        width: "110px",
        required: true,
        options: ["n/a", "ms", "mV", "mA"],
      },
      {
        key: "required",
        label: "Required",
        modelUse: "Controls whether the maneuver can be accepted without completing this field.",
        width: "110px",
        required: true,
        options: ["Yes", "No"],
      },
      {
        key: "helpText",
        label: "Help Text",
        modelUse: "Context shown near the field to explain how the response should be determined or entered.",
        width: "minmax(300px, 0.9fr)",
        multiline: true,
      },
    ],
  },

  maneuverResponseOptions: {
    id: "maneuverResponseOptions",
    label: "Response Options",
    description: "One row represents one selectable answer for a response field.",
    columns: [
      {
        key: "optionId",
        label: "Option ID",
        modelUse: "Stable identifier for this particular response field answer option.",
        width: "200px",
        required: true,
        idPrefix: "OID-",
      },
      {
        key: "associatedManeuverName",
        label: "Associated Maneuver Name",
        modelUse: "Identifies which maneuver's response field owns this option.",
        width: "220px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverName" },
        populatesColumn: "associatedManeuverId",
      },
      {
        key: "associatedManeuverId",
        label: "Associated Maneuver ID",
        modelUse:
          "Identifies which maneuver's response field owns this option. Auto-populated from Associated Maneuver Name.",
        width: "190px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverId" },
      },
      {
        key: "associatedManeuverResponsePrompt",
        label: "Associated Maneuver Response Prompt",
        modelUse:
          "Identifies the response field in which this option should appear, narrowed to fields belonging to the maneuver selected above.",
        width: "260px",
        lookup: { sheet: "maneuverResponseFields", column: "prompt" },
        filterBy: { ownColumn: "associatedManeuverId", matchColumn: "associatedManeuverId" },
        populatesColumn: "associatedFieldId",
      },
      {
        key: "associatedFieldId",
        label: "Associated Field ID",
        modelUse:
          "Identifies the response field in which this option should appear. Auto-populated from Associated Maneuver Response Prompt.",
        width: "220px",
        lookup: { sheet: "maneuverResponseFields", column: "fieldId" },
      },
      {
        key: "order",
        label: "Order",
        modelUse: "Determines the order in which this option appears in the control.",
        width: "90px",
        required: true,
        options: ["1", "2", "3", "4", "5", "6", "7", "8"],
      },
      {
        key: "displayLabel",
        label: "Display Label",
        modelUse:
          "The clinician-facing wording shown in the dropdown, button group, or selection list.",
        width: "300px",
      },
    ],
  },

  clinicalReasoning: {
    id: "clinicalReasoning",
    label: "Clinical Reasoning",
    description:
      "Each row represents one transparent clinical interpretation linking an observation to a diagnosis.",
    columns: [
      {
        key: "reasoningId",
        label: "Reasoning ID",
        modelUse: "Stable identifier for this individual clinical reasoning statement.",
        width: "180px",
        required: true,
        idPrefix: "CRID-",
      },
      {
        key: "maneuverConsidered",
        label: "Maneuver Considered",
        modelUse:
          "The maneuver this reasoning statement evaluates, as an alternative to Interval Considered. Disabled while Interval Considered holds a value — clear that first to use this instead.",
        width: "220px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverName" },
        populatesColumn: "maneuverId",
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "maneuverId",
        label: "Maneuver ID",
        modelUse:
          "Identifies the maneuver whose result activates this reasoning statement. Intended to auto-populate from Maneuver Considered.",
        width: "150px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverId" },
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "responseFieldPrompt",
        label: "Response Field Prompt",
        modelUse:
          "The specific maneuver response field being evaluated, narrowed to fields belonging to the maneuver selected above.",
        width: "240px",
        lookup: { sheet: "maneuverResponseFields", column: "prompt" },
        filterBy: { ownColumn: "maneuverId", matchColumn: "associatedManeuverId" },
        populatesColumn: "fieldId",
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "fieldId",
        label: "Associated Field ID",
        modelUse:
          "Identifies the specific maneuver response field being evaluated. Intended to auto-populate from Response Field Prompt.",
        width: "180px",
        lookup: { sheet: "maneuverResponseFields", column: "fieldId" },
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "intervalConsidered",
        label: "Interval Considered",
        modelUse:
          "The interval this reasoning statement evaluates directly, as an alternative to a Maneuver/Response Field pair — e.g. an AH interval threshold rather than a maneuver result. Disabled while Maneuver Considered holds a value — clear that first to use this instead.",
        width: "220px",
        lookup: { sheet: "clinicalTerms", column: "name" },
        populatesColumn: "intervalName",
        populatesColumnFrom: "name",
        disabledWhenFilled: ["maneuverConsidered", "maneuverId"],
      },
      {
        key: "intervalName",
        label: "Interval Name",
        modelUse:
          "Identifies the specific interval being evaluated, by name (Intervals has no other sheet referencing it by ID, so this mirrors the readable name rather than a code). Intended to auto-populate from Interval Considered.",
        width: "180px",
        lookup: { sheet: "clinicalTerms", column: "name" },
        disabledWhenFilled: ["maneuverConsidered", "maneuverId"],
      },
      {
        key: "operator",
        label: "Operator",
        modelUse: "Defines how the recorded response is compared with the expected value.",
        width: "160px",
        required: true,
        options: ["Is Checked", "Is Unchecked", "=", "≠", ">", "<"],
      },
      {
        key: "comparedValue",
        label: "Compared Value",
        modelUse: "The value the operator compares the field's result to, if applicable.",
        width: "200px",
      },
      {
        key: "differentialAction",
        label: "Differential Action",
        modelUse: "Determines what kind of conclusion this result contributes to the diagnosis.",
        width: "170px",
        required: true,
        options: ["Supports", "Excludes", "Confirms"],
      },
      {
        key: "diagnosisAffected",
        label: "Diagnosis Affected",
        modelUse:
          "The diagnosis that this clinical reasoning acts upon. Narrowed to diagnoses the maneuver selected above is relevant to when this row uses Maneuver Considered; shows every diagnosis when it uses Interval Considered instead.",
        width: "200px",
        lookup: { sheet: "diagnoses", column: "abbreviatedName" },
        filterBy: {
          ownColumn: "maneuverId",
          matchColumn: "maneuverId",
          viaSheet: "maneuverDefinitions",
          viaListColumn: "relevantDiagnoses",
          optional: true,
        },
        populatesColumn: "diagnosisId",
      },
      {
        key: "diagnosisId",
        label: "Diagnosis ID",
        modelUse:
          "The diagnosis that this clinical reasoning acts upon. Intended to auto-populate from Diagnosis Affected.",
        width: "150px",
        lookup: { sheet: "diagnoses", column: "diagnosisId" },
      },
      {
        key: "explanation",
        label: "Explanation",
        modelUse:
          "The clinician-facing explanation of why this response has the stated effect on the diagnosis. Excerpted manuscript text preferred.",
        width: "minmax(380px, 1.1fr)",
        multiline: true,
      },
      {
        key: "referenceTitle",
        label: "Reference Title",
        modelUse: "The reference that supports the explanation for this clinical reasoning.",
        width: "220px",
        lookup: { sheet: "references", column: "referenceTitle" },
        populatesColumn: "referenceId",
      },
      {
        key: "referenceId",
        label: "Reference ID",
        modelUse:
          "The reference that supports the explanation for this clinical reasoning. Intended to auto-populate from Reference Title.",
        width: "160px",
        lookup: { sheet: "references", column: "referenceId" },
      },
      {
        key: "ruleGroupId",
        label: "Rule Group ID",
        modelUse:
          "Rows sharing the same Rule Group ID must all be satisfied together (AND) before the Differential Action applies. Leave blank for a standalone condition.",
        width: "180px",
      },
      {
        key: "requiredClinicalState",
        label: "Required Clinical State",
        modelUse:
          "Restricts this condition to results recorded while the specified Clinical State was active. Narrowed to states the maneuver selected above requires when this row uses Maneuver Considered; shows every Clinical State when it uses Interval Considered instead. Used together with Rule Group ID to require the same finding across multiple states.",
        width: "220px",
        lookup: { sheet: "clinicalStates", column: "abbreviatedName" },
        filterBy: {
          ownColumn: "maneuverId",
          matchColumn: "maneuverId",
          viaSheet: "maneuverDefinitions",
          viaListColumn: "requiredStates",
          optional: true,
        },
      },
      {
        key: "ruleDescription",
        label: "Rule Description",
        modelUse: "Plain language description of the rule.",
        width: "minmax(280px, 0.9fr)",
        multiline: true,
      },
    ],
  },

  references: {
    id: "references",
    label: "References",
    description: "Publications and other evidence supporting maneuver definitions and clinical reasoning.",
    columns: [
      {
        key: "referenceId",
        label: "Reference ID",
        modelUse: "Stable identifier used to attach this publication to maneuvers and clinical reasoning statements.",
        width: "180px",
        required: true,
        idPrefix: "REFID-",
      },
      {
        key: "referenceTitle",
        label: "Reference Title",
        modelUse: "The title of the manuscript.",
        width: "300px",
        required: true,
      },
      {
        key: "abbreviatedAuthor",
        label: "Abbreviated Author",
        modelUse: "The first author, followed by et al.",
        width: "200px",
        required: true,
      },
      {
        key: "completeAuthorList",
        label: "Complete Author List",
        modelUse: "All authors.",
        width: "minmax(260px, 0.8fr)",
        multiline: true,
        required: true,
      },
      {
        key: "link",
        label: "Link",
        modelUse: "Web URL of the original journal publication.",
        width: "240px",
        required: true,
        isUrl: true,
      },
      {
        key: "pmidDoi",
        label: "PMID / DOI",
        modelUse: "A publication identifier used to locate, verify, and deduplicate the source.",
        width: "220px",
      },
      {
        key: "notes",
        label: "Notes",
        modelUse: "Explains what the source supports and records any important limitations.",
        width: "minmax(280px, 0.8fr)",
        multiline: true,
      },
    ],
  },
};

export const emptyData = (): Record<SheetId, SpreadsheetRow[]> => ({
  clinicalTerms: [],
  clinicalStates: [],
  diagnoses: [],
  maneuverDefinitions: [],
  maneuverResponseFields: [],
  maneuverResponseOptions: [],
  clinicalReasoning: [],
  references: [],
});

// The knowledge base starts empty — all content is entered through the
// admin site rather than seeded here.
export const initialData: Record<SheetId, SpreadsheetRow[]> = emptyData();

/**
 * Fills in any sheets missing from a stored/loaded workbook (e.g. a
 * revision saved before a sheet like Clinical States existed) with an
 * empty array, so the rest of the app can always assume every SheetId key
 * is present and is an array. Without this, loading an older revision
 * crashes anywhere that does `sheets.someSheet.map(...)`.
 */
export function normalizeWorkbookSheets(
  sheets: Partial<Record<SheetId, SpreadsheetRow[]>> | undefined | null,
): Record<SheetId, SpreadsheetRow[]> {
  const normalized = emptyData();
  const source = sheets ?? {};

  for (const sheetId of Object.keys(normalized) as SheetId[]) {
    const rows = source[sheetId];
    normalized[sheetId] = Array.isArray(rows) ? rows : [];
  }

  return normalized;
}
