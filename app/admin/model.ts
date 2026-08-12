export type SpreadsheetRow = {
  __rowId: string;
  /**
   * Internal editing-safety metadata, not domain content: "true" when the
   * row is locked against edits. Not a real column — excluded from the
   * exported workbook and from any validation/reference logic that walks
   * `definition.columns`. Absent or any other value means unlocked; new
   * rows are created without it, so they default to unlocked.
   */
  __locked?: string;
  [key: string]: string | undefined;
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
        modelUse: "Stable ID used to reference this interval elsewhere, e.g. IID-001.",
        width: "170px",
        required: true,
        idPrefix: "IID-",
      },
      {
        key: "name",
        label: "Name",
        modelUse: "The interval's preferred human-readable name.",
        width: "220px",
        required: true,
      },
      {
        key: "definition",
        label: "Definition",
        modelUse: "What the interval means, for consistent use in reasoning and explanations.",
        width: "minmax(360px, 1fr)",
        multiline: true,
        required: true,
      },
      {
        key: "numberOfFields",
        label: "Number of Fields",
        modelUse: "Value format: a single number or two (e.g. 500 vs 500/300).",
        width: "160px",
        required: true,
        options: ["n/a", "1", "2"],
      },
      {
        key: "unitOfMeasure",
        label: "Unit of Measure",
        modelUse: "Unit of measure, if applicable.",
        width: "150px",
        options: ["", "ms", "mV"],
      },
      {
        key: "notes",
        label: "Notes",
        modelUse: "Optional synonyms, cautions, or usage notes.",
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
        modelUse: "Stable ID referenced by Clinical Reasoning and Maneuver Definitions.",
        width: "170px",
        required: true,
        idPrefix: "SID-",
      },
      {
        key: "fullName",
        label: "Full Name",
        modelUse: "Full name shown in reports and explanations.",
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
        modelUse: "Compact label used in place of the full name, and referenced elsewhere.",
        width: "170px",
        required: true,
      },
      {
        key: "notes",
        label: "Notes",
        modelUse: "Optional caveats, variants, or terminology notes.",
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
        modelUse: "Stable ID used by Clinical Reasoning to update this diagnosis.",
        width: "180px",
        required: true,
        idPrefix: "DID-",
      },
      {
        key: "fullName",
        label: "Full Name",
        modelUse: "Full mechanism name shown in reports and explanations.",
        width: "280px",
        required: true,
      },
      {
        key: "abbreviatedName",
        label: "Abbreviated Name",
        modelUse: "Compact label used where the full name would be too long.",
        width: "170px",
        required: true,
      },
      {
        key: "description",
        label: "Description",
        modelUse: "The mechanism and key distinguishing features of the diagnosis.",
        width: "minmax(380px, 1fr)",
        multiline: true,
      },
      {
        key: "notes",
        label: "Notes",
        modelUse: "Optional caveats, variants, or context.",
        width: "minmax(280px, 0.75fr)",
        multiline: true,
      },
      {
        key: "baseRank",
        label: "Base Rank",
        modelUse:
          "Default sort order and tiebreaker by population frequency; lower is more common.",
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
          "Stable ID linking this maneuver to its fields, options, reasoning, references, and saved performances.",
        width: "180px",
        required: true,
        idPrefix: "MID-",
      },
      {
        key: "maneuverName",
        label: "Maneuver Name",
        modelUse: "Name shown on the tile and in reports.",
        width: "280px",
        required: true,
      },
      {
        key: "baseRank",
        label: "Base Rank",
        modelUse: "Default card order before relevance scoring, and the tiebreaker; lower appears first.",
        width: "130px",
        required: true,
      },
      {
        key: "relevantDiagnoses",
        label: "Relevant Diagnoses",
        modelUse: "Diagnoses this maneuver's result can inform; drives suggestions and fallback scoring.",
        width: "minmax(240px, 0.85fr)",
        multiSelect: true,
        lookup: { sheet: "diagnoses", column: "abbreviatedName" },
      },
      {
        key: "requiredStates",
        label: "Required States",
        modelUse: "Clinical states necessary to perform this maneuver.",
        width: "minmax(220px, 0.8fr)",
        multiSelect: true,
        lookup: { sheet: "clinicalStates", column: "abbreviatedName" },
      },
      {
        key: "technique",
        label: "Technique",
        modelUse: "How to perform the maneuver and record the result.",
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
          "Stable ID linking this field to response options, reasoning, references, and saved performances.",
        width: "180px",
        required: true,
        idPrefix: "FID-",
      },
      {
        key: "associatedManeuverName",
        label: "Associated Maneuver",
        modelUse: "Which maneuver owns this field.",
        width: "220px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverName" },
        populatesColumn: "associatedManeuverId",
      },
      {
        key: "associatedManeuverId",
        label: "Associated Maneuver ID",
        modelUse: "Which maneuver owns this field. Auto-filled from Associated Maneuver.",
        width: "200px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverId" },
      },
      {
        key: "order",
        label: "Order",
        modelUse: "Where this field appears among the maneuver's response fields.",
        width: "90px",
        required: true,
        options: ["1", "2", "3", "4", "5", "6", "7", "8"],
      },
      {
        key: "prompt",
        label: "Maneuver Response Prompt",
        modelUse: "The question or label shown to the clinician for this field.",
        width: "minmax(320px, 0.9fr)",
        multiline: true,
        required: true,
      },
      {
        key: "availableTerms",
        label: "Available Terms",
        modelUse: "Comparison operators valid for this field; filters Clinical Reasoning's choices.",
        width: "180px",
        required: true,
        multiSelect: true,
        options: ["n/a", "=", ">", "<"],
      },
      {
        key: "inputType",
        label: "Input Type",
        modelUse:
          "Which entry control renders. Yes/No Buttons starts with neither pressed, so \"unanswered\" stays distinct from an actual \"No\" (unlike Checkbox, which always starts unchecked).",
        width: "210px",
        required: true,
        options: [
          "Checkbox",
          "Single Select Dropdown",
          "Multi Select Dropdown",
          "Number Field",
          "Text Field(s)",
          "Yes/No Buttons",
        ],
      },
      {
        key: "units",
        label: "Units",
        modelUse: "Optional units shown beside a numeric response.",
        width: "110px",
        required: true,
        options: ["n/a", "ms", "mV", "mA"],
      },
      {
        key: "numberOfFields",
        label: "Number of Fields",
        modelUse:
          "How many number boxes render for this response, when Input Type is Number Field (e.g. 2 for a paired value like baseline/post). Blank or 1 means a single box; ignored for every other Input Type. Left optional (not required) so existing rows don't need backfilling.",
        width: "150px",
        options: ["1", "2", "3", "4"],
      },
      {
        key: "refractoryPeriodDirection",
        label: "Refractory Period Direction",
        modelUse:
          "Tags this as a Refractory Period result (n/a otherwise). Sets which row it appears in on the derived display; the field's own Prompt becomes that row's label.",
        width: "220px",
        required: true,
        options: ["n/a", "Antegrade", "Retrograde"],
      },
      {
        key: "required",
        label: "Required",
        modelUse: "Whether the maneuver can be accepted without this field completed.",
        width: "110px",
        required: true,
        options: ["Yes", "No"],
      },
      {
        key: "displayWhen",
        label: "Display When",
        modelUse:
          "Always shown, or only shown once another field on this maneuver has a matching answer. Blank defaults to Always.",
        width: "120px",
        required: true,
        options: ["Always", "If"],
      },
      {
        key: "displayField",
        label: "Display Field",
        modelUse:
          "The field on this maneuver that controls visibility (used only when Display When is \"If\"). Limited to this maneuver's own fields.",
        width: "260px",
        lookup: { sheet: "maneuverResponseFields", column: "prompt" },
        filterBy: { ownColumn: "associatedManeuverId", matchColumn: "associatedManeuverId" },
        populatesColumn: "displayFieldId",
      },
      {
        key: "displayFieldId",
        label: "Display Field ID",
        modelUse: "Field this one's visibility depends on. Auto-filled from Display Field.",
        width: "200px",
        lookup: { sheet: "maneuverResponseFields", column: "fieldId" },
      },
      {
        key: "displayOperator",
        label: "Display Operator",
        modelUse:
          "How Display Field's answer is compared to Display Value. \"Yes/No Selected\" and \"Is Checked/Unchecked\" work the same — pick whichever matches Display Field's Input Type.",
        width: "160px",
        options: [
          "Is Checked",
          "Is Unchecked",
          "Yes Selected",
          "No Selected",
          "=",
          "≠",
          ">",
          "<",
        ],
      },
      {
        key: "displayValue",
        label: "Display Value",
        modelUse: "Value Display Operator compares against, if applicable.",
        width: "180px",
      },
      {
        key: "helpText",
        label: "Help Text",
        modelUse: "Guidance shown near the field on how to answer it.",
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
        modelUse: "Stable ID for this particular answer option.",
        width: "200px",
        required: true,
        idPrefix: "OID-",
      },
      {
        key: "associatedManeuverName",
        label: "Associated Maneuver Name",
        modelUse: "Which maneuver's field owns this option.",
        width: "220px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverName" },
        populatesColumn: "associatedManeuverId",
      },
      {
        key: "associatedManeuverId",
        label: "Associated Maneuver ID",
        modelUse: "Which maneuver's field owns this option. Auto-filled from Associated Maneuver Name.",
        width: "190px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverId" },
      },
      {
        key: "associatedManeuverResponsePrompt",
        label: "Associated Maneuver Response Prompt",
        modelUse: "Which field this option belongs to, limited to the maneuver above.",
        width: "260px",
        lookup: { sheet: "maneuverResponseFields", column: "prompt" },
        filterBy: { ownColumn: "associatedManeuverId", matchColumn: "associatedManeuverId" },
        populatesColumn: "associatedFieldId",
      },
      {
        key: "associatedFieldId",
        label: "Associated Field ID",
        modelUse: "Field this option belongs to. Auto-filled from Associated Maneuver Response Prompt.",
        width: "220px",
        lookup: { sheet: "maneuverResponseFields", column: "fieldId" },
      },
      {
        key: "order",
        label: "Order",
        modelUse: "Order this option appears in the control.",
        width: "90px",
        required: true,
        options: ["1", "2", "3", "4", "5", "6", "7", "8"],
      },
      {
        key: "displayLabel",
        label: "Display Label",
        modelUse: "Wording shown in the dropdown or button group.",
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
        modelUse: "Stable ID for this individual reasoning statement.",
        width: "180px",
        required: true,
        idPrefix: "CRID-",
      },
      {
        key: "maneuverConsidered",
        label: "Maneuver Considered",
        modelUse:
          "Maneuver this rule evaluates (alternative to Interval Considered). Disabled once Interval Considered is set.",
        width: "220px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverName" },
        populatesColumn: "maneuverId",
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "maneuverId",
        label: "Maneuver ID",
        modelUse: "Maneuver whose result activates this rule. Auto-fills from Maneuver Considered.",
        width: "150px",
        lookup: { sheet: "maneuverDefinitions", column: "maneuverId" },
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "responseFieldPrompt",
        label: "Response Field Prompt",
        modelUse: "Which response field is evaluated, limited to the maneuver above.",
        width: "240px",
        lookup: { sheet: "maneuverResponseFields", column: "prompt" },
        filterBy: { ownColumn: "maneuverId", matchColumn: "associatedManeuverId" },
        populatesColumn: "fieldId",
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "fieldId",
        label: "Associated Field ID",
        modelUse: "Field being evaluated. Auto-fills from Response Field Prompt.",
        width: "180px",
        lookup: { sheet: "maneuverResponseFields", column: "fieldId" },
        disabledWhenFilled: ["intervalConsidered", "intervalName"],
      },
      {
        key: "intervalConsidered",
        label: "Interval Considered",
        modelUse:
          "Interval this rule evaluates directly (alternative to Maneuver/Field). Disabled once Maneuver Considered is set.",
        width: "220px",
        lookup: { sheet: "clinicalTerms", column: "name" },
        populatesColumn: "intervalName",
        populatesColumnFrom: "name",
        disabledWhenFilled: ["maneuverConsidered", "maneuverId"],
      },
      {
        key: "intervalName",
        label: "Interval Name",
        modelUse: "Interval being evaluated, by name. Auto-fills from Interval Considered.",
        width: "180px",
        lookup: { sheet: "clinicalTerms", column: "name" },
        disabledWhenFilled: ["maneuverConsidered", "maneuverId"],
      },
      {
        key: "operator",
        label: "Operator",
        modelUse:
          "How the recorded response is compared to the expected value. \"Yes/No Selected\" and \"Is Checked/Unchecked\" work the same — pick whichever matches the field's Input Type.",
        width: "160px",
        required: true,
        options: [
          "Is Checked",
          "Is Unchecked",
          "Yes Selected",
          "No Selected",
          "=",
          "≠",
          ">",
          "<",
        ],
      },
      {
        key: "comparedValue",
        label: "Compared Value",
        modelUse: "Value the operator compares the result to, if applicable.",
        width: "200px",
      },
      {
        key: "differentialAction",
        label: "Differential Action",
        modelUse: "What kind of conclusion this result contributes.",
        width: "170px",
        required: true,
        options: ["Supports", "Excludes", "Confirms"],
      },
      {
        key: "diagnosisAffected",
        label: "Diagnosis Affected",
        modelUse:
          "Diagnosis this rule acts on. Limited to the maneuver's relevant diagnoses when using Maneuver Considered.",
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
        modelUse: "Diagnosis this rule acts on. Auto-fills from Diagnosis Affected.",
        width: "150px",
        lookup: { sheet: "diagnoses", column: "diagnosisId" },
      },
      {
        key: "explanation",
        label: "Explanation",
        modelUse:
          "Clinician-facing explanation of the effect on the diagnosis. Excerpted manuscript text preferred.",
        width: "minmax(380px, 1.1fr)",
        multiline: true,
      },
      {
        key: "referenceTitle",
        label: "Reference Title",
        modelUse: "Reference supporting this explanation.",
        width: "220px",
        lookup: { sheet: "references", column: "referenceTitle" },
        populatesColumn: "referenceId",
      },
      {
        key: "referenceId",
        label: "Reference ID",
        modelUse: "Reference supporting this explanation. Auto-fills from Reference Title.",
        width: "160px",
        lookup: { sheet: "references", column: "referenceId" },
      },
      {
        key: "ruleGroupId",
        label: "Rule Group ID",
        modelUse: "Rows sharing this ID must all be satisfied together (AND). Blank means standalone.",
        width: "180px",
      },
      {
        key: "requiredClinicalState",
        label: "Required Clinical State",
        modelUse:
          "Restricts this rule to the specified Clinical State. Combine with Rule Group ID to require it across multiple states.",
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
        modelUse: "Plain-language description of the rule.",
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
        modelUse: "Stable ID linking this publication to maneuvers and reasoning statements.",
        width: "180px",
        required: true,
        idPrefix: "REFID-",
      },
      {
        key: "referenceTitle",
        label: "Reference Title",
        modelUse: "The manuscript title.",
        width: "300px",
        required: true,
      },
      {
        key: "abbreviatedAuthor",
        label: "Abbreviated Author",
        modelUse: "First author, followed by et al.",
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
        modelUse: "Identifier used to locate, verify, and deduplicate the source.",
        width: "220px",
      },
      {
        key: "notes",
        label: "Notes",
        modelUse: "What the source supports, and any important limitations.",
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

/**
 * Drops any row key that isn't `__rowId`, `__locked`, or one of the current
 * sheet definition's columns — the mirror image of what
 * `normalizeWorkbookSheets` does for missing *sheets*, but for stale
 * *columns*. A row can end up carrying a key like this after a column is
 * removed from `sheetDefinitions` (as happened when the Refractory Period
 * Component # column was dropped) — without this, that leftover key would
 * fail `validateWorkbook`'s "Unexpected column" check on every future save,
 * forever, with no way for an admin to clear it from the spreadsheet UI
 * (there's no cell for a column that no longer exists). Called once, at
 * save time, right after `normalizeWorkbookSheets` — so a schema change
 * heals itself on the next save instead of permanently blocking one.
 * Each drop is logged server-side for auditability, since this is silently
 * discarding data (recoverable from revision history if it ever matters).
 */
export function pruneUnknownColumns(
  sheets: Record<SheetId, SpreadsheetRow[]>,
): Record<SheetId, SpreadsheetRow[]> {
  const pruned = emptyData();

  for (const sheetId of Object.keys(pruned) as SheetId[]) {
    const definition = sheetDefinitions[sheetId];
    const allowed = new Set(["__rowId", "__locked", ...definition.columns.map((c) => c.key)]);

    pruned[sheetId] = (sheets[sheetId] ?? []).map((row) => {
      const cleaned: SpreadsheetRow = { __rowId: row.__rowId };
      for (const key of Object.keys(row)) {
        if (allowed.has(key)) {
          cleaned[key] = row[key];
        } else {
          console.warn(
            `[knowledge] Dropping unexpected column "${key}" from ${sheetId} row ${row.__rowId} (not in current schema).`,
          );
        }
      }
      return cleaned;
    });
  }

  return pruned;
}
