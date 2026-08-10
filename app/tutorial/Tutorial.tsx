"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";

/**
 * One stop on the guided walkthrough. `target` is a CSS selector for the
 * element to spotlight — resolved fresh on every step change (and on
 * resize/scroll) via document.querySelector, not a ref, since the steps
 * span several independent components (page.tsx's own sections plus
 * ManeuverCard instances) and a plain selector is far less invasive than
 * threading refs through all of them. `target: null` steps (the opening
 * and closing stops) render as a centered card with no spotlight cutout.
 *
 * Selectors were chosen to point at genuinely live, functional sections
 * only — see TUTORIAL-WALKTHROUGH-2026-08-08 in PROJECT_DESIGN.md for
 * the two static/placeholder panels ("Evidence and reasoning" and
 * "Maneuver result entry" in app/page.tsx's lowerWorkspace/workspace
 * sections, plus the hardcoded top half of "Case timeline") that were
 * deliberately left out of the tour because they don't actually do
 * anything yet.
 */
export type TutorialStep = {
  title: string;
  body: string;
  target: string | null;
};

export const TUTORIAL_STEPS: TutorialStep[] = [
  {
    title: "Welcome to DiagnosticPacing.org",
    body: "A quick tour of the workspace, one stop per section. Use Next and Back to move through it, or Skip to close it at any point — you can reopen it later from the Walkthrough button.",
    target: null,
  },
  {
    title: "Your case",
    body: "Name the case, then use New case, Open case, and Save case to work with case files on your own device — nothing is ever uploaded anywhere. Report builds a plain-text summary you can copy or print.",
    target: ".topActions",
  },
  {
    title: "Case Structure",
    body: "Every Clinical State you've recorded is listed here — its Rhythm (plus cycle length, for tachycardia) and its ablation-phase / isoproterenol tag. A state whose Phase is Ablation looks different on purpose: a shorter, dark-fuchsia card with no tag pill, headlined by modality (e.g. \"RF Ablation\") and, underneath, its location plus the entered count as \"X3\". Click a card to switch which state you're actively recording into.",
    target: ".clinicalStatesRail",
  },
  {
    title: "Active Clinical State",
    body: "Describes the state you're currently recording into: ablation phase, rhythm, sedation, and medications. Click NEW to branch off a new state — if the current one already has findings recorded, you'll be asked whether to start a new state or just change this one in place.",
    target: ".stateToolbarRow",
  },
  {
    title: "Intervals / Ablation Details",
    body: "Enter observed interval measurements here — which fields appear depends on the active state's Rhythm. Set Phase to Ablation and this area switches to Ablation Details instead, for logging one modality, location, count, and duration for this Clinical State; to log a second ablation session, start a new Clinical State with Phase set to Ablation. Interval values feed straight into the Refractory Periods panel and the differential diagnosis engine.",
    target: ".clinicalMeasurementRow",
  },
  {
    title: "Refractory Periods",
    body: "Not entered directly — these are maneuver results tagged as refractory periods in the knowledge base, collected here automatically and split into Antegrade and Retrograde, across every Clinical State they were recorded under.",
    target: '[aria-label="Refractory Periods"]',
  },
  {
    title: "Pacing Maneuvers",
    body: "Cards are ordered by relevance to the current differential. Click a card to flip it and record a result under the active Clinical State — results from every state a maneuver's been performed under stay visible on the card, with the active one highlighted.",
    target: ".maneuverPanel",
  },
  {
    title: "Differential Diagnosis",
    body: "Updates live as you record intervals and maneuver results — each diagnosis reads Confirmed, Included, or Excluded, based on the knowledge base's clinical reasoning rules. Click “Why?” on any diagnosis to see the findings behind its status.",
    target: ".differentialDiagnosisRail",
  },
  {
    title: "State log",
    body: "A running, timestamped record of every change made to the active Clinical State — context changes, measurements, and maneuver results alike. Useful for retracing exactly what was entered and when.",
    target: ".stateLogPanel",
  },
  {
    title: "That's the tour",
    body: "About has the site's privacy notice, disclaimer, and a link to browse the full knowledge base read-only. Reopen this walkthrough anytime from the Walkthrough button next to it.",
    target: null,
  },
];

const SPOTLIGHT_PADDING = 8;
const CARD_MARGIN = 16;
const CARD_GAP = 14;

function computeCardPosition(
  rect: DOMRect | null,
  cardWidth: number,
  cardHeight: number,
) {
  const vw = window.innerWidth;
  const vh = window.innerHeight;

  if (!rect) {
    return {
      top: Math.max(CARD_MARGIN, (vh - cardHeight) / 2),
      left: Math.max(CARD_MARGIN, (vw - cardWidth) / 2),
    };
  }

  const roomBelow = vh - rect.bottom;
  const roomAbove = rect.top;
  const roomRight = vw - rect.right;
  const roomLeft = rect.left;
  const best = Math.max(roomBelow, roomAbove, roomRight, roomLeft);

  let top: number;
  let left: number;

  if (best === roomBelow) {
    top = rect.bottom + CARD_GAP;
    left = rect.left + rect.width / 2 - cardWidth / 2;
  } else if (best === roomAbove) {
    top = rect.top - CARD_GAP - cardHeight;
    left = rect.left + rect.width / 2 - cardWidth / 2;
  } else if (best === roomRight) {
    top = rect.top + rect.height / 2 - cardHeight / 2;
    left = rect.right + CARD_GAP;
  } else {
    top = rect.top + rect.height / 2 - cardHeight / 2;
    left = rect.left - CARD_GAP - cardWidth;
  }

  top = Math.min(Math.max(top, CARD_MARGIN), vh - cardHeight - CARD_MARGIN);
  left = Math.min(Math.max(left, CARD_MARGIN), vw - cardWidth - CARD_MARGIN);

  return { top, left };
}

/**
 * Full-screen guided walkthrough: dims the whole app behind a click-
 * blocking scrim, cuts a spotlight around one section at a time (via
 * the classic oversized-box-shadow technique — a small box positioned
 * over the target with `box-shadow: 0 0 0 9999px <dim color>`, which
 * paints everywhere except its own rect), and walks through
 * TUTORIAL_STEPS with Back/Next/Skip. Deliberately non-interactive —
 * the underlying page is fully click-blocked while this is open, so
 * it's a narrated tour rather than a "try it live" walkthrough; see
 * TUTORIAL-WALKTHROUGH-2026-08-08 in PROJECT_DESIGN.md for why that
 * was the simpler, safer choice (no risk of a tour step accidentally
 * editing real case data).
 */
export default function Tutorial({ onClose }: { onClose: () => void }) {
  const [stepIndex, setStepIndex] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const [cardPos, setCardPos] = useState<{ top: number; left: number }>({
    top: 0,
    left: 0,
  });
  const cardRef = useRef<HTMLDivElement>(null);

  const step = TUTORIAL_STEPS[stepIndex];
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === TUTORIAL_STEPS.length - 1;

  const goNext = useCallback(() => {
    if (isLast) {
      onClose();
      return;
    }
    setStepIndex((current) => current + 1);
  }, [isLast, onClose]);

  const goBack = useCallback(() => {
    if (isFirst) return;
    setStepIndex((current) => current - 1);
  }, [isFirst]);

  // Scroll the target into view once per step change — a plain-flow
  // section (Refractory Periods, Ablation, the maneuver grid, the state
  // log) can be off-screen; the fixed-position side rails and topbar
  // fields are always in view already, and scrollIntoView is a no-op
  // for them either way.
  useEffect(() => {
    if (!step.target) return;
    const el = document.querySelector<HTMLElement>(step.target);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [stepIndex, step.target]);

  // Live-measure the target's rect: once immediately, then on every
  // resize/scroll so the spotlight tracks a smooth-scrolling page or a
  // resized window instead of freezing at a stale position. Missing
  // target (e.g. the Intervals step while the active Rhythm is AV
  // Pacing, which has no measurement fields at all) degrades to a
  // centered card with no spotlight rather than a broken empty box.
  useEffect(() => {
    function measure() {
      if (!step.target) {
        setRect(null);
        return;
      }
      const el = document.querySelector(step.target);
      setRect(el ? el.getBoundingClientRect() : null);
    }
    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [stepIndex, step.target]);

  // Positions the card after it's rendered at its natural size (so
  // variable-length body text is measured correctly), synchronously
  // before paint to avoid a visible flash at the wrong spot.
  useLayoutEffect(() => {
    const cardEl = cardRef.current;
    if (!cardEl) return;
    const cardRect = cardEl.getBoundingClientRect();
    setCardPos(computeCardPosition(rect, cardRect.width, cardRect.height));
  }, [rect, stepIndex]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      } else if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        goNext();
      } else if (event.key === "ArrowLeft") {
        event.preventDefault();
        goBack();
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [stepIndex, isFirst, isLast, onClose, goNext, goBack]);

  return (
    <div className="tutorialRoot" role="dialog" aria-modal="true" aria-label="Walkthrough">
      <div
        className="tutorialBlocker"
        style={{ background: rect ? "transparent" : "rgba(2, 8, 12, 0.78)" }}
      />

      {rect ? (
        <div
          className="tutorialSpotlight"
          style={{
            top: rect.top - SPOTLIGHT_PADDING,
            left: rect.left - SPOTLIGHT_PADDING,
            width: rect.width + SPOTLIGHT_PADDING * 2,
            height: rect.height + SPOTLIGHT_PADDING * 2,
          }}
        />
      ) : null}

      <div
        className="tutorialCard"
        ref={cardRef}
        style={{ top: cardPos.top, left: cardPos.left }}
      >
        <div className="tutorialCardProgress">
          Step {stepIndex + 1} of {TUTORIAL_STEPS.length}
        </div>
        <h3 className="tutorialCardTitle">{step.title}</h3>
        <p className="tutorialCardBody">{step.body}</p>
        <div className="tutorialCardFooter">
          <button
            className="tutorialSkipButton"
            onClick={onClose}
            type="button"
          >
            Skip
          </button>
          <div className="tutorialCardNav">
            <button
              className="modalSecondaryButton"
              disabled={isFirst}
              onClick={goBack}
              type="button"
            >
              Back
            </button>
            <button className="modalOkButton" onClick={goNext} type="button">
              {isLast ? "Done" : "Next"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
