"use client";

import { useState } from "react";
import type { ManeuverCatalogEntry } from "./knowledge";
import type { ManeuverPerformance } from "../clinical/model";

type ManeuverCardProps = {
  entry: ManeuverCatalogEntry;
  performance: ManeuverPerformance | null;
  otherStatesPerformedCount: number;
  isSuggested: boolean;
  activeClinicalStateLabel: string;
  onSave: (values: Record<string, string>) => void;
};

function summarizePerformance(
  entry: ManeuverCatalogEntry,
  performance: ManeuverPerformance,
): string {
  const parts = entry.fields
    .map((field) => {
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

export default function ManeuverCard({
  entry,
  performance,
  otherStatesPerformedCount,
  isSuggested,
  activeClinicalStateLabel,
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
                <span className="maneuverPerformedBadge isPerformed">
                  Performed — {activeClinicalStateLabel}
                </span>
                <p className="maneuverResultSummary">
                  {summarizePerformance(entry, performance)}
                </p>
              </>
            ) : (
              <span className="maneuverPerformedBadge">Not yet performed</span>
            )}

            {otherStatesPerformedCount > 0 && (
              <p className="maneuverOtherStatesNote">
                Also recorded in {otherStatesPerformedCount} other clinical
                state{otherStatesPerformedCount === 1 ? "" : "s"}.
              </p>
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
            <span>{activeClinicalStateLabel}</span>
          </header>

          {entry.fields.length === 0 ? (
            <p className="maneuverFieldEmpty">
              No response fields are defined for this maneuver yet — add them
              in the admin knowledge base.
            </p>
          ) : (
            <div className="maneuverFieldList">
              {entry.fields.map((field) => (
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
              ))}
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
