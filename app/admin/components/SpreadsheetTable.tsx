import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  ColumnDefinition,
  SheetDefinition,
  SheetId,
  SpreadsheetRow,
} from "../model";
import { sheetDefinitions } from "../model";

type SortDirection = "asc" | "desc";
type SortState = { columnKey: string; direction: SortDirection } | null;

const DEFAULT_COLUMN_WIDTH = 220;
const MIN_COLUMN_WIDTH = 90;

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

/** Extracts a starting pixel width from a column's original CSS width hint. */
function parseDefaultWidth(width?: string): number {
  if (!width) return DEFAULT_COLUMN_WIDTH;
  const pxMatch = width.match(/^(\d+)px$/);
  if (pxMatch) return Number(pxMatch[1]);
  const minmaxMatch = width.match(/minmax\((\d+)px/);
  if (minmaxMatch) return Number(minmaxMatch[1]);
  return DEFAULT_COLUMN_WIDTH;
}

const widthsStorageKey = (sheetId: SheetId) =>
  `diagnostic-pacing-admin-column-widths:${sheetId}`;

function loadStoredWidths(sheetId: SheetId): Record<string, number> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(widthsStorageKey(sheetId));
    return raw ? (JSON.parse(raw) as Record<string, number>) : {};
  } catch {
    return {};
  }
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

const splitList = (value?: string) =>
  (value ?? "")
    .split(",")
    .map((v) => v.trim())
    .filter(Boolean);

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

/** The column a sheet uses as its own primary, prefixed identifier. */
function getPrimaryIdColumn(sheetId: SheetId): string | null {
  return sheetDefinitions[sheetId].columns.find((c) => c.idPrefix)?.key ?? null;
}

/**
 * Live, sorted, de-duplicated option list pulled from another sheet's
 * data. When `filterBy` is set, only target rows whose `matchColumn`
 * equals the current row's own `ownColumn` value are included — this is
 * what makes a dropdown cascade off an earlier pick in the same row (e.g.
 * pick a maneuver, then only see that maneuver's response fields). If the
 * prerequisite column is still blank, there are no options yet.
 *
 * When `filterBy.viaSheet`/`viaListColumn` are set, the allowed values
 * instead come from a comma-separated list column on the matching row in
 * `viaSheet` (e.g. the chosen maneuver's own Relevant Diagnoses list),
 * and the result is still filtered down to `lookup.sheet`'s actual rows
 * so cross-sheet reference chips keep pointing at the right sheet.
 */
function getLookupOptions(
  allData: Record<SheetId, SpreadsheetRow[]>,
  lookup: NonNullable<ColumnDefinition["lookup"]>,
  filterBy: ColumnDefinition["filterBy"],
  currentRow: SpreadsheetRow,
): string[] {
  const requiredMatch = filterBy
    ? norm(currentRow[filterBy.ownColumn] ?? "")
    : null;

  if (filterBy && !requiredMatch) return [];

  let allowedTokens: Set<string> | null = null;
  if (filterBy?.viaSheet && filterBy.viaListColumn) {
    allowedTokens = new Set<string>();
    for (const viaRow of allData[filterBy.viaSheet] ?? []) {
      if (norm(viaRow[filterBy.matchColumn] ?? "") !== requiredMatch) continue;
      for (const token of splitList(viaRow[filterBy.viaListColumn])) {
        allowedTokens.add(norm(token));
      }
    }
  }

  const values = new Set<string>();
  for (const row of allData[lookup.sheet] ?? []) {
    if (filterBy && !allowedTokens) {
      if (norm(row[filterBy.matchColumn] ?? "") !== requiredMatch) continue;
    }
    const value = (row[lookup.column] ?? "").trim();
    if (!value) continue;
    if (allowedTokens && !allowedTokens.has(norm(value))) continue;
    values.add(value);
  }
  return Array.from(values).sort((a, b) =>
    a.localeCompare(b, undefined, { sensitivity: "base" }),
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
      <span className="adminReferenceLinkLabel">{label}</span>
      <span className="adminReferenceLinkIcon" aria-hidden="true">↗</span>
    </button>
  );
}

function MultiSelectCell({
  ariaLabel,
  value,
  options,
  onChange,
}: {
  ariaLabel: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const selected = new Set(
    value.split(",").map((v) => v.trim()).filter(Boolean),
  );

  const toggle = (option: string) => {
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(Array.from(next).join(", "));
  };

  return (
    <details className="adminMultiSelect">
      <summary aria-label={ariaLabel}>
        {selected.size > 0 ? Array.from(selected).join(", ") : "Select…"}
      </summary>
      <div className="adminMultiSelectPanel">
        {options.length === 0 && (
          <p className="adminMultiSelectEmpty">
            No options yet — add rows to the source sheet first.
          </p>
        )}
        {options.map((option) => (
          <label className="adminMultiSelectOption" key={option}>
            <input
              type="checkbox"
              checked={selected.has(option)}
              onChange={() => toggle(option)}
            />
            {option}
          </label>
        ))}
      </div>
    </details>
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
  // Sorting and column widths are view-only, local to whichever sheet is
  // showing. The parent remounts this component (via a `key` on the sheet
  // id) when the active sheet changes, so this state naturally resets on
  // its own rather than needing an effect to clear it.
  const [sortState, setSortState] = useState<SortState>(null);

  const [columnWidths, setColumnWidths] = useState<Record<string, number>>(
    () => {
      const stored = loadStoredWidths(definition.id);
      const widths: Record<string, number> = {};
      for (const column of definition.columns) {
        widths[column.key] = stored[column.key] ?? parseDefaultWidth(column.width);
      }
      return widths;
    },
  );

  const resizingRef = useRef<{
    columnKey: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const resizing = resizingRef.current;
      if (!resizing) return;
      const delta = event.clientX - resizing.startX;
      const nextWidth = Math.max(MIN_COLUMN_WIDTH, resizing.startWidth + delta);
      setColumnWidths((current) => ({
        ...current,
        [resizing.columnKey]: nextWidth,
      }));
    }

    function handleMouseUp() {
      resizingRef.current = null;
    }

    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  useEffect(() => {
    window.localStorage.setItem(
      widthsStorageKey(definition.id),
      JSON.stringify(columnWidths),
    );
  }, [columnWidths, definition.id]);

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

  const handleResizeStart = (
    columnKey: string,
    event: ReactMouseEvent,
  ) => {
    event.stopPropagation();
    event.preventDefault();
    resizingRef.current = {
      columnKey,
      startX: event.clientX,
      startWidth: columnWidths[columnKey] ?? DEFAULT_COLUMN_WIDTH,
    };
  };

  /** Sets this column's value, and — if it auto-populates a sibling ID
   * column — resolves the matched row and fills that column too. */
  const handleLookupChange = (
    rowId: string,
    column: ColumnDefinition,
    newValue: string,
  ) => {
    onCellChange(rowId, column.key, newValue);

    if (column.lookup && column.populatesColumn) {
      const match = resolveReference(allData, column.lookup, newValue);
      const idColumn = getPrimaryIdColumn(column.lookup.sheet);
      const idValue = match && idColumn ? match[idColumn] ?? "" : "";
      onCellChange(rowId, column.populatesColumn, idValue);
    }
  };

  const gridTemplateColumns = [
    "48px",
    ...definition.columns.map(
      (column) => `${columnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH}px`,
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

              <span
                className="adminColumnResizeHandle"
                role="separator"
                aria-orientation="vertical"
                aria-label={`Resize ${column.label} column`}
                onMouseDown={(event) => handleResizeStart(column.key, event)}
                onClick={(event) => event.stopPropagation()}
              />
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

                const selectOptions = column.lookup
                  ? getLookupOptions(allData, column.lookup, column.filterBy, row)
                  : column.options;

                return (
                  <div className={cellClassName} key={column.key}>
                    {selectOptions && column.multiSelect ? (
                      <MultiSelectCell
                        ariaLabel={`${column.label}, row ${rowIndex + 1}`}
                        value={value}
                        options={selectOptions}
                        onChange={(next) =>
                          onCellChange(row.__rowId, column.key, next)
                        }
                      />
                    ) : selectOptions ? (
                      <select
                        aria-label={`${column.label}, row ${rowIndex + 1}`}
                        value={value}
                        onChange={(event) =>
                          handleLookupChange(
                            row.__rowId,
                            column,
                            event.target.value,
                          )
                        }
                      >
                        <option value="">
                          {selectOptions.length === 0 && column.filterBy
                            ? `Pick "${
                                definition.columns.find(
                                  (c) => c.key === column.filterBy!.ownColumn,
                                )?.label ?? "the field above"
                              }" first`
                            : column.required
                              ? "Select…"
                              : "—"}
                        </option>
                        {selectOptions.map((option) => (
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

                    {column.isUrl && value.trim() && (
                      <a
                        className="adminReferenceLink"
                        href={value.trim()}
                        target="_blank"
                        rel="noopener noreferrer"
                        title={`Open ${value.trim()} in a new tab`}
                      >
                        Open
                        <span className="adminReferenceLinkIcon" aria-hidden="true">↗</span>
                      </a>
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
