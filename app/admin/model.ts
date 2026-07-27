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
};

export type SheetDefinition = {
  id: SheetId;
  label: string;
  description: string;
  columns: ColumnDefinition[];
};

export type TopLevelTabId =
  | "clinicalTerms"
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
  { id: "clinicalTerms", label: "Clinical Terms" },
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
      "Defines the questions and data-entry controls displayed on the back of each maneuver tile.",
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
    label: "Clinical Terms",
    description:
      "Shared clinical vocabulary used consistently throughout the application.",
    columns: [
      {
        key: "termId",
        label: "Term ID",
        modelUse:
          "Stable identifier used when another record needs to reference this clinical term.",
        width: "180px",
      },
      {
        key: "name",
        label: "Name",
        modelUse:
          "The preferred human-readable name of the clinical concept.",
        width: "240px",
      },
      {
        key: "definition",
        label: "Definition",
        modelUse:
          "Defines what the term means so it can be interpreted consistently in clinical reasoning and explanations.",
        width: "minmax(380px, 1fr)",
        multiline: true,
      },
      {
        key: "notes",
        label: "Notes",
        modelUse:
          "Optional synonyms, cautions, usage guidance, or editorial context.",
        width: "minmax(300px, 0.8fr)",
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
        modelUse:
          "Stable identifier used by Clinical Reasoning to update this diagnosis.",
        width: "190px",
      },
      {
        key: "name",
        label: "Name",
        modelUse:
          "Full diagnosis name displayed in the differential diagnosis.",
        width: "280px",
      },
      {
        key: "abbreviation",
        label: "Abbreviation",
        modelUse:
          "Compact label displayed where the full diagnosis name would be too long.",
        width: "170px",
      },
      {
        key: "description",
        label: "Description",
        modelUse:
          "Defines the mechanism and important distinguishing characteristics associated with the diagnosis.",
        width: "minmax(400px, 1fr)",
        multiline: true,
      },
      {
        key: "notes",
        label: "Notes",
        modelUse:
          "Optional caveats, variants, terminology guidance, or diagnosis-specific context.",
        width: "minmax(300px, 0.75fr)",
        multiline: true,
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
      },
      {
        key: "name",
        label: "Name",
        modelUse:
          "The maneuver name displayed on the front of its tile.",
        width: "300px",
      },
      {
        key: "category",
        label: "Category",
        modelUse:
          "Groups the maneuver by general type, such as ventricular pacing, atrial pacing, or pharmacologic testing.",
        width: "220px",
      },
      {
        key: "shortDescription",
        label: "Short Description",
        modelUse:
          "A concise explanation suitable for the maneuver tile or summary view.",
        width: "minmax(340px, 0.9fr)",
        multiline: true,
      },
      {
        key: "technique",
        label: "Technique",
        modelUse:
          "Explains how the maneuver is performed and may be shown on the card back or in the expanded detail view.",
        width: "minmax(440px, 1.1fr)",
        multiline: true,
      },
      {
        key: "expansionNotes",
        label: "Expansion Notes",
        modelUse:
          "Provides deeper educational content, interpretation guidance, limitations, and pitfalls for the expanded view.",
        width: "minmax(440px, 1.1fr)",
        multiline: true,
      },
      {
        key: "enabled",
        label: "Enabled",
        modelUse:
          "Controls whether the maneuver is available in the clinical application. Enter Yes or No.",
        width: "130px",
      },
    ],
  },

  maneuverResponseFields: {
    id: "maneuverResponseFields",
    label: "Response Fields",
    description:
      "One row represents one input control on the back of a maneuver tile.",
    columns: [
      {
        key: "maneuverId",
        label: "Maneuver ID",
        modelUse:
          "Identifies which maneuver owns this response field.",
        width: "180px",
      },
      {
        key: "fieldId",
        label: "Field ID",
        modelUse:
          "Stable machine-readable name used to save the response and match it to Clinical Reasoning.",
        width: "240px",
      },
      {
        key: "order",
        label: "Order",
        modelUse:
          "Determines the vertical order in which this field appears on the card back.",
        width: "100px",
      },
      {
        key: "prompt",
        label: "Prompt",
        modelUse:
          "The question or label displayed to the clinician on the back of the maneuver tile.",
        width: "minmax(340px, 0.9fr)",
        multiline: true,
      },
      {
        key: "inputType",
        label: "Input Type",
        modelUse:
          "Determines which GUI control is rendered. Examples: Single Select, Multi Select, Yes/No, Yes/No/Uncertain, Number, Short Text, or Long Text.",
        width: "210px",
      },
      {
        key: "required",
        label: "Required",
        modelUse:
          "Controls whether the maneuver can be accepted without completing this field. Enter Yes or No.",
        width: "130px",
      },
      {
        key: "units",
        label: "Units",
        modelUse:
          "Optional units displayed beside a numeric response, such as ms or mV.",
        width: "110px",
      },
      {
        key: "defaultValue",
        label: "Default",
        modelUse:
          "Optional initial value shown when the card is opened.",
        width: "170px",
      },
      {
        key: "helpText",
        label: "Help Text",
        modelUse:
          "Context shown near the field to explain how the response should be determined or entered.",
        width: "minmax(380px, 1fr)",
        multiline: true,
      },
    ],
  },

  maneuverResponseOptions: {
    id: "maneuverResponseOptions",
    label: "Response Options",
    description:
      "One row represents one selectable answer for a response field.",
    columns: [
      {
        key: "maneuverId",
        label: "Maneuver ID",
        modelUse:
          "Identifies the maneuver that owns this selectable response.",
        width: "180px",
      },
      {
        key: "fieldId",
        label: "Field ID",
        modelUse:
          "Identifies the response field in which this option should appear.",
        width: "240px",
      },
      {
        key: "optionId",
        label: "Option ID",
        modelUse:
          "Stable identifier for this particular answer option.",
        width: "250px",
      },
      {
        key: "order",
        label: "Order",
        modelUse:
          "Determines the order in which this option appears in the control.",
        width: "100px",
      },
      {
        key: "displayLabel",
        label: "Display Label",
        modelUse:
          "The clinician-facing wording shown in the dropdown, button group, or selection list.",
        width: "300px",
      },
      {
        key: "storedValue",
        label: "Stored Value",
        modelUse:
          "Stable machine-readable value saved with the maneuver result and evaluated by Clinical Reasoning.",
        width: "280px",
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
        modelUse:
          "Stable identifier for this individual clinical reasoning statement.",
        width: "190px",
      },
      {
        key: "maneuverId",
        label: "Maneuver ID",
        modelUse:
          "Identifies the maneuver whose result activates this reasoning statement.",
        width: "180px",
      },
      {
        key: "fieldId",
        label: "Field ID",
        modelUse:
          "Identifies the specific maneuver response field being evaluated.",
        width: "240px",
      },
      {
        key: "operator",
        label: "Operator",
        modelUse:
          "Defines how the recorded response is compared with the expected value. Initial examples include Equals, Not Equals, Greater Than, and Less Than.",
        width: "170px",
      },
      {
        key: "expectedValue",
        label: "Expected Value",
        modelUse:
          "The stored response value that must satisfy the operator for this reasoning statement to apply.",
        width: "250px",
      },
      {
        key: "diagnosisId",
        label: "Diagnosis ID",
        modelUse:
          "Identifies the diagnosis affected when this reasoning statement applies.",
        width: "180px",
      },
      {
        key: "effect",
        label: "Effect",
        modelUse:
          "Describes how the finding changes the diagnosis, such as Supports, Against, Excludes, Confirms, or Remains Possible.",
        width: "190px",
      },
      {
        key: "strength",
        label: "Strength",
        modelUse:
          "Describes the relative diagnostic weight or specificity of the finding without hiding the reasoning.",
        width: "180px",
      },
      {
        key: "explanation",
        label: "Explanation",
        modelUse:
          "The clinician-facing explanation of why this response has the stated effect on the diagnosis.",
        width: "minmax(460px, 1.2fr)",
        multiline: true,
      },
      {
        key: "referenceIds",
        label: "Reference IDs",
        modelUse:
          "Comma-separated reference identifiers supporting this clinical reasoning statement.",
        width: "260px",
      },
      {
        key: "enabled",
        label: "Enabled",
        modelUse:
          "Controls whether this reasoning statement is currently used. Enter Yes or No.",
        width: "130px",
      },
    ],
  },

  references: {
    id: "references",
    label: "References",
    description:
      "Publications and other evidence supporting maneuver definitions and clinical reasoning.",
    columns: [
      {
        key: "referenceId",
        label: "Reference ID",
        modelUse:
          "Stable identifier used to attach this publication to maneuvers and clinical reasoning statements.",
        width: "180px",
      },
      {
        key: "citation",
        label: "Citation",
        modelUse:
          "The complete clinician-facing publication citation.",
        width: "minmax(520px, 1.4fr)",
        multiline: true,
      },
      {
        key: "identifier",
        label: "PMID / DOI",
        modelUse:
          "A publication identifier used to locate, verify, and deduplicate the source.",
        width: "260px",
      },
      {
        key: "notes",
        label: "Notes",
        modelUse:
          "Explains what the source supports and records any important limitations.",
        width: "minmax(340px, 0.8fr)",
        multiline: true,
      },
    ],
  },
};

const row = (
  rowId: string,
  values: Record<string, string>,
): SpreadsheetRow => ({
  __rowId: rowId,
  ...values,
});

export const initialData: Record<SheetId, SpreadsheetRow[]> = {
  clinicalTerms: [],

  diagnoses: [
    row("diagnosis-avnrt", {
      diagnosisId: "AVNRT",
      name: "Atrioventricular Nodal Reentrant Tachycardia",
      abbreviation: "AVNRT",
      description:
        "A reentrant supraventricular tachycardia involving functionally distinct pathways within or adjacent to the atrioventricular node.",
      notes: "",
    }),
  ],

  maneuverDefinitions: [
    row("maneuver-vop", {
      maneuverId: "VOP",
      name: "Ventricular Overdrive Pacing",
      category: "Ventricular Pacing",
      shortDescription:
        "Ventricular pacing during tachycardia at a cycle length shorter than the tachycardia cycle length.",
      technique:
        "Pace from the ventricle during tachycardia at a cycle length sufficiently shorter than the tachycardia cycle length to interact with or entrain the tachycardia, then evaluate the response when pacing stops.",
      expansionNotes:
        "Interpretation may include the post-pacing activation sequence, evidence of entrainment, fusion, termination behavior, PPI − TCL, and other timing relationships. Validity and limitations should be considered before diagnostic reasoning is applied.",
      enabled: "Yes",
    }),
  ],

  maneuverResponseFields: [
    row("vop-field-response", {
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      order: "1",
      prompt: "What was the post-pacing response?",
      inputType: "Single Select",
      required: "Yes",
      units: "",
      defaultValue: "",
      helpText:
        "Select the chamber activation sequence observed immediately after ventricular pacing stops.",
    }),
    row("vop-field-entrained", {
      maneuverId: "VOP",
      fieldId: "tachycardia_entrained",
      order: "2",
      prompt: "Was the tachycardia entrained?",
      inputType: "Yes/No/Uncertain",
      required: "Yes",
      units: "",
      defaultValue: "",
      helpText:
        "Record whether pacing demonstrably interacted with and reset the tachycardia.",
    }),
    row("vop-field-fusion", {
      maneuverId: "VOP",
      fieldId: "fusion_present",
      order: "3",
      prompt: "Was fusion present?",
      inputType: "Yes/No/Uncertain",
      required: "No",
      units: "",
      defaultValue: "",
      helpText:
        "Record manifest or concealed fusion when it can be assessed.",
    }),
    row("vop-field-pcl-tcl", {
      maneuverId: "VOP",
      fieldId: "pcl_minus_tcl",
      order: "4",
      prompt: "PCL − TCL",
      inputType: "Number",
      required: "No",
      units: "ms",
      defaultValue: "",
      helpText:
        "Enter the pacing cycle length minus the tachycardia cycle length.",
    }),
    row("vop-field-ppi-tcl", {
      maneuverId: "VOP",
      fieldId: "ppi_minus_tcl",
      order: "5",
      prompt: "PPI − TCL",
      inputType: "Number",
      required: "No",
      units: "ms",
      defaultValue: "",
      helpText:
        "Enter the post-pacing interval minus the tachycardia cycle length.",
    }),
    row("vop-field-validity", {
      maneuverId: "VOP",
      fieldId: "validity",
      order: "6",
      prompt: "Is this maneuver interpretable?",
      inputType: "Single Select",
      required: "Yes",
      units: "",
      defaultValue: "VALID",
      helpText:
        "Choose whether the maneuver can be used for clinical reasoning and document limitations when necessary.",
    }),
    row("vop-field-comments", {
      maneuverId: "VOP",
      fieldId: "comments",
      order: "7",
      prompt: "Comments",
      inputType: "Long Text",
      required: "No",
      units: "",
      defaultValue: "",
      helpText:
        "Optional procedural details, limitations, or interpretation comments.",
    }),
  ],

  maneuverResponseOptions: [
    row("vop-option-vav", {
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      optionId: "post_response_vav",
      order: "1",
      displayLabel: "V-A-V",
      storedValue: "VAV",
    }),
    row("vop-option-vaav", {
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      optionId: "post_response_vaav",
      order: "2",
      displayLabel: "V-A-A-V",
      storedValue: "VAAV",
    }),
    row("vop-option-av-dissociation", {
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      optionId: "post_response_av_dissociation",
      order: "3",
      displayLabel: "AV dissociation",
      storedValue: "AV_DISSOCIATION",
    }),
    row("vop-option-terminated-no-a", {
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      optionId: "post_response_terminated_no_a",
      order: "4",
      displayLabel: "Terminated without atrial activation",
      storedValue: "TERMINATED_NO_A",
    }),
    row("vop-option-other", {
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      optionId: "post_response_other",
      order: "5",
      displayLabel: "Other",
      storedValue: "OTHER",
    }),
    row("vop-option-valid", {
      maneuverId: "VOP",
      fieldId: "validity",
      optionId: "validity_valid",
      order: "1",
      displayLabel: "Valid",
      storedValue: "VALID",
    }),
    row("vop-option-limited", {
      maneuverId: "VOP",
      fieldId: "validity",
      optionId: "validity_limited",
      order: "2",
      displayLabel: "Limited",
      storedValue: "LIMITED",
    }),
    row("vop-option-invalid", {
      maneuverId: "VOP",
      fieldId: "validity",
      optionId: "validity_invalid",
      order: "3",
      displayLabel: "Invalid",
      storedValue: "INVALID",
    }),
  ],

  clinicalReasoning: [
    row("reasoning-vop-vav-avnrt", {
      reasoningId: "VOP_VAV_AVNRT",
      maneuverId: "VOP",
      fieldId: "post_pacing_response",
      operator: "Equals",
      expectedValue: "VAV",
      diagnosisId: "AVNRT",
      effect: "Remains Possible",
      strength: "Non-specific",
      explanation:
        "A V-A-V response after ventricular overdrive pacing is compatible with AVNRT, but the response is not independently diagnostic and must be interpreted with the validity of the maneuver and additional findings.",
      referenceIds: "",
      enabled: "Yes",
    }),
  ],

  references: [],
};

export const emptyData = (): Record<SheetId, SpreadsheetRow[]> => ({
  clinicalTerms: [],
  diagnoses: [],
  maneuverDefinitions: [],
  maneuverResponseFields: [],
  maneuverResponseOptions: [],
  clinicalReasoning: [],
  references: [],
});
