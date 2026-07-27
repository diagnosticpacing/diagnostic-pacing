import type { ManeuverSheetId } from "../model";
import { maneuverSheets } from "../model";

type ManeuverWorkspaceProps = {
  activeSheet: ManeuverSheetId;
  onChange: (sheet: ManeuverSheetId) => void;
};

export default function ManeuverWorkspace({
  activeSheet,
  onChange,
}: ManeuverWorkspaceProps) {
  return (
    <div className="adminSubnav">
      {maneuverSheets.map((sheet) => (
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
