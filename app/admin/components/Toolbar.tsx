type ToolbarProps = {
  rowCount: number;
  isDirty: boolean;
  /** True on the public read-only knowledge base viewer: hides every
   * control that mutates data (Add Row, Save) and drops the
   * dirty/saved indicator, which has no meaning when nothing can be
   * edited. Download stays available either way. */
  readOnly?: boolean;
  onAddRow: () => void;
  onSave: () => void;
  onDownload: () => void;
};

export default function Toolbar({
  rowCount,
  isDirty,
  readOnly = false,
  onAddRow,
  onSave,
  onDownload,
}: ToolbarProps) {
  return (
    <div className="adminToolbar">
      <div className="adminToolbarActions">
        {!readOnly && (
          <button
            className="adminPrimaryButton"
            type="button"
            onClick={onAddRow}
          >
            Add Row
          </button>
        )}

        {!readOnly && (
          <button type="button" onClick={onSave}>
            Save
          </button>
        )}

        <button type="button" onClick={onDownload}>
          Download Workbook
        </button>
      </div>

      <div className="adminSaveState" aria-live="polite">
        <span>
          {rowCount} {rowCount === 1 ? "row" : "rows"}
        </span>
        {readOnly ? (
          <span className="isSaved">Read-only</span>
        ) : (
          <span className={isDirty ? "isDirty" : "isSaved"}>
            {isDirty ? "Unsaved changes" : "Saved"}
          </span>
        )}
      </div>
    </div>
  );
}
