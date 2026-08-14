import type { ClinicalStateSheetId } from "../model";
import { clinicalStateSheets } from "../model";

type ClinicalStateWorkspaceProps = {
  activeSheet: ClinicalStateSheetId;
  onChange: (sheet: ClinicalStateSheetId) => void;
};

/** The Clinical States tab's sub-nav — Phase/Rhythm/Sedation/Medication,
 * one real sheet each. Identical in shape to ManeuverWorkspace, which
 * this was modeled on directly; kept as its own component (rather than
 * generalizing both into one) to match how the two groups' sheet lists
 * (`maneuverSheets`/`clinicalStateSheets`) are already independent,
 * separately-typed exports in admin/model.ts. See
 * CLINICAL-STATES-SUB-SHEETS-2026-08-14 in PROJECT_DESIGN.md. */
export default function ClinicalStateWorkspace({
  activeSheet,
  onChange,
}: ClinicalStateWorkspaceProps) {
  return (
    <div className="adminSubnav">
      {clinicalStateSheets.map((sheet) => (
        <button
          className={activeSheet === sheet.id ? "isActive" : ""}
          key={sheet.id}
          type="button"
          onClick={() => onChange(sheet.id)}
        >
          <strong>{sheet.label}</strong>
          <span>{sheet.description}</span>
        </button>
      ))}
    </div>
  );
}
