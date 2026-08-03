import { useEffect, useRef } from "react";
import type {
  ColumnDefinition,
  SheetDefinition,
  SheetId,
  SpreadsheetRow,
} from "../model";

type SpreadsheetTableProps = {
  definition: SheetDefinition;
  rows: SpreadsheetRow[];
  allData: Record<SheetId, SpreadsheetRow[]>;
  onAddRow: () => void;
  onCellChange: (
    rowId: string,
    columnKey: string,
    value: string,
  ) => void;
  onDeleteRow: (rowId: string) => void;
  onNavigateToReference: (sheetId: SheetId, rowId: string) => void;
  highlightRowId?: string | null;
};

const norm = (value: string) => value.trim().toUpperCase();

/** Finds the row in another sheet whose lookup column matches this value. */
function resolveReference(
  allData: Record<SheetId, SpreadsheetRow[]>,
  lookup: NonNullable<ColumnDefinition["lookup"]>,
  rawValue: string,
): SpreadsheetRow | null {
  const target = norm(rawValue);
  if (!target) return null;

  const targetRows = allData[lookup.sheet] ?? [];
  return (
    targetRows.find((row) => norm(row[lookup.column] ?? "") === target) ??
    null
  );
}

function ReferenceLink({
  label,
  onClick,
}: {
  label: string;
  onClick: () => void;
}) {
  return (
    <button
      className="adminReferenceLink"
      type="button"
      title={`Jump to "${label}"`}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
    >
      {label}
      <span aria-hidden="true">↗</span>
    </button>
  );
}

export default function SpreadsheetTable({
  definition,
  rows,
  allData,
  onAddRow,
  onCellChange,
  onDeleteRow,
  onNavigateToReference,
  highlightRowId,
}: SpreadsheetTableProps) {
  const rowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  useEffect(() => {
    if (!highlightRowId) return;
    const node = rowRefs.current.get(highlightRowId);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightRowId]);

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

        {rows.map((row, rowIndex) => {
          const isHighlighted = row.__rowId === highlightRowId;

          return (
            <div
              className={
                isHighlighted
                  ? "adminSpreadsheetRow isHighlighted"
                  : "adminSpreadsheetRow"
              }
              key={row.__rowId}
              ref={(node) => {
                if (node) rowRefs.current.set(row.__rowId, node);
                else rowRefs.current.delete(row.__rowId);
              }}
            >
              <div className="adminRowNumber">{rowIndex + 1}</div>

              {definition.columns.map((column) => {
                const value = row[column.key] ?? "";
                const isRequiredEmpty = Boolean(
                  column.required && value.trim() === "",
                );
                const cellClassName = isRequiredEmpty
                  ? "adminCell isRequiredEmpty"
                  : "adminCell";

                const referenceChips =
                  column.lookup && value.trim()
                    ? (column.multiSelect
                        ? value.split(",").map((v) => v.trim()).filter(Boolean)
                        : [value.trim()]
                      )
                        .map((token) => ({
                          token,
                          target: resolveReference(
                            allData,
                            column.lookup!,
                            token,
                          ),
                        }))
                    : null;

                return (
                  <div className={cellClassName} key={column.key}>
                    {column.options && !column.multiSelect ? (
                      <select
                        aria-label={`${column.label}, row ${rowIndex + 1}`}
                        value={value}
                        onChange={(event) =>
                          onCellChange(
                            row.__rowId,
                            column.key,
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          {column.required ? "Select…" : "—"}
                        </option>
                        {column.options.map((option) => (
                          <option key={option || "blank"} value={option}>
                            {option || "—"}
                          </option>
                        ))}
                      </select>
                    ) : column.multiline ? (
                      <textarea
                        aria-label={`${column.label}, row ${rowIndex + 1}`}
                        placeholder={column.modelUse}
                        rows={3}
                        value={value}
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
                        placeholder={
                          column.multiSelect
                            ? `${column.modelUse} (comma-separated)`
                            : column.modelUse
                        }
                        value={value}
                        onChange={(event) =>
                          onCellChange(
                            row.__rowId,
                            column.key,
                            event.target.value,
                          )
                        }
                      />
                    )}

                    {referenceChips && referenceChips.length > 0 && (
                      <div className="adminReferenceChips">
                        {referenceChips.map(({ token, target }) =>
                          target ? (
                            <ReferenceLink
                              key={token}
                              label={token}
                              onClick={() =>
                                onNavigateToReference(
                                  column.lookup!.sheet,
                                  target.__rowId,
                                )
                              }
                            />
                          ) : (
                            <span
                              className="adminReferenceUnmatched"
                              key={token}
                              title="No matching row found yet"
                            >
                              {token}
                            </span>
                          ),
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

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
          );
        })}

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
