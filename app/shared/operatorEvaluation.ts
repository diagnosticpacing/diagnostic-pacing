/**
 * Compares a recorded response value against a named operator and an
 * expected value. This is the one comparison engine shared by every part
 * of the app that evaluates "does this recorded response satisfy this
 * condition" — originally written for the Clinical Reasoning engine
 * (app/differential/engine.ts) and reused unchanged by conditional
 * Response Field visibility (app/maneuvers/ManeuverCard.tsx) — see
 * RESPONSE-FIELD-CONDITIONAL-DISPLAY-2026-08-10 in
 * docs/PROJECT_DESIGN.md. Living in its own module (rather than staying
 * private to the differential engine) keeps that reuse honest: a
 * response-field visibility check isn't a differential-diagnosis
 * concept, so it shouldn't have to import from `app/differential/` to
 * get it.
 *
 * Numeric-aware: when both sides parse as numbers, the comparison is
 * numeric (so "80" = "80.0"); otherwise "=" / "≠" fall back to a
 * case-insensitive string comparison. An unrecorded (blank) actual
 * value never satisfies any operator — "no data" is treated as
 * "unknown", not as a negative result (so, e.g., a field guarded by
 * "Is Unchecked" stays hidden until its trigger field is explicitly
 * answered "No", not merely left blank).
 *
 * "Yes Selected"/"No Selected" are intentional aliases of "Is
 * Checked"/"Is Unchecked", not a distinct comparison — both Checkbox
 * and Yes/No Buttons fields (app/maneuvers/ManeuverCard.tsx's
 * FieldControl) write the literal recorded response as "Yes" or "No"
 * either way, Yes/No Buttons just starts blank rather than defaulting
 * to "No". Having both spellings lets the admin editor's Operator
 * dropdown read naturally regardless of which of the two field types
 * is being compared, without meaning two different things at
 * evaluation time. See ADMIN-OPERATOR-YES-NO-ALIASES-2026-08-10 in
 * docs/PROJECT_DESIGN.md.
 */
export function evaluateOperator(
  operator: string,
  actualRaw: string | undefined,
  comparedValue: string,
): boolean {
  const actual = (actualRaw ?? "").trim();
  const compared = (comparedValue ?? "").trim();
  if (!actual) return false;

  switch (operator) {
    case "Is Checked":
    case "Yes Selected":
      return actual.toLowerCase() === "yes";
    case "Is Unchecked":
    case "No Selected":
      return actual.toLowerCase() === "no";
    case "=":
    case "≠": {
      const actualNumber = Number.parseFloat(actual);
      const comparedNumber = Number.parseFloat(compared);
      const equal =
        !Number.isNaN(actualNumber) && !Number.isNaN(comparedNumber)
          ? actualNumber === comparedNumber
          : actual.toLowerCase() === compared.toLowerCase();
      return operator === "=" ? equal : !equal;
    }
    case ">":
    case "<": {
      const actualNumber = Number.parseFloat(actual);
      const comparedNumber = Number.parseFloat(compared);
      if (Number.isNaN(actualNumber) || Number.isNaN(comparedNumber)) return false;
      return operator === ">" ? actualNumber > comparedNumber : actualNumber < comparedNumber;
    }
    default:
      return false;
  }
}
