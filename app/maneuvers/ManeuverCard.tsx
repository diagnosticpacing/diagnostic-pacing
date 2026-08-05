"use client";

import { useState } from "react";
import type { ManeuverCatalogEntry, ManeuverCatalogField } from "./knowledge";
import {
  formatClinicalStateTag,
  type ClinicalState,
  type ManeuverPerformance,
} from "../clinical/model";
import {
  composeRefractoryPeriodLabel,
  refractoryPeriodComponentCount,
  refractoryPeriodComponentKey,
} from "../refractoryPeriods/knowledge";

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

function summarizePerformance(
  entry: ManeuverCatalogEntry,
  performance: ManeuverPerformance,
): string {
  const parts = entry.fields
    .map((field) => {
      const tag = field.refractoryPeriod;
      if (tag?.type === "Effective") {
        const label = composeRefractoryPeriodLabel(tag.type, tag.direction, tag.structure);
        const count = refractoryPeriodComponentCount(tag.type);
        const values: string[] = [];
        for (let component = 1; component <= count; component += 1) {
          values.push(
            performance.values[refractoryPeriodComponentKey(field.fieldId, component)]?.trim() ?? "",
          );
        }
        while (values.length > 0 && values[values.length - 1] === "") values.pop();
        return values.length > 0 ? `${label}: ${values.join("/")}` : null;
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
 * Renders one Effective Refractory Period field as a compact row of up to
 * three boxes (matching how the original ERP card presented a
 * 600/400/300 result) instead of a single input — the field is still one
 * Field ID / one row in the knowledge base; only the GUI presentation and
 * the underlying storage keys are split. The third box is always optional
 * (a third extrastimulus isn't always performed), left blank if unused.
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
  const tag = field.refractoryPeriod;
  if (!tag) return null;

  const label = composeRefractoryPeriodLabel(tag.type, tag.direction, tag.structure);
  const count = refractoryPeriodComponentCount(tag.type);
  const keys = Array.from({ length: count }, (_, index) =>
    refractoryPeriodComponentKey(field.fieldId, index + 1),
  );

  return (
    <div className="maneuverField maneuverFieldRefractoryGroup">
      <label>{label}</label>
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
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  const activePerformance =
    performedStates.find(
      (performedState) => performedState.clinicalState.id === activeClinicalStateId,
    )?.performance ?? null;

  function openEditor() {
    setDraftValues(activePerformance?.values ?? {});
    setFlipState("results");
  }

  function handleSave() {
    onSave(draftValues);
    setFlipState("front");
  }

  return (
    <div className={`maneuverCard${flipState !== "front" ? " isFlipped" : ""}`}>
      <div className="maneuverCardFlipper">
        <article className="maneuverCardFace maneuverCardFront">
          <div className="maneuverCardTop">
            <h3>{entry.definition.maneuverName || "Untitled maneuver"}</h3>

            <div
              className="maneuverPerformedHistory"
              aria-label="Performed history"
            >
              {performedStates.length === 0 ? (
                <span className="maneuverPerformedHistoryEmpty">
                  Not yet performed
                </span>
              ) : (
                performedStates.map(({ clinicalState }) => {
                  const isActiveState = clinicalState.id === activeClinicalStateId;
                  const tag = formatClinicalStateTag(clinicalState.context);
                  return (
                    <span
                      className={
                        isActiveState
                          ? "maneuverHistoryTag isActiveState"
                          : "maneuverHistoryTag"
                      }
                      key={clinicalState.id}
                      title={`Recorded — ${tag}`}
                    >
                      {tag}
                    </span>
                  );
                })
              )}
            </div>
          </div>

          <div className="maneuverCardFindings">
            {performedStates.length === 0 ? (
              <p className="maneuverFindingsEmpty">
                No findings recorded yet — use Enter result below.
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
                    <span className="maneuverFindingTag">
                      {formatClinicalStateTag(clinicalState.context)}
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
              onClick={openEditor}
            >
              {activePerformance ? "Edit result" : "Enter result"}
            </button>
            <button
              className="maneuverCardAction maneuverCardActionSecondary"
              type="button"
              onClick={() => setFlipState("details")}
            >
              Maneuver details
            </button>
          </div>
        </article>

        <article className="maneuverCardFace maneuverCardBack">
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
                  className="secondaryButton"
                  type="button"
                  onClick={() => setFlipState("front")}
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
              ) : (
                <div className="maneuverFieldList">
                  {entry.fields.map((field) => {
                    if (field.refractoryPeriod?.type === "Effective") {
                      return (
                        <RefractoryPeriodTripletControl
                          key={field.fieldId}
                          field={field}
                          values={draftValues}
                          onChange={(key, next) =>
                            setDraftValues((current) => ({
                              ...current,
                              [key]: next,
                            }))
                          }
                        />
                      );
                    }

                    return (
                      <div className="maneuverField" key={field.fieldId}>
                        {field.inputType.toLowerCase() !== "checkbox" && (
                          <label>
                            {field.prompt}
                            {field.required && (
                              <span aria-hidden="true"> *</span>
                            )}
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
                        {field.helpText && (
                          <p className="maneuverFieldHelp">{field.helpText}</p>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              <div className="maneuverCardBackActions">
                <button
                  className="secondaryButton"
                  type="button"
                  onClick={() => setFlipState("front")}
                >
                  Cancel
                </button>
                <button
                  className="primaryButton"
                  type="button"
                  onClick={handleSave}
                >
                  Save result
                </button>
              </div>
            </>
          )}
        </article>
      </div>
    </div>
  );
}
