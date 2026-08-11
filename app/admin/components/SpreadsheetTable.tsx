import { useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent as ReactMouseEvent } from "react";
import type {
  ColumnDefinition,
  SheetDefinition,
  SheetId,
  SpreadsheetRow,
} from "../model";
import { sheetDefinitions } from "../model";
import { validateRow } from "@/knowledge/validation";
import { KNOWLEDGE_SCHEMA_VERSION, type KnowledgeWorkbook } from "@/knowledge/types";

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
  /** True on the public read-only knowledge base viewer. Every cell
   * renders disabled and the lock/delete columns are omitted entirely
   * (there is nothing to protect or remove when nothing is editable).
   * Sorting, column resizing, and cross-sheet reference jump-links stay
   * live, since those are just viewing conveniences. */
  readOnly?: boolean;
  onAddRow: () => void;
  onCellChange: (
    rowId: string,
    columnKey: string,
    value: string,
  ) => void;
  onDeleteRow: (rowId: string) => void;
  onToggleLock: (rowId: string, locked: boolean) => void;
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

  // An `optional` filterBy narrows when its prerequisite is filled in,
  // but falls back to the full unfiltered list rather than blocking
  // entirely when it isn't — e.g. Diagnosis Affected narrows to a
  // maneuver's own relevant diagnoses when a maneuver is considered, but
  // shows every diagnosis when the row considers an interval instead
  // (which has no "relevant diagnoses" list of its own to narrow by).
  const effectiveFilterBy =
    filterBy && !requiredMatch && filterBy.optional ? null : filterBy;

  if (effectiveFilterBy && !requiredMatch) return [];

  let allowedTokens: Set<string> | null = null;
  if (effectiveFilterBy?.viaSheet && effectiveFilterBy.viaListColumn) {
    allowedTokens = new Set<string>();
    for (const viaRow of allData[effectiveFilterBy.viaSheet] ?? []) {
      if (norm(viaRow[effectiveFilterBy.matchColumn] ?? "") !== requiredMatch) continue;
      for (const token of splitList(viaRow[effectiveFilterBy.viaListColumn])) {
        allowedTokens.add(norm(token));
      }
    }
  }

  const values = new Set<string>();
  for (const row of allData[lookup.sheet] ?? []) {
    if (effectiveFilterBy && !allowedTokens) {
      if (norm(row[effectiveFilterBy.matchColumn] ?? "") !== requiredMatch) continue;
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

/** A minimal line-drawn padlock, open or closed, matching the app's plain
 * glyph icon style (×, ↗, ▾) rather than a full-color emoji. */
function LockIcon({ locked }: { locked: boolean }) {
  return (
    <svg
      width="13"
      height="13"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <rect x="4.5" y="11" width="15" height="10" rx="2.2" />
      {locked ? (
        <path d="M8 11V7.5a4 4 0 0 1 8 0V11" />
      ) : (
        <path d="M8 11V7.5a4 4 0 0 1 7.4-2.1" />
      )}
    </svg>
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
  disabled,
}: {
  ariaLabel: string;
  value: string;
  options: string[];
  onChange: (next: string) => void;
  disabled?: boolean;
}) {
  const selected = new Set(
    value.split(",").map((v) => v.trim()).filter(Boolean),
  );

  const toggle = (option: string) => {
    if (disabled) return;
    const next = new Set(selected);
    if (next.has(option)) next.delete(option);
    else next.add(option);
    onChange(Array.from(next).join(", "));
  };

  return (
    <details
      className={`adminMultiSelect${disabled ? " isDisabled" : ""}`}
      {...(disabled ? { onClick: (event) => event.preventDefault() } : {})}
    >
      <summary aria-label={ariaLabel} aria-disabled={disabled}>
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
              disabled={disabled}
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
  readOnly = false,
  onAddRow,
  onCellChange,
  onDeleteRow,
  onToggleLock,
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

  /** Sets this column's value, and — if it auto-populates a sibling
   * column — resolves the matched row and fills that column too, using
   * `populatesColumnFrom` when set or the target sheet's primary ID
   * column by default. */
  const handleLookupChange = (
    rowId: string,
    column: ColumnDefinition,
    newValue: string,
  ) => {
    onCellChange(rowId, column.key, newValue);

    if (column.lookup && column.populatesColumn) {
      const match = resolveReference(allData, column.lookup, newValue);
      const sourceColumn =
        column.populatesColumnFrom ?? getPrimaryIdColumn(column.lookup.sheet);
      const populatedValue =
        match && sourceColumn ? match[sourceColumn] ?? "" : "";
      onCellChange(rowId, column.populatesColumn, populatedValue);
    }
  };

  /**
   * Locking runs the exact same completeness/referential checks save does
   * (see knowledge/validation.ts's validateRow), so a row that locks
   * cleanly is guaranteed not to block a save later. Unlocking never needs
   * validation — it only ever loosens things.
   */
  const handleToggleLock = (row: SpreadsheetRow) => {
    const isLocked = row.__locked === "true";

    if (isLocked) {
      onToggleLock(row.__rowId, false);
      return;
    }

    const workbook: KnowledgeWorkbook = {
      schemaVersion: KNOWLEDGE_SCHEMA_VERSION,
      sheets: allData,
    };
    const issues = validateRow(definition.id, row, workbook);

    if (issues.length > 0) {
      window.alert(
        `This row can't be locked yet — it wouldn't pass save validation:\n\n${issues
          .map((item) => `• ${item.message}`)
          .join("\n")}`,
      );
      return;
    }

    onToggleLock(row.__rowId, true);
  };

  const gridTemplateColumns = [
    ...(readOnly ? [] : ["54px"]),
    ...definition.columns.map(
      (column) => `${columnWidths[column.key] ?? DEFAULT_COLUMN_WIDTH}px`,
    ),
    ...(readOnly ? [] : ["50px"]),
  ].join(" ");

  return (
    <div className="adminTableViewport">
      <div
        className="adminSpreadsheet"
        style={{ gridTemplateColumns }}
      >
        {!readOnly && <div className="adminTableHeader adminLockHeader" />}

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

        {!readOnly && <div className="adminTableHeader adminDeleteHeader" />}

        {sortedRows.map((row, rowIndex) => {
          const isHighlighted = row.__rowId === highlightRowId;
          const isLocked = row.__locked === "true";

          return (
            <div
              className={[
                "adminSpreadsheetRow",
                isHighlighted && "isHighlighted",
                // The violet "protected" hatch is an editorial signal —
                // meaningless (and visually heavy applied to every single
                // row) on the read-only public viewer, so it's suppressed
                // there regardless of the row's actual lock state.
                !readOnly && isLocked && "isLocked",
              ]
                .filter(Boolean)
                .join(" ")}
              key={row.__rowId}
              ref={(node) => {
                if (node) rowRefs.current.set(row.__rowId, node);
                else rowRefs.current.delete(row.__rowId);
              }}
            >
              {!readOnly && (
                <div className="adminLockCell">
                  <button
                    type="button"
                    className={isLocked ? "adminLockButton isLocked" : "adminLockButton"}
                    aria-label={
                      isLocked ? `Unlock row ${rowIndex + 1}` : `Lock row ${rowIndex + 1}`
                    }
                    aria-pressed={isLocked}
                    title={
                      isLocked
                        ? "Unlock to edit this row"
                        : "Lock this row to protect it from accidental edits"
                    }
                    onClick={() => handleToggleLock(row)}
                  >
                    <LockIcon locked={isLocked} />
                  </button>
                </div>
              )}

              {definition.columns.map((column) => {
                const value = row[column.key] ?? "";
                const isRequiredEmpty = Boolean(
                  column.required && value.trim() === "",
                );

                const blockingColumn = column.disabledWhenFilled
                  ?.map((key) => ({
                    key,
                    def: definition.columns.find((c) => c.key === key),
                    value: row[key] ?? "",
                  }))
                  .find((peer) => peer.value.trim() !== "");
                const isDisabledByPeer = Boolean(blockingColumn);
                const isDisabledForEditing =
                  isDisabledByPeer || isLocked || readOnly;

                const cellClassName = [
                  "adminCell",
                  isRequiredEmpty && "isRequiredEmpty",
                  // Reuses the existing lightweight "can't edit this"
                  // treatment for the read-only viewer too, rather than
                  // the heavier isLocked hatch — that one's reserved for
                  // flagging a deliberately protected row mid-edit, not
                  // "this whole page is a viewer."
                  (isDisabledByPeer || readOnly) && "isDisabledByPeer",
                ]
                  .filter(Boolean)
                  .join(" ");

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
                        disabled={isDisabledForEditing}
                        onChange={(next) =>
                          onCellChange(row.__rowId, column.key, next)
                        }
                      />
                    ) : selectOptions ? (
                      <select
                        aria-label={`${column.label}, row ${rowIndex + 1}`}
                        value={value}
                        disabled={isDisabledForEditing}
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
                        disabled={isDisabledForEditing}
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
                        disabled={isDisabledForEditing}
                        onChange={(event) =>
                          onCellChange(
                            row.__rowId,
                            column.key,
                            event.target.value,
                          )
                        }
                      />
                    )}

                    {isDisabledByPeer && blockingColumn && (
                      <p className="adminCellDisabledNote">
                        Clear &ldquo;{blockingColumn.def?.label ?? blockingColumn.key}&rdquo; to use this.
                      </p>
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

              {!readOnly && (
                <div className="adminDeleteCell">
                  <button
                    type="button"
                    aria-label={`Delete row ${rowIndex + 1}`}
                    title={isLocked ? "Unlock this row before deleting it" : "Delete row"}
                    disabled={isLocked}
                    onClick={() => onDeleteRow(row.__rowId)}
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          );
        })}

        {rows.length === 0 && (
          <div
            className="adminEmptySpreadsheetRow"
            style={{
              gridColumn: `1 / span ${
                definition.columns.length + (readOnly ? 0 : 2)
              }`,
            }}
          >
            <div className="adminEmptyIcon">＋</div>

            <div>
              <h3>No rows yet</h3>
              <p>
                {readOnly
                  ? "Nothing has been recorded on this sheet yet."
                  : "The spreadsheet remains visible so you can review the structure and guidance before entering data."}
              </p>
            </div>

            {!readOnly && (
              <button
                className="adminPrimaryButton"
                type="button"
                onClick={onAddRow}
              >
                Add First Row
              </button>
            )}
          </div>
        )}

        {/* Add Row used to live in the toolbar above the sheet, alongside
         * Save/Download — moved down here, at the bottom of the actual
         * row list, per Murph's request. A direct grid child (like the
         * empty-state row above), spanning every column so it reads as
         * "one more row" appended after the real ones rather than a
         * floating control. Only shown once there's already at least one
         * row — the `rows.length === 0` case above already offers this
         * same action as "Add First Row". See
         * ADMIN-ADD-ROW-TO-BOTTOM-2026-08-11 in PROJECT_DESIGN.md. */}
        {!readOnly && rows.length > 0 && (
          <div
            className="adminAddRowFooter"
            style={{ gridColumn: `1 / span ${definition.columns.length + 2}` }}
          >
            <button
              className="adminPrimaryButton"
              type="button"
              onClick={onAddRow}
            >
              Add Row
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
