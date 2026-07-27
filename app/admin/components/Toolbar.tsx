type ToolbarProps = {
  rowCount: number;
  isDirty: boolean;
  onAddRow: () => void;
  onSave: () => void;
  onDownload: () => void;
};

export default function Toolbar({
  rowCount,
  isDirty,
  onAddRow,
  onSave,
  onDownload,
}: ToolbarProps) {
  return (
    <div className="adminToolbar">
      <div className="adminToolbarActions">
        <button
          className="adminPrimaryButton"
          type="button"
          onClick={onAddRow}
        >
          Add Row
        </button>

        <button type="button" onClick={onSave}>
          Save
        </button>

        <button type="button" onClick={onDownload}>
          Download Workbook
        </button>
      </div>

      <div className="adminSaveState" aria-live="polite">
        <span>
          {rowCount} {rowCount === 1 ? "row" : "rows"}
        </span>
        <span className={isDirty ? "isDirty" : "isSaved"}>
          {isDirty ? "Unsaved changes" : "Saved"}
        </span>
      </div>
    </div>
  );
}
