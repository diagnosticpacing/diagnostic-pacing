"use client";

import {
  useEffect,
  useRef,
  useState,
  type MouseEvent as ReactMouseEvent,
} from "react";
import type { ManeuverCatalogEntry, ManeuverCatalogField } from "./knowledge";
import {
  formatClinicalStateTag,
  type ClinicalState,
  type ManeuverPerformance,
} from "../clinical/model";
import ClinicalStateTagText from "../clinical/ClinicalStateTagText";
import {
  REFRACTORY_PERIOD_COMPONENT_COUNT,
  refractoryPeriodComponentKey,
} from "../refractoryPeriods/knowledge";
import { evaluateOperator } from "../shared/operatorEvaluation";

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
      if (field.refractoryPeriod) {
        const values: string[] = [];
        for (
          let component = 1;
          component <= REFRACTORY_PERIOD_COMPONENT_COUNT;
          component += 1
        ) {
          values.push(
            performance.values[refractoryPeriodComponentKey(field.fieldId, component)]?.trim() ?? "",
          );
        }
        while (values.length > 0 && values[values.length - 1] === "") values.pop();
        return values.length > 0 ? `${field.prompt}: ${values.join("/")}` : null;
      }

      const value = (performance.values[field.fieldId] ?? "").trim();
      return value ? `${field.prompt}: ${value}` : null;
    })
    .filter((part): part is string => part !== null);

  return parts.length > 0 ? parts.join(" · ") : "Recorded with no fields entered.";
}

function FieldControl({
  field,
  value,
  onChange,
}: {
  field: ManeuverCatalogEntry["fields"][number];
  value: string;
  onChange: (next: string) => void;
}) {
  const inputType = field.inputType.toLowerCase();

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

  if (inputType === "number field") {
    return (
      <div className="maneuverFieldUnitInput">
        <input
          aria-label={field.prompt}
          inputMode="decimal"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
        {field.units && field.units !== "n/a" && <span>{field.units}</span>}
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
 * Renders one Refractory Period field as a compact row of up to three
 * boxes (matching how the original ERP card presented a 600/400/300
 * result) instead of a single input — the field is still one Field ID
 * / one row in the knowledge base; only the GUI presentation and the
 * underlying storage keys are split. The label is the field's own
 * Maneuver Response Prompt, not a composed string (see
 * REFRACTORY-PERIODS-SIMPLIFY-2026-08-06). The second and third boxes
 * are always optional (a second/third extrastimulus isn't always
 * performed), left blank if unused.
 */
function RefractoryPeriodTripletControl({
  field,
  values,
  onChange,
}: {
  field: ManeuverCatalogField;
  values: Record<string, string>;
  onChange: (key: string, next: string) => void;
}) {
  if (!field.refractoryPeriod) return null;

  const keys = Array.from(
    { length: REFRACTORY_PERIOD_COMPONENT_COUNT },
    (_, index) => refractoryPeriodComponentKey(field.fieldId, index + 1),
  );

  return (
    <div className="maneuverField maneuverFieldRefractoryGroup">
      <label>{field.prompt}</label>
      <div className="maneuverFieldRefractoryGroupRow">
        {keys.map((key, index) => (
          <div key={key} className="maneuverFieldRefractoryGroupItem">
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
          <span className="maneuverFieldRefractoryGroupUnits">{field.units}</span>
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

  function openEditor() {
    const initialValues = activePerformance?.values ?? {};
    setDraftValues(initialValues);
    lastCommittedValuesRef.current = JSON.stringify(initialValues);
    setFlipState("results");
  }

  function openDetails(from: "front" | "results") {
    setDetailsReturnState(from);
    setFlipState("details");
  }

  function closeDetails() {
    setFlipState(detailsReturnState);
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
    setFlipState("front");
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
   * RP-triplet-vs-plain branch summarizePerformance uses to read a
   * saved performance back, just building the live editable form
   * instead. Called once per visible field, all of them stacked
   * together in .maneuverFieldList — see
   * MANEUVER-CARD-FIELDS-INLINE-2026-08-11 for why there's no more
   * picker/single-field-editor step in between. */
  function renderFieldControl(field: ManeuverCatalogField) {
    if (field.refractoryPeriod) {
      return (
        <RefractoryPeriodTripletControl
          key={field.fieldId}
          field={field}
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
