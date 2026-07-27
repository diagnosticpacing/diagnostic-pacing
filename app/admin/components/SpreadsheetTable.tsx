import type {
  SheetDefinition,
  SpreadsheetRow,
} from "../model";

type SpreadsheetTableProps = {
  definition: SheetDefinition;
  rows: SpreadsheetRow[];
  onAddRow: () => void;
  onCellChange: (
    rowId: string,
    columnKey: string,
    value: string,
  ) => void;
  onDeleteRow: (rowId: string) => void;
};

export default function SpreadsheetTable({
  definition,
  rows,
  onAddRow,
  onCellChange,
  onDeleteRow,
}: SpreadsheetTableProps) {
  const gridTemplateColumns = [
    "48px",
    ...definition.columns.map(
      (column) => column.width ?? "minmax(180px, 1fr)",
    ),
    "50px",
  ].join(" ");

  return (
    <div className="adminTableViewport">
      <div
        className="adminSpreadsheet"
        style={{ gridTemplateColumns }}
      >
        <div className="adminTableHeader adminRowNumberHeader">
          #
        </div>

        {definition.columns.map((column) => (
          <div className="adminTableHeader" key={column.key}>
            <div className="adminColumnGuide">
              <span>How the application uses this</span>
              <p>{column.modelUse}</p>
            </div>

            <strong className="adminColumnLabel">
              {column.label}
            </strong>
          </div>
        ))}

        <div className="adminTableHeader adminDeleteHeader" />

        {rows.map((row, rowIndex) => (
          <div className="adminSpreadsheetRow" key={row.__rowId}>
            <div className="adminRowNumber">{rowIndex + 1}</div>

            {definition.columns.map((column) => (
              <div className="adminCell" key={column.key}>
                {column.multiline ? (
                  <textarea
                    aria-label={`${column.label}, row ${rowIndex + 1}`}
                    placeholder={column.modelUse}
                    rows={3}
                    value={row[column.key] ?? ""}
                    onChange={(event) =>
                      onCellChange(
                        row.__rowId,
                        column.key,
                        event.target.value,
                      )
                    }
                  />
                ) : (
                  <input
                    aria-label={`${column.label}, row ${rowIndex + 1}`}
                    placeholder={column.modelUse}
                    value={row[column.key] ?? ""}
                    onChange={(event) =>
                      onCellChange(
                        row.__rowId,
                        column.key,
                        event.target.value,
                      )
                    }
                  />
                )}
              </div>
            ))}

            <div className="adminDeleteCell">
              <button
                type="button"
                aria-label={`Delete row ${rowIndex + 1}`}
                title="Delete row"
                onClick={() => onDeleteRow(row.__rowId)}
              >
                ×
              </button>
            </div>
          </div>
        ))}

        {rows.length === 0 && (
          <div
            className="adminEmptySpreadsheetRow"
            style={{
              gridColumn: `1 / span ${
                definition.columns.length + 2
              }`,
            }}
          >
            <div className="adminEmptyIcon">＋</div>

            <div>
              <h3>No rows yet</h3>
              <p>
                The spreadsheet remains visible so you can review the
                structure and guidance before entering data.
              </p>
            </div>

            <button
              className="adminPrimaryButton"
              type="button"
              onClick={onAddRow}
            >
              Add First Row
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
