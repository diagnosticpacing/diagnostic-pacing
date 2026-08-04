"use client";

import { useState } from "react";
import type { ManeuverCatalogEntry, ManeuverCatalogField } from "./knowledge";
import type { ManeuverPerformance } from "../clinical/model";
import { composeRefractoryPeriodLabel } from "../refractoryPeriods/knowledge";

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
  const parts = buildRenderItems(entry.fields)
    .map((item) => {
      if (item.kind === "field") {
        const value = (performance.values[item.field.fieldId] ?? "").trim();
        return value ? `${item.field.prompt}: ${value}` : null;
      }

      const values = item.fields.map(
        (field) => performance.values[field.fieldId]?.trim() ?? "",
      );
      while (values.length > 0 && values[values.length - 1] === "") values.pop();
      return values.length > 0 ? `${item.label}: ${values.join("/")}` : null;
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

type RenderItem =
  | { kind: "field"; field: ManeuverCatalogField }
  | {
      kind: "refractoryGroup";
      key: string;
      label: string;
      fields: ManeuverCatalogField[];
    };

/**
 * Groups a maneuver's response fields for rendering: fields tagged with
 * the same Refractory Period Type/Direction/Structure collapse into one
 * compact multi-box row (matching how the original ERP card presented a
 * 600/400/300 result), wherever they happen to fall among the maneuver's
 * other, untagged fields. Everything else renders exactly as before, one
 * full field per row. A group appears at the position of its first
 * (lowest-order) component; the rest of that group's fields are absorbed
 * into it rather than rendered again.
 */
function buildRenderItems(fields: ManeuverCatalogField[]): RenderItem[] {
  const items: RenderItem[] = [];
  const groupIndexByKey = new Map<string, number>();

  for (const field of fields) {
    const tag = field.refractoryPeriod;
    if (!tag) {
      items.push({ kind: "field", field });
      continue;
    }

    const key = `${tag.type}|${tag.direction}|${tag.structure}`;
    const existingIndex = groupIndexByKey.get(key);

    if (existingIndex === undefined) {
      groupIndexByKey.set(key, items.length);
      items.push({
        kind: "refractoryGroup",
        key,
        label: composeRefractoryPeriodLabel(tag.type, tag.direction, tag.structure),
        fields: [field],
      });
    } else {
      const item = items[existingIndex];
      if (item.kind === "refractoryGroup") item.fields.push(field);
    }
  }

  for (const item of items) {
    if (item.kind === "refractoryGroup") {
      item.fields.sort(
        (a, b) => (a.refractoryPeriod?.component ?? 0) - (b.refractoryPeriod?.component ?? 0),
      );
    }
  }

  return items;
}

function RefractoryPeriodGroupControl({
  label,
  fields,
  values,
  onChange,
}: {
  label: string;
  fields: ManeuverCatalogField[];
  values: Record<string, string>;
  onChange: (fieldId: string, next: string) => void;
}) {
  const units = fields.find((field) => field.units && field.units !== "n/a")?.units ?? "";

  return (
    <div className="maneuverField maneuverFieldRefractoryGroup">
      <label>{label}</label>
      <div className="maneuverFieldRefractoryGroupRow">
        {fields.map((field, index) => (
          <div key={field.fieldId} className="maneuverFieldRefractoryGroupItem">
            {index > 0 && <span aria-hidden="true">/</span>}
            <input
              aria-label={field.prompt}
              title={field.prompt}
              inputMode="decimal"
              value={values[field.fieldId] ?? ""}
              onChange={(event) => onChange(field.fieldId, event.target.value)}
            />
          </div>
        ))}
        {units && <span className="maneuverFieldRefractoryGroupUnits">{units}</span>}
      </div>
    </div>
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
              {buildRenderItems(entry.fields).map((item) => {
                if (item.kind === "refractoryGroup") {
                  return (
                    <RefractoryPeriodGroupControl
                      key={item.key}
                      label={item.label}
                      fields={item.fields}
                      values={draftValues}
                      onChange={(fieldId, next) =>
                        setDraftValues((current) => ({
                          ...current,
                          [fieldId]: next,
                        }))
                      }
                    />
                  );
                }

                const field = item.field;
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
