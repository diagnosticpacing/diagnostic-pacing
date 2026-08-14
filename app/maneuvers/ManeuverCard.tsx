"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import {
  DEFAULT_NUMERIC_OPERATOR,
  numericComponentKey,
  numericFieldOperatorKey,
  type ManeuverCatalogEntry,
  type ManeuverCatalogField,
} from "./knowledge";
import {
  formatClinicalStateTag,
  type ClinicalState,
  type ManeuverPerformance,
} from "../clinical/model";
import ClinicalStateTagText from "../clinical/ClinicalStateTagText";
import { evaluateOperator } from "../shared/operatorEvaluation";

/**
 * How many value boxes a field renders/stores as — driven solely by the
 * field's own Number of Fields column (blank, 1, or unparseable all
 * mean a single box; see toNumberOfFields in ./knowledge). No other
 * signal implies a count anymore: an earlier version forced every
 * Refractory Period-tagged field to a fixed 3 boxes regardless of what
 * Number of Fields actually said, silently overriding the admin's own
 * configuration — removed in
 * MANEUVER-FIELD-COUNT-FROM-COLUMN-ONLY-2026-08-14 in
 * docs/PROJECT_DESIGN.md. See isNumericEntry below for the separate
 * question of whether a field is numeric at all in the first place.
 */
function multiValueCount(field: ManeuverCatalogField): number {
  return field.numberOfFields > 1 ? field.numberOfFields : 1;
}

/**
 * Whether a field is a numeric entry at all — a Refractory Period
 * field (regardless of whatever its own Input Type column happens to
 * say, since a Refractory Period result is inherently numeric), or any
 * field whose Input Type is Number Field. Governs both which control
 * renders (the shared multi-box MultiValueControl vs. FieldControl's
 * other branches) and whether a comparison-operator selector applies —
 * kept separate from multiValueCount above so "is this numeric" and
 * "how many boxes" stay two independent questions, not the same check
 * doing double duty. See MANEUVER-FIELD-COUNT-FROM-COLUMN-ONLY-2026-08-14
 * and MANEUVER-FIELD-OPERATOR-2026-08-14 in docs/PROJECT_DESIGN.md.
 */
function isNumericEntry(field: ManeuverCatalogField): boolean {
  return field.refractoryPeriod !== null || field.inputType.toLowerCase() === "number field";
}

/**
 * The comparison operators selectable for one numeric field: its own
 * Available Terms (admin/model.ts's maneuverResponseFields sheet), with
 * "n/a" filtered out since that's not a real comparison, plus the
 * default "=" always included even if the admin hasn't explicitly
 * listed it — every numeric field can always fall back to a plain
 * equals comparison. See MANEUVER-FIELD-OPERATOR-2026-08-14.
 */
function operatorOptions(field: ManeuverCatalogField): string[] {
  const fromAvailableTerms = field.availableTerms.filter((term) => term !== "n/a");
  return Array.from(new Set([DEFAULT_NUMERIC_OPERATOR, ...fromAvailableTerms]));
}

/**
 * The comparison-operator dropdown that precedes every numeric field's
 * value box(es) — "=" by default, or ">"/"<" (or whatever else the
 * field's Available Terms allow) once the clinician picks one. One
 * selector applies to the whole field regardless of how many value
 * boxes it renders (per its own Number of Fields column, whether it's
 * a Refractory Period field or a plain Number Field response) — they
 * all share a single operator, stored under numericFieldOperatorKey
 * rather than per-box. See MANEUVER-FIELD-OPERATOR-2026-08-14.
 */
function OperatorSelect({
  field,
  value,
  onChange,
}: {
  field: ManeuverCatalogField;
  value: string;
  onChange: (next: string) => void;
}) {
  return (
    <select
      aria-label={`${field.prompt} — comparison`}
      className="maneuverFieldOperatorSelect"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {operatorOptions(field).map((option) => (
        <option key={option} value={option}>
          {option}
        </option>
      ))}
    </select>
  );
}

/** One Clinical State this maneuver has actually been performed under,
 * paired with the recorded values — not just "it happened," the full
 * result, so the Findings list can show every prior value, not only the
 * active state's. */
export type ManeuverPerformedState = {
  clinicalState: ClinicalState;
  performance: ManeuverPerformance;
};

type ManeuverCardProps = {
  entry: ManeuverCatalogEntry;
  /** Every Clinical State this maneuver has a recorded performance under,
   * in the case's chronological order (oldest first) — including the
   * active state, if it's among them. */
  performedStates: ManeuverPerformedState[];
  activeClinicalStateId: string;
  activeClinicalStateSummary: string;
  onSave: (values: Record<string, string>) => void;
  /**
   * Called whenever this card's flip state changes between its front
   * (summary) face and either back face (results or details) — `true`
   * the instant it leaves front, `false` the instant it returns to
   * front. Lets the maneuver grid freeze every card's position while
   * this one (or any other) is flipped away from its summary side,
   * instead of resorting the grid underneath an in-progress edit. See
   * MANEUVER-GRID-FREEZE-WHILE-FLIPPED-2026-08-11 in
   * docs/PROJECT_DESIGN.md.
   */
  onFlipChange?: (isFlipped: boolean) => void;
};

/**
 * Whether a field should currently be shown, per its Display When/Display
 * Field/Display Operator/Display Value configuration (see
 * RESPONSE-FIELD-CONDITIONAL-DISPLAY-2026-08-10 in PROJECT_DESIGN.md).
 * Evaluated against the live in-progress draft, not just the last saved
 * performance, so a follow-up field appears the moment its trigger field
 * is answered — the same "results side edits update live" feel every
 * other field on this card already has, not something that waits for
 * Done. `values` is read generically so this also works against a saved
 * performance's `values` (e.g. for a future "was this ever answered"
 * check) without change.
 */
function fieldIsVisible(
  field: ManeuverCatalogField,
  values: Record<string, string>,
): boolean {
  if (!field.display) return true;
  return evaluateOperator(
    field.display.operator,
    values[field.display.fieldId],
    field.display.value,
  );
}

function summarizePerformance(
  entry: ManeuverCatalogEntry,
  performance: ManeuverPerformance,
): string {
  const parts = entry.fields
    .map((field) => {
      const count = multiValueCount(field);
      const numeric = isNumericEntry(field);
      // A numeric field's selected comparison operator is shown as a
      // prefix on its value (e.g. "AVN ERP: >300") only when it's set to
      // something other than the default "=" — the common case stays
      // exactly as before, uncluttered by a redundant equals sign. See
      // MANEUVER-FIELD-OPERATOR-2026-08-14 in docs/PROJECT_DESIGN.md.
      const operator = numeric
        ? performance.values[numericFieldOperatorKey(field.fieldId)]?.trim()
        : undefined;
      const operatorPrefix = operator && operator !== DEFAULT_NUMERIC_OPERATOR ? operator : "";

      if (numeric && count > 1) {
        const values: string[] = [];
        for (let component = 1; component <= count; component += 1) {
          values.push(
            performance.values[numericComponentKey(field.fieldId, component)]?.trim() ?? "",
          );
        }
        while (values.length > 0 && values[values.length - 1] === "") values.pop();
        return values.length > 0
          ? `${field.prompt}: ${operatorPrefix}${values.join("/")}`
          : null;
      }

      const value = (performance.values[field.fieldId] ?? "").trim();
      return value ? `${field.prompt}: ${operatorPrefix}${value}` : null;
    })
    .filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" · ") : "Recorded with no fields entered.";
}

function FieldControl({
  field,
  value,
  onChange,
  operatorValue,
  onOperatorChange,
}: {
  field: ManeuverCatalogEntry["fields"][number];
  value: string;
  onChange: (next: string) => void;
  /** Only read by the numeric-entry branch below — see
   * MANEUVER-FIELD-OPERATOR-2026-08-14. Always supplied by the one call
   * site (renderFieldControl), which has draftValues on hand regardless
   * of this field's Input Type. */
  operatorValue: string;
  onOperatorChange: (next: string) => void;
}) {
  const inputType = field.inputType.toLowerCase();

  // Checked first, ahead of every inputType-string branch below: a
  // Refractory Period-tagged field is always a numeric entry regardless
  // of whatever its own Input Type column happens to say (the field is
  // only routed here at all — rather than to MultiValueControl — when
  // its box count resolves to 1; see renderFieldControl/isNumericEntry).
  // See MANEUVER-FIELD-COUNT-FROM-COLUMN-ONLY-2026-08-14 and
  // MANEUVER-FIELD-OPERATOR-2026-08-14 in docs/PROJECT_DESIGN.md.
  if (isNumericEntry(field)) {
    return (
      <>
        <OperatorSelect field={field} value={operatorValue} onChange={onOperatorChange} />
        <div className="maneuverFieldUnitInput">
          <input
            aria-label={field.prompt}
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {field.units && field.units !== "n/a" && <span>{field.units}</span>}
        </div>
      </>
    );
  }

  if (inputType === "checkbox") {
    return (
      <label className="maneuverFieldCheckbox">
        <input
          type="checkbox"
          checked={value === "Yes"}
          onChange={(event) => onChange(event.target.checked ? "Yes" : "No")}
        />
        {field.prompt}
      </label>
    );
  }

  // Unlike Checkbox above (which always starts unchecked — indistinguishable
  // from an actual "No" answer), this always starts with neither button
  // pressed: `value` is "" until the field is first touched (draftValues
  // only ever holds what's actually been entered — see openEditor in
  // ManeuverCard below), and clicking the already-selected button again
  // clears it back to "" rather than forcing a choice between only Yes
  // and No.
  if (inputType === "yes/no buttons") {
    return (
      <div className="maneuverFieldYesNo" role="group" aria-label={field.prompt}>
        <button
          aria-pressed={value === "Yes"}
          className={
            value === "Yes"
              ? "maneuverFieldYesNoButton isSelected"
              : "maneuverFieldYesNoButton"
          }
          onClick={() => onChange(value === "Yes" ? "" : "Yes")}
          type="button"
        >
          Yes
        </button>
        <button
          aria-pressed={value === "No"}
          className={
            value === "No"
              ? "maneuverFieldYesNoButton isSelected"
              : "maneuverFieldYesNoButton"
          }
          onClick={() => onChange(value === "No" ? "" : "No")}
          type="button"
        >
          No
        </button>
      </div>
    );
  }

  if (inputType === "single select dropdown") {
    return (
      <select
        aria-label={field.prompt}
        value={value}
        onChange={(event) => onChange(event.target.value)}
      >
        <option value="">Select…</option>
        {field.options.map((option) => (
          <option key={option.optionId} value={option.displayLabel}>
            {option.displayLabel || "—"}
          </option>
        ))}
      </select>
    );
  }

  if (inputType === "multi select dropdown") {
    const selected = new Set(
      value.split(",").map((token) => token.trim()).filter(Boolean),
    );

    const toggle = (label: string) => {
      const next = new Set(selected);
      if (next.has(label)) next.delete(label);
      else next.add(label);
      onChange(Array.from(next).join(", "));
    };

    return (
      <div className="maneuverFieldMultiSelect">
        {field.options.length === 0 && (
          <p className="maneuverFieldEmpty">No options defined yet.</p>
        )}
        {field.options.map((option) => (
          <label key={option.optionId}>
            <input
              type="checkbox"
              checked={selected.has(option.displayLabel)}
              onChange={() => toggle(option.displayLabel)}
            />
            {option.displayLabel}
          </label>
        ))}
      </div>
    );
  }

  return (
    <input
      aria-label={field.prompt}
      value={value}
      onChange={(event) => onChange(event.target.value)}
    />
  );
}

/**
 * Renders a field as a compact row of more than one box instead of a
 * single input — the field is still one Field ID / one row in the
 * knowledge base; only the GUI presentation and the underlying storage
 * keys are split. Shared by two cases: a Refractory Period field
 * (matching how the original ERP card used to present a 600/400/300
 * result; label is the field's own Maneuver Response Prompt, not a
 * composed string — see REFRACTORY-PERIODS-SIMPLIFY-2026-08-06), and a
 * plain Number Field response — either way, `count` (resolved by the
 * caller via multiValueCount above) always comes from the field's own
 * Number of Fields column, with no other rule involved anymore. See
 * MANEUVER-RESPONSE-NUMBER-OF-FIELDS-2026-08-12 and
 * MANEUVER-FIELD-COUNT-FROM-COLUMN-ONLY-2026-08-14 in
 * docs/PROJECT_DESIGN.md. Every box beyond the first is optional, left
 * blank if unused. Also renders one comparison-operator selector for
 * the whole field — shared across however many boxes it has, not one
 * per box — see MANEUVER-FIELD-OPERATOR-2026-08-14.
 */
function MultiValueControl({
  field,
  count,
  values,
  onChange,
}: {
  field: ManeuverCatalogField;
  count: number;
  values: Record<string, string>;
  onChange: (key: string, next: string) => void;
}) {
  const keys = Array.from({ length: count }, (_, index) =>
    numericComponentKey(field.fieldId, index + 1),
  );
  const operatorKey = numericFieldOperatorKey(field.fieldId);

  return (
    <div className="maneuverField maneuverFieldMultiValueGroup">
      <label>{field.prompt}</label>
      <div className="maneuverFieldMultiValueGroupRow">
        <OperatorSelect
          field={field}
          value={values[operatorKey] ?? DEFAULT_NUMERIC_OPERATOR}
          onChange={(next) => onChange(operatorKey, next)}
        />
        {keys.map((key, index) => (
          <div key={key} className="maneuverFieldMultiValueGroupItem">
            {index > 0 && <span aria-hidden="true">/</span>}
            <input
              aria-label={`${field.prompt} — value ${index + 1}`}
              title={field.prompt}
              inputMode="decimal"
              value={values[key] ?? ""}
              onChange={(event) => onChange(key, event.target.value)}
            />
          </div>
        ))}
        {field.units && field.units !== "n/a" && (
          <span className="maneuverFieldMultiValueGroupUnits">{field.units}</span>
        )}
      </div>
    </div>
  );
}

export default function ManeuverCard({
  entry,
  performedStates,
  activeClinicalStateId,
  activeClinicalStateSummary,
  onSave,
  onFlipChange,
}: ManeuverCardProps) {
  // "front" is the card's resting face. "results" and "details" both flip
  // to the same physical back plane (a true third geometric face isn't
  // practical with a CSS rotateY flip) but render entirely different
  // content — functionally a third state, just not a third orientation.
  // See MANEUVER-CARD-REDESIGN-2026-08-05 for the reasoning, and the
  // maneuverDetailsDiagram placeholder below for what's intentionally not
  // built yet.
  const [flipState, setFlipState] = useState<"front" | "results" | "details">(
    "front",
  );
  // Which side "Maneuver details" was opened from, so clicking the
  // details face returns you there instead of always landing on front.
  const [detailsReturnState, setDetailsReturnState] = useState<
    "front" | "results"
  >("front");
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});
  // Tracks (as a JSON snapshot) whatever was last actually committed
  // via onSave, so leaveResults/the autosave effect below can skip
  // calling onSave — and skip logging a case-timeline entry for it —
  // when nothing has actually changed since. Without this, every exit
  // from the results side (including just opening a card to look, not
  // edit, then flipping away) would write a no-op "Maneuver result"
  // entry, and the debounced autosave firing right before a Done click
  // would produce a second, identical one.
  const lastCommittedValuesRef = useRef<string>("{}");

  const activePerformance =
    performedStates.find(
      (performedState) => performedState.clinicalState.id === activeClinicalStateId,
    )?.performance ?? null;

  // Recomputed on every render against the live draft — a field's
  // visibility can change the instant its trigger field's answer
  // changes, so this can't be memoized off anything less than
  // draftValues itself. See fieldIsVisible above.
  const visibleFields = entry.fields.filter((field) =>
    fieldIsVisible(field, draftValues),
  );

  /** The one place `flipState` is actually written — so `onFlipChange`
   * fires on every transition without duplicating that call at each of
   * this function's four call sites below. Reports "flipped" for both
   * back faces (results and details), not just results: the grid
   * position should stay frozen while Maneuver Details is open too,
   * not only while entering results. See
   * MANEUVER-GRID-FREEZE-WHILE-FLIPPED-2026-08-11 in
   * docs/PROJECT_DESIGN.md. */
  function changeFlipState(next: "front" | "results" | "details") {
    setFlipState(next);
    onFlipChange?.(next !== "front");
  }

  function openEditor() {
    const initialValues = activePerformance?.values ?? {};
    setDraftValues(initialValues);
    lastCommittedValuesRef.current = JSON.stringify(initialValues);
    changeFlipState("results");
  }

  function openDetails(from: "front" | "results") {
    setDetailsReturnState(from);
    changeFlipState("details");
  }

  function closeDetails() {
    changeFlipState(detailsReturnState);
  }

  /** Commits whatever's currently in draftValues and returns to the
   * front face — the one path every way of leaving the results side
   * now goes through (the Done button, clicking anywhere on the
   * results background, flipping via keyboard), so there's no longer
   * a distinct "Cancel without saving" affordance. See the debounced
   * autosave effect below for the "left the card open" case this
   * doesn't cover on its own. */
  function leaveResults() {
    const serialized = JSON.stringify(draftValues);
    if (serialized !== lastCommittedValuesRef.current) {
      lastCommittedValuesRef.current = serialized;
      onSave(draftValues);
    }
    changeFlipState("front");
  }

  /**
   * Entries no longer require an explicit Save click to reach the
   * differential engine: if the results side is left open with values
   * typed in but nothing flipped, this commits the current draft
   * automatically a few seconds after the last edit — long enough to
   * not fire mid-keystroke on a partially-typed number, short enough
   * that a card left open doesn't sit on unseen data for long. Resets
   * on every draftValues change (a debounce, not a fixed-interval
   * tick), does nothing once the results side isn't showing, and — via
   * the same lastCommittedValuesRef check as leaveResults — does
   * nothing if the draft already matches what's committed.
   */
  useEffect(() => {
    if (flipState !== "results") return;
    const timeout = setTimeout(() => {
      const serialized = JSON.stringify(draftValues);
      if (serialized === lastCommittedValuesRef.current) return;
      lastCommittedValuesRef.current = serialized;
      onSave(draftValues);
    }, 3000);
    return () => clearTimeout(timeout);
  }, [flipState, draftValues, onSave]);

  /**
   * Lets clicking anywhere on a card face act as a shortcut for its
   * default flip action — front flips to results, results flips back to
   * front, details returns to whichever face it was opened from — without
   * swallowing clicks on the real buttons/inputs/selects/labels those
   * faces already contain. Purely a convenience layered on top of those
   * controls, which stay the only way to do this from a keyboard or
   * screen reader (no role="button"/tabIndex added here on purpose —
   * that would misrepresent a region that itself contains real
   * interactive children).
   */
  function handleFaceClick(
    event: ReactMouseEvent<HTMLElement>,
    action: () => void,
  ) {
    const target = event.target as HTMLElement;
    if (target.closest("button, input, select, textarea, a, label")) return;
    action();
  }

  /** Renders one field's prompt and entry control together — the same
   * isNumericEntry-plus-count branch summarizePerformance uses to read
   * a saved performance back, just building the live editable form
   * instead. Called once per visible field, all of them stacked
   * together in .maneuverFieldList — see
   * MANEUVER-CARD-FIELDS-INLINE-2026-08-11 for why there's no more
   * picker/single-field-editor step in between. */
  function renderFieldControl(field: ManeuverCatalogField) {
    const count = multiValueCount(field);
    if (isNumericEntry(field) && count > 1) {
      return (
        <MultiValueControl
          key={field.fieldId}
          field={field}
          count={count}
          values={draftValues}
          onChange={(key, next) =>
            setDraftValues((current) => ({ ...current, [key]: next }))
          }
        />
      );
    }

    return (
      <div className="maneuverField" key={field.fieldId}>
        {field.inputType.toLowerCase() !== "checkbox" && (
          <label>
            {field.prompt}
            {field.required && <span aria-hidden="true"> *</span>}
          </label>
        )}
        <FieldControl
          field={field}
          value={draftValues[field.fieldId] ?? ""}
          onChange={(next) =>
            setDraftValues((current) => ({
              ...current,
              [field.fieldId]: next,
            }))
          }
          operatorValue={
            draftValues[numericFieldOperatorKey(field.fieldId)] ?? DEFAULT_NUMERIC_OPERATOR
          }
          onOperatorChange={(next) =>
            setDraftValues((current) => ({
              ...current,
              [numericFieldOperatorKey(field.fieldId)]: next,
            }))
          }
        />
        {field.helpText && <p className="maneuverFieldHelp">{field.helpText}</p>}
      </div>
    );
  }

  return (
    <div className={`maneuverCard${flipState !== "front" ? " isFlipped" : ""}`}>
      <div className="maneuverCardFlipper">
        <article
          className="maneuverCardFace maneuverCardFront"
          onClick={(event) => handleFaceClick(event, openEditor)}
        >
          <div className="maneuverCardTop">
            <h3>{entry.definition.maneuverName || "Untitled maneuver"}</h3>
          </div>

          <div className="maneuverCardFindings">
            {performedStates.length === 0 ? (
              <p className="maneuverFindingsEmpty">
                No findings recorded yet — use Enter below.
              </p>
            ) : (
              performedStates.map(({ clinicalState, performance }) => {
                const isActiveState = clinicalState.id === activeClinicalStateId;
                return (
                  <div
                    className={
                      isActiveState
                        ? "maneuverFindingRow isActiveState"
                        : "maneuverFindingRow"
                    }
                    key={clinicalState.id}
                  >
                    <span className="maneuverFindingTag stateTagPill">
                      <ClinicalStateTagText
                        tag={formatClinicalStateTag(clinicalState.context)}
                      />
                    </span>
                    <span className="maneuverFindingText">
                      {summarizePerformance(entry, performance)}
                    </span>
                  </div>
                );
              })
            )}
          </div>

          <div className="maneuverCardBottomActions">
            <button
              className="maneuverCardAction"
              type="button"
              aria-label={activePerformance ? "Edit result" : "Enter result"}
              onClick={openEditor}
            >
              {activePerformance ? "Edit" : "Enter"}
            </button>
            <button
              className="maneuverCardAction maneuverCardActionSecondary"
              type="button"
              aria-label="Maneuver details"
              onClick={() => openDetails("front")}
            >
              Details
            </button>
          </div>
        </article>

        <article
          className="maneuverCardFace maneuverCardBack"
          onClick={(event) =>
            handleFaceClick(
              event,
              flipState === "details" ? closeDetails : leaveResults,
            )
          }
        >
          {flipState === "details" ? (
            <>
              <header className="maneuverCardBackHeader">
                <h3>{entry.definition.maneuverName}</h3>
                <span>Details</span>
              </header>

              <div className="maneuverDetailsBody">
                <div className="maneuverDetailsSection">
                  <h4>Technique</h4>
                  <p>
                    {entry.definition.technique ||
                      "No technique notes recorded yet — add them in the admin knowledge base."}
                  </p>
                </div>

                {/* Placeholder — a per-maneuver diagram is planned but not
                    built yet; this just reserves the spot. */}
                <div className="maneuverDetailsSection maneuverDetailsDiagram">
                  <h4>Diagram</h4>
                  <p>Coming soon</p>
                </div>
              </div>

              <div className="maneuverCardBackActions">
                <button
                  className="secondaryButton maneuverDetailsBackButton"
                  type="button"
                  onClick={closeDetails}
                >
                  Back
                </button>
              </div>
            </>
          ) : (
            <>
              <header className="maneuverCardBackHeader">
                <h3>{entry.definition.maneuverName}</h3>
                <span title={activeClinicalStateSummary}>
                  {activeClinicalStateSummary}
                </span>
              </header>

              {entry.fields.length === 0 ? (
                <p className="maneuverFieldEmpty">
                  No response fields are defined for this maneuver yet — add them
                  in the admin knowledge base.
                </p>
              ) : visibleFields.length === 0 ? (
                <p className="maneuverFieldEmpty">
                  Every response field on this maneuver is conditional, and
                  none of their trigger fields have been answered yet.
                </p>
              ) : (
                // Every visible field's prompt and entry control render
                // together immediately, all at once — no more picking a
                // field first and entering its value on a second screen.
                // See MANEUVER-CARD-FIELDS-INLINE-2026-08-11. Clicks
                // inside the list stop here rather than bubbling to the
                // face's "click anywhere to leave results" handler below
                // (handleFaceClick) — with every field's real inputs
                // exposed at once instead of one picker row at a time,
                // there's now a lot more clickable empty space between
                // fields, and a stray click there shouldn't save-and-exit.
                <div
                  className="maneuverFieldList"
                  onClick={(event) => event.stopPropagation()}
                >
                  {visibleFields.map((field) => renderFieldControl(field))}
                </div>
              )}

              <div className="maneuverCardBackActions">
                <button
                  className="secondaryButton"
                  type="button"
                  aria-label="Maneuver details"
                  onClick={() => openDetails("results")}
                >
                  Details
                </button>
                <div className="maneuverCardBackActionsPrimary">
                  <button
                    className="primaryButton"
                    type="button"
                    aria-label="Done — save and close"
                    onClick={leaveResults}
                  >
                    Done
                  </button>
                </div>
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
