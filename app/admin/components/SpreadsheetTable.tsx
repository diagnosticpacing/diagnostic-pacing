import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ColumnDefinition,
  SheetDefinition,
  SheetId,
  SpreadsheetRow,
} from "../model";

type SortDirection = "asc" | "desc";
type SortState = { columnKey: string; direction: SortDirection } | null;

/**
 * Numeric-aware, case-insensitive comparison. Blank values always sort to
 * the end regardless of direction, so empty cells don't scatter to the top
 * on a descending sort.
 */
function compareValues(a: string, b: string, direction: SortDirection): number {
  const aTrim = a.trim();
  const bTrim = b.trim();

  if (!aTrim && !bTrim) return 0;
  if (!aTrim) return 1;
  if (!bTrim) return -1;

  const aNum = Number(aTrim);
  const bNum = Number(bTrim);
  const bothNumeric = !Number.isNaN(aNum) && !Number.isNaN(bNum);

  const result = bothNumeric
    ? aNum - bNum
    : aTrim.localeCompare(bTrim, undefined, { sensitivity: "base" });

  return direction === "asc" ? result : -result;
}

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
  // Sorting is a view-only concern, local to whichever sheet is showing.
  // The parent remounts this component (via a `key` on the sheet id) when
  // the active sheet changes, so this state naturally resets on its own
  // rather than needing an effect to clear it.
  const [sortState, setSortState] = useState<SortState>(null);

  useEffect(() => {
    if (!highlightRowId) return;
    const node = rowRefs.current.get(highlightRowId);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightRowId]);

  const sortedRows = useMemo(() => {
    if (!sortState) return rows;
    const { columnKey, direction } = sortState;
    return [...rows].sort((a, b) =>
      compareValues(a[columnKey] ?? "", b[columnKey] ?? "", direction),
    );
  }, [rows, sortState]);

  const handleHeaderClick = (columnKey: string) => {
    setSortState((current) => {
      if (!current || current.columnKey !== columnKey) {
        return { columnKey, direction: "asc" };
      }
      if (current.direction === "asc") {
        return { columnKey, direction: "desc" };
      }
      return null;
    });
  };

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

        {definition.columns.map((column) => {
          const isSorted = sortState?.columnKey === column.key;

          return (
            <button
              className={
                isSorted ? "adminTableHeader isSorted" : "adminTableHeader"
              }
              key={column.key}
              type="button"
              title="Click to sort. Click again to reverse, a third time to clear."
              onClick={() => handleHeaderClick(column.key)}
            >
              <div className="adminColumnGuide">
                <span>How the application uses this</span>
                <p>{column.modelUse}</p>
              </div>

              <span className="adminColumnLabelRow">
                <strong className="adminColumnLabel">
                  {column.label}
                </strong>
                <span className="adminSortIndicator" aria-hidden="true">
                  {isSorted ? (sortState.direction === "asc" ? "↑" : "↓") : "↕"}
                </span>
              </span>
            </button>
          );
        })}

        <div className="adminTableHeader adminDeleteHeader" />

        {sortedRows.map((row, rowIndex) => {
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
