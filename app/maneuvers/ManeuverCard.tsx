"use client";

import { useState } from "react";
import type { ManeuverCatalogEntry, ManeuverCatalogField } from "./knowledge";
import { clinicalStateSummary, type ClinicalState, type ManeuverPerformance } from "../clinical/model";
import {
  composeRefractoryPeriodLabel,
  refractoryPeriodComponentCount,
  refractoryPeriodComponentKey,
} from "../refractoryPeriods/knowledge";

type ManeuverCardProps = {
  entry: ManeuverCatalogEntry;
  performance: ManeuverPerformance | null;
  /** The other Clinical States (besides the active one) this maneuver has
   * already been recorded under — rendered as a compact chip per state
   * rather than just a count, so a clinician can see *what* those states
   * were (Phase/Iso/Sedation) without leaving the card. */
  otherStatesPerformed: ClinicalState[];
  isSuggested: boolean;
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
  performance,
  otherStatesPerformed,
  isSuggested,
  activeClinicalStateSummary,
  onSave,
}: ManeuverCardProps) {
  const [flipped, setFlipped] = useState(false);
  const [draftValues, setDraftValues] = useState<Record<string, string>>({});

  function openEditor() {
    setDraftValues(performance?.values ?? {});
    setFlipped(true);
  }

  function handleSave() {
    onSave(draftValues);
    setFlipped(false);
  }

  return (
    <div className={`maneuverCard${flipped ? " isFlipped" : ""}`}>
      <div className="maneuverCardFlipper">
        <article className="maneuverCardFace maneuverCardFront">
          <div className="maneuverCardTop">
            <h3>{entry.definition.maneuverName || "Untitled maneuver"}</h3>
            {isSuggested && (
              <span className="maneuverSuggestedTag">Suggested next</span>
            )}
          </div>

          {entry.definition.technique && (
            <p className="maneuverTechnique">{entry.definition.technique}</p>
          )}

          <div className="maneuverPerformedStatus">
            {performance ? (
              <>
                <span
                  className="maneuverPerformedBadge isPerformed"
                  title={`Performed — ${activeClinicalStateSummary}`}
                >
                  Performed — {activeClinicalStateSummary}
                </span>
                <p className="maneuverResultSummary">
                  {summarizePerformance(entry, performance)}
                </p>
              </>
            ) : (
              <span className="maneuverPerformedBadge">Not yet performed</span>
            )}

            {otherStatesPerformed.length > 0 && (
              <div className="maneuverOtherStates">
                <p className="maneuverOtherStatesNote">
                  Also recorded under:
                </p>
                <div className="maneuverOtherStatesChips">
                  {otherStatesPerformed.map((clinicalState) => {
                    const summary = clinicalStateSummary(clinicalState.context);
                    return (
                      <span
                        className="maneuverOtherStateChip"
                        key={clinicalState.id}
                        title={summary}
                      >
                        {summary}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>

          <button
            className="maneuverCardAction"
            type="button"
            onClick={openEditor}
          >
            {performance ? "Edit result" : "Enter result"}
          </button>
        </article>

        <article className="maneuverCardFace maneuverCardBack">
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
              onClick={() => setFlipped(false)}
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
        </article>
      </div>
    </div>
  );
}
