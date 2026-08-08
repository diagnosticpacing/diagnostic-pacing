/**
 * Renders an already-formatted Clinical State tag string (e.g.
 * "Pre-ABL · Iso-On", as produced by formatClinicalStateTag /
 * formatRefractoryPeriodStateTag) as two independently-colored spans
 * instead of flat text — each of the four possible values (Pre-ABL,
 * Post-ABL, Iso-On, Iso-Off) gets its own fixed identity color from the
 * style guide, so a glance tells you which one it is without reading
 * the letters. See STATE-TAG-COLOR-2026-08-08 in PROJECT_DESIGN.md for
 * the color choices and why green is deliberately excluded (reserved
 * for the separate active-Clinical-State highlight, so it never means
 * two different things in the same view).
 *
 * Takes the formatted string rather than a ClinicalStateContext
 * directly, and splits on " · ", so every existing call site can adopt
 * it with no data-shape changes — some (RefractoryPeriodFinding.stateTag)
 * only ever had the formatted string in the first place, not the full
 * context it was derived from.
 */
export default function ClinicalStateTagText({ tag }: { tag: string }) {
  const [phase, iso] = tag.split(" · ");

  return (
    <>
      <span className={`stateTagPhase ${phase === "Pre-ABL" ? "isPre" : "isPost"}`}>
        {phase}
      </span>
      <span className="stateTagDivider"> · </span>
      <span className={`stateTagIso ${iso === "Iso-On" ? "isOn" : "isOff"}`}>
        {iso}
      </span>
    </>
  );
}
