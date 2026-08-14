import type { ReferenceSheetId } from "../model";
import { referenceSheets } from "../model";

type ReferenceWorkspaceProps = {
  activeSheet: ReferenceSheetId;
  onChange: (sheet: ReferenceSheetId) => void;
};

/** The References tab's sub-nav — Publications/Citations, one real sheet
 * each. Identical in shape to ManeuverWorkspace/ClinicalStateWorkspace,
 * which this was modeled on directly; kept as its own component (rather
 * than generalizing all three into one) to match how each group's sheet
 * list (`maneuverSheets`/`clinicalStateSheets`/`referenceSheets`) is
 * already an independent, separately-typed export in admin/model.ts. See
 * REFERENCES-CITATIONS-SUB-SHEETS-2026-08-14 in PROJECT_DESIGN.md. */
export default function ReferenceWorkspace({
  activeSheet,
  onChange,
}: ReferenceWorkspaceProps) {
  return (
    <div className="adminSubnav">
      {referenceSheets.map((sheet) => (
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
