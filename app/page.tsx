"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type {
  ChangeEvent,
  CSSProperties,
  MouseEvent as ReactMouseEvent,
} from "react";
import Link from "next/link";

import {
  abbreviateAblationModality,
  ablationModalityOptions,
  clinicalStateHasFindings,
  clinicalStateSummary,
  createClinicalState,
  createInitialCase,
  findPerformance,
  formatClinicalStateTag,
  resolveWorkspaceConfiguration,
  summarizeAblationSession,
  tachycardiaCycleLengthMs,
  upsertPerformance,
  type AblationModality,
  type AblationSession,
  type ClinicalStateContext,
} from "./clinical/model";
import ClinicalStateTagText from "./clinical/ClinicalStateTagText";
import {
  buildClinicalStateVocabulary,
  buildNewStateContextForRequirements,
  maneuverRequirementsSatisfied,
  resolveDropdownOptions,
} from "./clinical/requiredStates";
import {
  buildManeuverCatalog,
  scoreManeuverRelevance,
  type ManeuverCatalogEntry,
} from "./maneuvers/knowledge";
import ManeuverCard from "./maneuvers/ManeuverCard";
import {
  buildRefractoryPeriodCatalog,
  collectRefractoryPeriodFindings,
} from "./refractoryPeriods/knowledge";
import {
  evaluateDifferential,
  explainDifferentialResult,
  type DifferentialResult,
  type DifferentialStatus,
} from "./differential/engine";
import { generateCaseReport } from "./report/generate";
import {
  exportCaseRecord,
  importCaseRecordFromFile,
  isFileSystemAccessSupported,
  pickCaseFileForAutosave,
  writeCaseRecordToHandle,
} from "./case/persistence";
import type { SheetId, SpreadsheetRow } from "./admin/model";
import Tutorial from "./tutorial/Tutorial";

// Display-only relabeling of the differential engine's internal status
// values — "Possible" reads as "Included" on the cards, since a diagnosis
// in that tier hasn't been ruled out (it's included in the active
// differential), which is clearer to a clinician scanning the list than
// "Possible" sitting next to "Confirmed." The internal DifferentialStatus
// type, sort logic, and CSS class (`status.toLowerCase()`, still
// "possible") are all unchanged — same precedent as the Clinical Terms ->
// Intervals rename (label-only, no underlying key change).
const DIFFERENTIAL_STATUS_LABEL: Record<DifferentialStatus, string> = {
  Confirmed: "Confirmed",
  Possible: "Included",
  Excluded: "Excluded",
};

type RailId = "clinicalStates" | "differentialDiagnosis";

// The six ClinicalStateContext fields that describe what a state *is* —
// changing any of them mid-case can retroactively mislabel whatever's
// already been recorded under the old context, so they're the ones
// gated by the "start a new state?" prompt (CONTEXT-CHANGE-PROMPT-2026-08-08).
// Rhythm is included even though it also switches which measurement
// fields are shown — a stale field's value would otherwise silently
// survive into the new Rhythm's context under the same state.
type GuardedContextField = keyof ClinicalStateContext;

// A context change caught mid-flight by the prompt, holding what's
// needed to either apply it to the current state or spin off a new one.
// `alreadyApplied` distinguishes the two kinds of field this fires for:
// the three <select> fields (Phase/Rhythm/Sedation) are intercepted
// before the value is written anywhere, so `false`; the three free-text
// dose fields (Isoproterenol/Adenosine/Epinephrin) write to context live
// on every keystroke for a responsive typing feel, so by the time the
// prompt can fire (on blur, comparing against the value captured on
// focus) the edit is already sitting in the active state's context —
// `true` — and resolving the prompt has to account for that instead of
// applying it fresh.
type PendingContextChange = {
  key: GuardedContextField;
  label: string;
  previousValue: string;
  nextValue: string;
  alreadyApplied: boolean;
};

// A maneuver blocked by attemptOpenManeuver because the active Clinical
// State doesn't satisfy its Required States — waiting on the "switch to
// an existing matching state, or create a new one?" prompt. See
// attemptOpenManeuver/resolvePendingManeuverRequirement below and
// MANEUVER-REQUIRED-STATE-CHECK-2026-08-14 in PROJECT_DESIGN.md.
type PendingManeuverRequirement = {
  maneuverId: string;
  maneuverName: string;
  requirements: string[];
  /** Other (inactive) Clinical States that already satisfy every
   * requirement, if any — each offered as a one-click "switch to this
   * state" option in the prompt. */
  candidateStateIds: string[];
};

// Tells a specific ManeuverCard to re-open its results side immediately,
// bypassing its onBeforeOpenEditor gate — set right after the user
// resolves a PendingManeuverRequirement (switches to or creates a
// matching state), so the flip the original click asked for actually
// completes instead of leaving the user to click Enter a second time.
// `token` is bumped on every use so setting it to the same maneuverId
// twice in a row still re-fires the card's autoOpen effect.
type AutoOpenManeuver = {
  maneuverId: string;
  token: number;
};

// Nudged up from 190 per Murph's request — a little more prominent on
// first load, still fully adjustable (and still remembered per-rail via
// localStorage) once dragged.
const RAIL_WIDTH_DEFAULT = 225;
const RAIL_WIDTH_MIN = 160;
const RAIL_WIDTH_MAX = 480;

const RAIL_WIDTH_STORAGE_KEY: Record<RailId, string> = {
  clinicalStates: "diagnostic-pacing-rail-width:clinical-states",
  differentialDiagnosis: "diagnostic-pacing-rail-width:differential-diagnosis",
};

function loadStoredRailWidth(rail: RailId): number {
  if (typeof window === "undefined") return RAIL_WIDTH_DEFAULT;
  const raw = window.localStorage.getItem(RAIL_WIDTH_STORAGE_KEY[rail]);
  const parsed = raw ? Number.parseInt(raw, 10) : NaN;
  return Number.isNaN(parsed) ? RAIL_WIDTH_DEFAULT : parsed;
}

/** Keeps a dragged rail width within a sane range, and never lets both
 * rails together crowd out the center workspace on a narrow window. */
function clampRailWidth(width: number): number {
  const viewportCap =
    typeof window === "undefined"
      ? RAIL_WIDTH_MAX
      : Math.max(RAIL_WIDTH_MIN, window.innerWidth * 0.32);

  return Math.min(RAIL_WIDTH_MAX, viewportCap, Math.max(RAIL_WIDTH_MIN, width));
}


/** Display form for a context value inside the change-state prompt —
 * dose fields (Isoproterenol/Adenosine/Epinephrin) are often blank,
 * which would otherwise render as an empty, confusing pair of quote
 * marks in the prompt's sentence. */
function formatContextChangeValue(value: string): string {
  return value.trim() || "(blank)";
}

/**
 * Reorders `catalog` to match `order` (a remembered list of Maneuver
 * IDs) instead of whatever order `catalog` itself is already in — see
 * MANEUVER-GRID-FREEZE-WHILE-FLIPPED-2026-08-11 in
 * docs/PROJECT_DESIGN.md. Any catalog entry not present in `order` —
 * the knowledge base gained a maneuver while a card was flipped, a
 * rare edit-time-only case — is appended at the end in `catalog`'s own
 * (live-sorted) order, rather than silently dropped from the grid.
 */
function reorderManeuverCatalog(
  catalog: ManeuverCatalogEntry[],
  order: string[],
): ManeuverCatalogEntry[] {
  const byId = new Map(
    catalog.map((entry) => [entry.definition.maneuverId, entry] as const),
  );
  const known = new Set(order);
  const ordered = order
    .map((id) => byId.get(id))
    .filter((entry): entry is ManeuverCatalogEntry => entry !== undefined);
  const missing = catalog.filter(
    (entry) => !known.has(entry.definition.maneuverId),
  );
  return [...ordered, ...missing];
}

function Panel({
  eyebrow,
  title,
  children,
  className,
}: {
  eyebrow: string;
  title: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <section className={className ? `panel ${className}` : "panel"}>
      <header className="panelHeader">
        <p>{eyebrow}</p>
        <h2>{title}</h2>
      </header>
      <div className="panelBody">{children}</div>
    </section>
  );
}

export default function Home() {
  // Opens on every load, not just on the About button — it's the site's
  // one link to the read-only Knowledge Base, and there's no other nav
  // pointing there. Still closeable/reopenable via the About button as
  // before.
  const [aboutOpen, setAboutOpen] = useState(true);

  // The About modal has no text inputs to worry about hijacking, so
  // Enter is free to act as a global shortcut for its one deliberate
  // dismiss action (the OK button) while it's open — useful since it
  // auto-opens on every load and blocks the rest of the page.
  useEffect(() => {
    if (!aboutOpen) return;

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Enter") return;
      event.preventDefault();
      setAboutOpen(false);
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [aboutOpen]);

  const [reportOpen, setReportOpen] = useState(false);
  const [reportCopyState, setReportCopyState] = useState<
    "idle" | "copied" | "error"
  >("idle");

  // Manual-open only — unlike aboutOpen, this never auto-opens on load.
  // Opening it closes About/Report so the tutorial's full-screen overlay
  // is never stacked on top of another modal.
  const [tutorialOpen, setTutorialOpen] = useState(false);
  const [caseRecord, setCaseRecord] = useState(createInitialCase);
  const [activeClinicalStateId, setActiveClinicalStateId] = useState(
    "clinical-state-1",
  );
  const [stateChanges, setStateChanges] = useState<string[]>([]);

  // A context change (Phase/Rhythm/Sedation/Isoproterenol/Adenosine/
  // Epinephrin) waiting on the "start a new state?" prompt — see
  // requestContextChange/handleContextFieldBlur/resolvePendingContextChange
  // below and CONTEXT-CHANGE-PROMPT-2026-08-08 in PROJECT_DESIGN.md.
  const [pendingContextChange, setPendingContextChange] =
    useState<PendingContextChange | null>(null);

  // A maneuver card blocked from flipping to results by its Required
  // States, and the auto-reopen token fired once the user resolves it —
  // see attemptOpenManeuver/resolvePendingManeuverRequirement below.
  const [pendingManeuverRequirement, setPendingManeuverRequirement] =
    useState<PendingManeuverRequirement | null>(null);
  const [autoOpenManeuver, setAutoOpenManeuver] =
    useState<AutoOpenManeuver | null>(null);
  const autoOpenManeuverTokenRef = useRef(0);

  // What Isoproterenol/Adenosine/Epinephrin read the moment they were
  // focused, captured so their onBlur handler can tell whether the user
  // actually changed anything (these fields write to context live on
  // every keystroke, so there's no other "before" value left to compare
  // against by the time blur fires).
  const contextFieldBaselineRef = useRef<
    Partial<Record<GuardedContextField, string>>
  >({});

  const [maneuverCatalog, setManeuverCatalog] = useState<
    ManeuverCatalogEntry[]
  >([]);
  const [knowledgeSheets, setKnowledgeSheets] = useState<
    Partial<Record<SheetId, SpreadsheetRow[]>>
  >({});
  const [maneuverCatalogStatus, setManeuverCatalogStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  // Maneuver IDs whose card is currently flipped away from its front
  // (summary) face — populated by each ManeuverCard's onFlipChange
  // callback. Non-empty means the grid order below is frozen rather
  // than resorted live. See
  // MANEUVER-GRID-FREEZE-WHILE-FLIPPED-2026-08-11 in
  // docs/PROJECT_DESIGN.md.
  const [flippedManeuverIds, setFlippedManeuverIds] = useState<Set<string>>(
    () => new Set(),
  );
  // Snapshot of the maneuver order at the instant the *first* card
  // flipped away from front — taken once, in the onFlipChange handler
  // below (an event handler, not render), rather than continuously
  // tracked via a ref read/written during render (React's
  // react-hooks/refs rule disallows that). Stays untouched while more
  // cards flip/unflip; only matters again once flippedManeuverIds is
  // non-empty, so there's nothing to reset when the last card returns
  // to front — the next flip just overwrites it with a fresh snapshot.
  const [frozenManeuverOrder, setFrozenManeuverOrder] = useState<string[]>(
    [],
  );

  useEffect(() => {
    let cancelled = false;

    fetch("/api/knowledge/public")
      .then((response) => {
        if (!response.ok) throw new Error(`Request failed (${response.status})`);
        return response.json();
      })
      .then((data: { sheets: Record<string, unknown> }) => {
        if (cancelled) return;
        const sheets = data.sheets as Partial<Record<SheetId, SpreadsheetRow[]>>;
        setKnowledgeSheets(sheets);
        setManeuverCatalog(
          buildManeuverCatalog(sheets as Parameters<typeof buildManeuverCatalog>[0]),
        );
        setManeuverCatalogStatus("ready");
      })
      .catch(() => {
        if (!cancelled) setManeuverCatalogStatus("error");
      });

    return () => {
      cancelled = true;
    };
  }, []);

  const [clinicalRailWidth, setClinicalRailWidth] = useState<number>(() =>
    loadStoredRailWidth("clinicalStates"),
  );
  const [diagnosisRailWidth, setDiagnosisRailWidth] = useState<number>(() =>
    loadStoredRailWidth("differentialDiagnosis"),
  );
  const [draggingRail, setDraggingRail] = useState<RailId | null>(null);

  const railResizeRef = useRef<{
    rail: RailId;
    startX: number;
    startWidth: number;
  } | null>(null);

  const caseFileInputRef = useRef<HTMLInputElement>(null);

  // Autosave (File System Access API, Chromium-only) — see
  // CASE-AUTOSAVE-2026-08-08 in PROJECT_DESIGN.md. autosaveHandle is the
  // live file handle once the user has picked a file via "Enable
  // autosave"; null means autosave is off (the default, and the only
  // state ever reachable in browsers that don't support the API). A ref
  // mirrors the handle for the debounced-write effect below so that
  // effect doesn't need autosaveHandle in its own dependency array (which
  // would otherwise cancel/reschedule the pending write on every render).
  const [autosaveHandle, setAutosaveHandle] = useState<FileSystemFileHandle | null>(
    null,
  );
  const autosaveHandleRef = useRef<FileSystemFileHandle | null>(null);
  const [autosaveStatus, setAutosaveStatus] = useState<
    "off" | "saving" | "saved" | "error"
  >("off");
  const autosaveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Plain counter, not Date.now() — addClinicalState and
  // appendClinicalStateFrom (the context-change prompt's "start a new
  // state" resolution) both used to read Date.now() directly, which is
  // exactly the impure-during-render pattern react-hooks/purity flags; a
  // plain counter sidesteps it the same way.
  const clinicalStateCounterRef = useRef(caseRecord.clinicalStates.length);

  useEffect(() => {
    function handleMouseMove(event: MouseEvent) {
      const resizing = railResizeRef.current;
      if (!resizing) return;

      const delta = event.clientX - resizing.startX;
      // The differential diagnosis rail is anchored to the right edge of
      // the screen, so dragging left (a negative delta) should widen it.
      const signedDelta =
        resizing.rail === "differentialDiagnosis" ? -delta : delta;
      const nextWidth = clampRailWidth(resizing.startWidth + signedDelta);

      if (resizing.rail === "clinicalStates") setClinicalRailWidth(nextWidth);
      else setDiagnosisRailWidth(nextWidth);
    }

    function handleMouseUp() {
      railResizeRef.current = null;
      setDraggingRail(null);
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
      RAIL_WIDTH_STORAGE_KEY.clinicalStates,
      String(clinicalRailWidth),
    );
  }, [clinicalRailWidth]);

  useEffect(() => {
    window.localStorage.setItem(
      RAIL_WIDTH_STORAGE_KEY.differentialDiagnosis,
      String(diagnosisRailWidth),
    );
  }, [diagnosisRailWidth]);

  useEffect(() => {
    if (reportCopyState === "idle") return;
    const timeout = window.setTimeout(() => setReportCopyState("idle"), 2200);
    return () => window.clearTimeout(timeout);
  }, [reportCopyState]);

  // Debounced autosave write — fires ~1.5s after the last change to
  // caseRecord while autosave is on, coalescing rapid edits (e.g. typing
  // in a text field, one change per keystroke) into a single disk write
  // rather than one per keystroke. Reads autosaveHandleRef (not the
  // autosaveHandle state value) inside the timeout so this effect only
  // needs caseRecord as a dependency — enabling/disabling autosave
  // shouldn't itself reschedule a write that's already pending, and a
  // plain ref read doesn't need to be listed (its identity never
  // changes, only .current does).
  useEffect(() => {
    if (!autosaveHandleRef.current) return;

    if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);

    setAutosaveStatus("saving");
    autosaveTimeoutRef.current = setTimeout(() => {
      const handle = autosaveHandleRef.current;
      if (!handle) return;

      writeCaseRecordToHandle(handle, caseRecord)
        .then(() => setAutosaveStatus("saved"))
        .catch((error) => {
          console.error("Autosave write failed.", error);
          setAutosaveStatus("error");
        });
    }, 1500);

    return () => {
      if (autosaveTimeoutRef.current) clearTimeout(autosaveTimeoutRef.current);
    };
  }, [caseRecord]);

  function startRailResize(rail: RailId, event: ReactMouseEvent) {
    event.preventDefault();
    railResizeRef.current = {
      rail,
      startX: event.clientX,
      startWidth: rail === "clinicalStates" ? clinicalRailWidth : diagnosisRailWidth,
    };
    setDraggingRail(rail);
  }

  const activeClinicalState =
    caseRecord.clinicalStates.find(
      (clinicalState) => clinicalState.id === activeClinicalStateId,
    ) ?? caseRecord.clinicalStates[0];

  // Compact, clinically meaningful stand-in for the old ordinal "Clinical
  // State 1"/"Clinical State 2" label — Phase, isoproterenol status, and
  // sedation level, the three things that actually distinguish one
  // recorded state from another (see clinicalStateSummary in
  // app/clinical/model.ts).
  const activeClinicalStateSummary = clinicalStateSummary(
    activeClinicalState.context,
  );

  // Parsed once per knowledgeSheets fetch/update — the Phase/Rhythm/
  // Sedation/Medication vocabulary (drawn from the four Clinical State
  // sub-sheets, see CLINICAL-STATES-SUB-SHEETS-2026-08-14) that drives
  // the dropdowns below and the maneuver Required States check. See
  // app/clinical/requiredStates.ts and
  // MANEUVER-REQUIRED-STATE-CHECK-2026-08-14 in PROJECT_DESIGN.md.
  const clinicalStateVocabulary = useMemo(
    () => buildClinicalStateVocabulary(knowledgeSheets),
    [knowledgeSheets],
  );

  const differentialResults: DifferentialResult[] = evaluateDifferential(
    caseRecord,
    knowledgeSheets,
  );

  // Diagnoses not yet excluded — the fallback signal maneuver relevance is
  // scored against (see scoreManeuverRelevance in ./maneuvers/knowledge)
  // until Clinical Reasoning rules exist that speak to a given maneuver.
  const activeDiagnosisAbbreviations = new Set(
    differentialResults
      .filter((result) => result.status !== "Excluded")
      .map((result) => result.diagnosis.abbreviatedName.toUpperCase()),
  );

  // Whether any Maneuver Response Field has been recorded anywhere in the
  // case yet (any Clinical State, any performance, any non-blank value) —
  // see MANEUVER-GRID-BASE-RANK-FIX-2026-08-10 in PROJECT_DESIGN.md. Until
  // this is true, relevance scoring stays out of the sort entirely: with
  // nothing recorded yet, every diagnosis reads as "not excluded," so
  // scoreManeuverRelevance isn't actually neutral (0 for everyone) the way
  // the old comment here assumed — it's just "how many Relevant Diagnoses
  // this maneuver happens to have tagged," which varies maneuver to
  // maneuver and was overriding Base Rank from the very first render.
  const caseHasRecordedManeuverResponse = caseRecord.clinicalStates.some(
    (clinicalState) =>
      clinicalState.performances.some((performance) =>
        Object.values(performance.values).some((value) => value.trim() !== ""),
      ),
  );

  // Base Rank only (lowest first) until something's actually been
  // recorded — the grid's real default layout. Once a response field has
  // been filled in anywhere, the relevance-score fallback (highest first,
  // Base Rank tiebreak) takes over, standing in for the fuller
  // Clinical-Reasoning-weighted recommendation engine that isn't built
  // yet — same tiebreak role Base Rank already plays for diagnoses in the
  // differential engine.
  const liveSortedManeuverCatalog = [...maneuverCatalog].sort((a, b) => {
    if (!caseHasRecordedManeuverResponse) {
      return a.definition.baseRank - b.definition.baseRank;
    }
    const relevanceDelta =
      scoreManeuverRelevance(b.definition, activeDiagnosisAbbreviations) -
      scoreManeuverRelevance(a.definition, activeDiagnosisAbbreviations);
    if (relevanceDelta !== 0) return relevanceDelta;
    return a.definition.baseRank - b.definition.baseRank;
  });

  /**
   * A maneuver tile should never move on the grid while it — or any
   * other tile — is flipped away from its front (summary) face: the
   * live sort above is recomputed from differential results that can
   * genuinely change mid-edit (e.g. a value that excludes a diagnosis
   * shifts every other maneuver's relevance score too, not just the
   * one being edited), and reshuffling the grid underneath an
   * in-progress edit is disorienting. `frozenManeuverOrder` remembers
   * the order that was live the instant the first card flipped away
   * from front (snapshotted from the `onFlipChange` handler below,
   * not during render — see that handler for why); `sortedManeuverCatalog`
   * keeps reusing that remembered order for as long as
   * `flippedManeuverIds` is non-empty, and only lets the live sort back
   * through once every card has returned to its summary side. See
   * MANEUVER-GRID-FREEZE-WHILE-FLIPPED-2026-08-11 in
   * docs/PROJECT_DESIGN.md.
   */
  const sortedManeuverCatalog =
    flippedManeuverIds.size > 0 && frozenManeuverOrder.length > 0
      ? reorderManeuverCatalog(liveSortedManeuverCatalog, frozenManeuverOrder)
      : liveSortedManeuverCatalog;

  // Refractory periods are results recorded on the back of whichever
  // maneuver produces them (tagged via Refractory Period Direction on
  // Maneuver Response Fields — one field is the whole result), not
  // direct entry — see app/refractoryPeriods/knowledge.ts.
  // The panel this feeds is permanently affixed rather than scoped to the
  // active Clinical State, so every recorded finding across every state is
  // shown (not just whichever is currently active), grouped into exactly
  // two rows by Direction. "n/a" direction is schema-legal (Atrial/
  // Ventricular structures) but not used in practice — every refractory
  // period is clinically antegrade or retrograde — so it's intentionally
  // not given a row here.
  const refractoryPeriodCatalog = buildRefractoryPeriodCatalog(maneuverCatalog);

  const buildRefractoryPeriodRow = (direction: "Antegrade" | "Retrograde") =>
    refractoryPeriodCatalog
      .filter((definition) => definition.direction === direction)
      .flatMap((definition) =>
        collectRefractoryPeriodFindings(definition, caseRecord.clinicalStates).map(
          (finding) => ({ definition, finding }),
        ),
      );

  const antegradeRefractoryPeriods = buildRefractoryPeriodRow("Antegrade");
  const retrogradeRefractoryPeriods = buildRefractoryPeriodRow("Retrograde");

  // Ablation — strictly for the case report (see PROJECT_DESIGN.md,
  // ABLATION-SECTION-2026-08-05, ABLATION-PER-CLINICAL-STATE-2026-08-09).
  // One ablation entry per Clinical State, always the active one's own
  // (activeClinicalState.ablation) — no separate session list/index to
  // resolve anymore. A second ablation session means a second Clinical
  // State with Phase set to Ablation.
  function updateAblation<K extends keyof AblationSession>(
    key: K,
    value: AblationSession[K],
  ) {
    updateActiveClinicalState((current) => ({
      ...current,
      ablation: { ...current.ablation, [key]: value },
    }));
  }

  function selectAblationModality(modality: AblationModality) {
    const nextModality =
      activeClinicalState.ablation.modality === modality ? "" : modality;
    updateAblation("modality", nextModality);
    logStateChange("Ablation modality", nextModality || "none");
  }

  // Plain-text, print/copy-friendly case report — see app/report/generate.ts
  // for the section-by-section structure. Recomputed on every render from
  // whatever's currently in caseRecord; cheap enough (a handful of Clinical
  // States and a small maneuver catalog) not to need memoizing.
  const reportText = generateCaseReport(caseRecord, maneuverCatalog);

  async function copyReportText() {
    try {
      await navigator.clipboard.writeText(reportText);
      setReportCopyState("copied");
    } catch (error) {
      console.error("Could not copy the report to the clipboard.", error);
      setReportCopyState("error");
    }
  }

  // Save/Open work entirely client-side (JSON file download/upload) — see
  // app/case/persistence.ts. Nothing is transmitted, consistent with the
  // footer's "No patient data is being transmitted" note.
  function saveCaseToFile() {
    exportCaseRecord(caseRecord);
  }

  // Autosave — see CASE-AUTOSAVE-2026-08-08 in PROJECT_DESIGN.md. Enabling
  // it opens the native "save file" picker once (and writes the current
  // case immediately, so the picked file is never left empty); every
  // later change to caseRecord — any field, anywhere — is silently
  // rewritten to that same file via the debounced effect below, no
  // further dialogs. Chromium-only — isFileSystemAccessSupported() gates
  // whether "Enable autosave" even renders in topActions, so this is only
  // ever reachable when the API actually exists.
  async function enableAutosave() {
    try {
      const handle = await pickCaseFileForAutosave(caseRecord);
      autosaveHandleRef.current = handle;
      setAutosaveHandle(handle);
      setAutosaveStatus("saved");
    } catch (error) {
      // AbortError means the user closed the picker without choosing a
      // file — a deliberate cancel, not a failure worth surfacing.
      if (error instanceof DOMException && error.name === "AbortError") return;
      console.error("Couldn't start autosave.", error);
      window.alert("Couldn't start autosave for that file. Try again.");
    }
  }

  function disableAutosave() {
    autosaveHandleRef.current = null;
    setAutosaveHandle(null);
    setAutosaveStatus("off");
    if (autosaveTimeoutRef.current) {
      clearTimeout(autosaveTimeoutRef.current);
      autosaveTimeoutRef.current = null;
    }
  }

  function startNewCase() {
    if (
      !window.confirm(
        "Start a new case? Anything unsaved in the current case will be lost unless you've saved it first.",
      )
    ) {
      return;
    }
    // Autosave, if on, was writing the case being replaced — leaving it
    // pointed at that file would silently overwrite it with the new blank
    // case's edits. Turn it off; the user re-enables it explicitly (and
    // picks a file) for the new case.
    disableAutosave();
    setCaseRecord(createInitialCase());
    setActiveClinicalStateId("clinical-state-1");
    setStateChanges([]);
  }

  function openCaseFromFile() {
    if (
      !window.confirm(
        "Open a case file? Anything unsaved in the current case will be lost unless you've saved it first.",
      )
    ) {
      return;
    }
    caseFileInputRef.current?.click();
  }

  async function handleCaseFileSelected(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    // Reset so selecting the same filename again still fires onChange.
    event.target.value = "";
    if (!file) return;

    try {
      const imported = await importCaseRecordFromFile(file);
      // Same reasoning as startNewCase above — the case being loaded in
      // is different content than whatever autosave was writing before.
      disableAutosave();
      setCaseRecord(imported);
      setActiveClinicalStateId(imported.clinicalStates[0].id);
      setStateChanges([]);
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Couldn't open that case file.";
      window.alert(message);
    }
  }

  function saveManeuverPerformance(
    maneuverId: string,
    values: Record<string, string>,
  ) {
    updateActiveClinicalState((current) =>
      upsertPerformance(current, maneuverId, values),
    );
    logStateChange("Maneuver result", maneuverId);
  }

  const activeWorkspace = resolveWorkspaceConfiguration(
    activeClinicalState.context.rhythm,
  );

  // While the Ablation phase is active, the Intervals section is replaced
  // by Ablation Details (see the ablationRow JSX below) — a case's
  // ablation sessions aren't tied to any one Rhythm, so this is keyed off
  // Phase directly rather than being another per-Rhythm workspace
  // configuration entry. See ABLATION-AS-PHASE-2026-08-08.
  const isAblationPhase = activeClinicalState.context.phase === "Ablation";

  // Same typeof-window-guard pattern as loadStoredRailWidth above —
  // isFileSystemAccessSupported() is false during SSR (no window) and
  // reflects the real browser once rendered client-side. The "Enable
  // autosave" control in topActions only renders when this is true.
  const autosaveSupported = isFileSystemAccessSupported();

  const enteredMeasurementCount = (
    clinicalState: (typeof caseRecord.clinicalStates)[number],
  ) => {
    const workspace = resolveWorkspaceConfiguration(clinicalState.context.rhythm);

    return workspace.sections.reduce(
      (count, section) =>
        count +
        section.fields.filter(
          (field) => clinicalState.measurements[field.id]?.trim() !== "",
        ).length,
      0,
    );
  };

  function logStateChange(field: string, value: string) {
    const timestamp = new Date().toLocaleTimeString([], {
      hour: "2-digit",
      minute: "2-digit",
    });

    setStateChanges((current) => [
      ...current,
      `${timestamp} — ${field}: ${value || "blank"}`,
    ]);
  }

  function updateActiveClinicalState(
    updater: (
      current: (typeof caseRecord.clinicalStates)[number],
    ) => (typeof caseRecord.clinicalStates)[number],
  ) {
    setCaseRecord((currentCase) => ({
      ...currentCase,
      clinicalStates: currentCase.clinicalStates.map((clinicalState) =>
        clinicalState.id === activeClinicalStateId
          ? updater(clinicalState)
          : clinicalState,
      ),
    }));
  }

  function updateContext<K extends keyof ClinicalStateContext>(
    key: K,
    value: ClinicalStateContext[K],
    label: string,
  ) {
    updateActiveClinicalState((current) => ({
      ...current,
      context: {
        ...current.context,
        [key]: value,
      },
    }));

    logStateChange(label, String(value));
  }

  /**
   * Spins off a new Clinical State carrying `pendingKey: nextValue` plus
   * every other field of `baseContext` unchanged — the "start a new
   * state" resolution of the context-change prompt, and also what
   * addClinicalState's NEW button used to do more narrowly (phase +
   * sedation only). Appends and switches to it in a single setCaseRecord
   * call so it can't race with a same-tick revert of the field on the
   * outgoing state (see resolvePendingContextChange's "already applied"
   * branch below).
   */
  function appendClinicalStateFrom(
    baseContext: ClinicalStateContext,
    pendingKey: GuardedContextField,
    nextValue: string,
  ) {
    const nextNumber = caseRecord.clinicalStates.length + 1;
    clinicalStateCounterRef.current += 1;
    const id = `clinical-state-${clinicalStateCounterRef.current}`;
    const nextState = createClinicalState(id, {
      ...baseContext,
      [pendingKey]: nextValue,
    } as ClinicalStateContext);

    setCaseRecord((current) => ({
      ...current,
      clinicalStates: [...current.clinicalStates, nextState],
    }));
    setActiveClinicalStateId(id);
    logStateChange("Clinical state", `Added state ${nextNumber}`);
  }

  /**
   * Entry point for the three <select> context fields (Phase/Rhythm/
   * Sedation). Nothing has been written anywhere yet at this point — if
   * the active state has no findings recorded, or the value didn't
   * actually change, this applies immediately exactly like before the
   * prompt existed. Only opens the prompt (and defers applying the
   * change until it's resolved) when there's something on the active
   * state the change could retroactively mislabel.
   */
  function requestContextChange<K extends GuardedContextField>(
    key: K,
    nextValue: ClinicalStateContext[K],
    label: string,
  ) {
    const previousValue = activeClinicalState.context[key];
    if (previousValue === nextValue) return;

    if (!clinicalStateHasFindings(activeClinicalState)) {
      updateContext(key, nextValue, label);
      return;
    }

    setPendingContextChange({
      key,
      label,
      previousValue: String(previousValue),
      nextValue: String(nextValue),
      alreadyApplied: false,
    });
  }

  /**
   * Entry point for the three free-text dose fields (Isoproterenol/
   * Adenosine/Epinephrin), called on blur. Unlike the selects above,
   * these already wrote the new value into the active state's context
   * on every keystroke (kept from before the prompt existed, for a
   * responsive typing feel) — so by the time this fires the edit is
   * already applied, and the prompt (if it opens) has to account for
   * that rather than apply it fresh. `clinicalStateHasFindings` only
   * looks at measurements/performances, never at these three fields, so
   * checking it after the live edit is still checking the right thing.
   */
  function handleContextFieldBlur(
    key: "isoproterenol" | "adenosine" | "epinephrin",
    label: string,
  ) {
    const previousValue = contextFieldBaselineRef.current[key] ?? "";
    const nextValue = activeClinicalState.context[key];
    if (nextValue === previousValue) return;

    if (!clinicalStateHasFindings(activeClinicalState)) {
      logStateChange(label, nextValue);
      return;
    }

    setPendingContextChange({
      key,
      label,
      previousValue,
      nextValue,
      alreadyApplied: true,
    });
  }

  /** Resolves whichever prompt requestContextChange/handleContextFieldBlur
   * opened. See PendingContextChange's doc comment for what
   * `alreadyApplied` distinguishes. */
  function resolvePendingContextChange(
    action: "new-state" | "keep-here" | "cancel",
  ) {
    const pending = pendingContextChange;
    if (!pending) return;
    setPendingContextChange(null);

    if (action === "cancel") {
      // Only the already-applied (text field) case has anything to
      // revert — the select case never wrote its new value anywhere.
      if (pending.alreadyApplied) {
        updateActiveClinicalState((current) => ({
          ...current,
          context: { ...current.context, [pending.key]: pending.previousValue },
        }));
      }
      return;
    }

    if (action === "keep-here") {
      if (pending.alreadyApplied) {
        logStateChange(pending.label, pending.nextValue);
      } else {
        updateContext(
          pending.key,
          pending.nextValue as ClinicalStateContext[typeof pending.key],
          pending.label,
        );
      }
      return;
    }

    // action === "new-state": the new state should carry forward every
    // other field of the state the change came from, so it reads as
    // "everything the same except the one thing that changed." For the
    // already-applied case, that means reverting the live edit on the
    // outgoing state back to its baseline in the very same
    // setCaseRecord call that appends the new state (see
    // appendClinicalStateFrom) — otherwise the outgoing state would be
    // left showing the new value too, as if it happened in both places.
    const baseContext = pending.alreadyApplied
      ? { ...activeClinicalState.context, [pending.key]: pending.previousValue }
      : activeClinicalState.context;

    if (pending.alreadyApplied) {
      updateActiveClinicalState((current) => ({
        ...current,
        context: { ...current.context, [pending.key]: pending.previousValue },
      }));
    }

    appendClinicalStateFrom(
      baseContext as ClinicalStateContext,
      pending.key,
      pending.nextValue,
    );
    logStateChange(pending.label, pending.nextValue);
  }

  function updateMeasurement(
    measurementId: string,
    value: string,
    label: string,
  ) {
    updateActiveClinicalState((current) => ({
      ...current,
      measurements: {
        ...current.measurements,
        [measurementId]: value,
      },
    }));

    logStateChange(label, value ? `${value} ms` : "");
  }

  function addClinicalState() {
    const nextNumber = caseRecord.clinicalStates.length + 1;
    clinicalStateCounterRef.current += 1;
    const id = `clinical-state-${clinicalStateCounterRef.current}`;
    const nextState = createClinicalState(id, {
      phase: activeClinicalState.context.phase,
      sedation: activeClinicalState.context.sedation,
    });

    setCaseRecord((current) => ({
      ...current,
      clinicalStates: [...current.clinicalStates, nextState],
    }));
    setActiveClinicalStateId(id);
    logStateChange("Clinical state", `Added state ${nextNumber}`);
  }

  /** Re-opens the given maneuver's card immediately, bypassing its gate —
   * used once a blocked PendingManeuverRequirement has just been
   * resolved. */
  function triggerManeuverAutoOpen(maneuverId: string) {
    autoOpenManeuverTokenRef.current += 1;
    setAutoOpenManeuver({ maneuverId, token: autoOpenManeuverTokenRef.current });
  }

  /**
   * The gate passed to every ManeuverCard as onBeforeOpenEditor — checks
   * the maneuver's Required States (Maneuver Definitions sheet) against
   * the active Clinical State's context. A maneuver with no Required
   * States is always allowed (vacuously satisfied). Otherwise, if the
   * active state doesn't satisfy every requirement (AND semantics — see
   * maneuverRequirementsSatisfied), this blocks the flip and opens the
   * PendingManeuverRequirement prompt instead, first checking every
   * other Clinical State for one that already qualifies so it can be
   * offered as a one-click "switch to this state" option. See
   * MANEUVER-REQUIRED-STATE-CHECK-2026-08-14 in PROJECT_DESIGN.md.
   */
  function attemptOpenManeuver(entry: ManeuverCatalogEntry): boolean {
    const requirements = entry.definition.requiredStates;
    if (requirements.length === 0) return true;

    if (
      maneuverRequirementsSatisfied(
        requirements,
        activeClinicalState.context,
        clinicalStateVocabulary,
      )
    ) {
      return true;
    }

    const candidateStateIds = caseRecord.clinicalStates
      .filter((clinicalState) => clinicalState.id !== activeClinicalState.id)
      .filter((clinicalState) =>
        maneuverRequirementsSatisfied(
          requirements,
          clinicalState.context,
          clinicalStateVocabulary,
        ),
      )
      .map((clinicalState) => clinicalState.id);

    setPendingManeuverRequirement({
      maneuverId: entry.definition.maneuverId,
      maneuverName: entry.definition.maneuverName || "This maneuver",
      requirements,
      candidateStateIds,
    });
    return false;
  }

  /** Resolves the PendingManeuverRequirement prompt — "switch" activates
   * an existing candidate state, "create" spins off a new one configured
   * to satisfy every requirement (see buildNewStateContextForRequirements),
   * and "cancel" just dismisses the prompt. Both "switch" and "create"
   * finish by re-opening the maneuver's card automatically, since the
   * user's original click is what started this in the first place. */
  function resolvePendingManeuverRequirement(
    action:
      | { type: "switch"; stateId: string }
      | { type: "create" }
      | { type: "cancel" },
  ) {
    const pending = pendingManeuverRequirement;
    if (!pending) return;
    setPendingManeuverRequirement(null);

    if (action.type === "cancel") return;

    if (action.type === "switch") {
      setActiveClinicalStateId(action.stateId);
      logStateChange(
        "Clinical state",
        `Switched to satisfy ${pending.maneuverName} requirement`,
      );
      triggerManeuverAutoOpen(pending.maneuverId);
      return;
    }

    const nextNumber = caseRecord.clinicalStates.length + 1;
    clinicalStateCounterRef.current += 1;
    const id = `clinical-state-${clinicalStateCounterRef.current}`;
    const nextContext = buildNewStateContextForRequirements(
      pending.requirements,
      activeClinicalState.context,
      clinicalStateVocabulary,
    );
    const nextState = createClinicalState(id, nextContext);

    setCaseRecord((current) => ({
      ...current,
      clinicalStates: [...current.clinicalStates, nextState],
    }));
    setActiveClinicalStateId(id);
    logStateChange("Clinical state", `Added state ${nextNumber}`);
    triggerManeuverAutoOpen(pending.maneuverId);
  }

  return (
    <main
      className="appShell"
      style={
        {
          "--clinical-state-rail-width": `${clinicalRailWidth}px`,
          "--diagnosis-monitor-width": `${diagnosisRailWidth}px`,
        } as CSSProperties
      }
    >
      <header className="topbar">
        <div className="brandArea">
          <div className="brand">
            <span className="brandMark" role="img" aria-label="DiagnosticPacing.org" />
            <h1>Diagnostic Pacing Maneuvers</h1>
          </div>

          <button
            className="aboutButton"
            onClick={() => setAboutOpen(true)}
            type="button"
          >
            About
          </button>

          <button
            className="walkthroughButton"
            onClick={() => {
              setAboutOpen(false);
              setReportOpen(false);
              setTutorialOpen(true);
            }}
            type="button"
          >
            Walkthrough
          </button>
        </div>

        <div className="topActions">
          <div className="activeCase">
            {/* No visible label — "Active case" was a GUI-draft
                holdover, removed per Murph's request. aria-label
                keeps this accessible without it. See
                CASE-TITLE-FIELD-TIDY-2026-08-11 in
                docs/PROJECT_DESIGN.md. The small green status dot
                that used to sit here is gone too — leftover from an
                "active case" scheme that was never built out. See
                ACTIVE-CASE-DOT-REMOVED-2026-08-11. */}
            <input
              aria-label="Case title"
              className="activeCaseTitleInput"
              onBlur={(event) => {
                if (!event.target.value.trim()) {
                  setCaseRecord((current) => ({
                    ...current,
                    title: "Untitled study",
                  }));
                }
              }}
              onChange={(event) => {
                const nextTitle = event.target.value;
                setCaseRecord((current) => ({ ...current, title: nextTitle }));
              }}
              onFocus={(event) => event.target.select()}
              type="text"
              value={caseRecord.title}
            />
          </div>
          <button className="secondaryButton" onClick={startNewCase} type="button">
            New case
          </button>
          <button className="secondaryButton" onClick={openCaseFromFile} type="button">
            Open case
          </button>
          <input
            accept=".json,application/json"
            hidden
            onChange={(event) => void handleCaseFileSelected(event)}
            ref={caseFileInputRef}
            type="file"
          />
          <button className="primaryButton" onClick={saveCaseToFile} type="button">
            Save case
          </button>
          {autosaveSupported && (
            <button
              className={
                autosaveHandle
                  ? "secondaryButton autosaveButton isActive"
                  : "secondaryButton autosaveButton"
              }
              onClick={autosaveHandle ? disableAutosave : () => void enableAutosave()}
              title={
                autosaveHandle
                  ? `Autosaving to ${autosaveHandle.name} — click to stop`
                  : "Pick a file to silently keep in sync with every change from now on"
              }
              type="button"
            >
              {autosaveHandle
                ? autosaveStatus === "saving"
                  ? "Autosaving…"
                  : `Autosave: ${autosaveHandle.name}`
                : "Enable autosave"}
            </button>
          )}
          <button
            className="secondaryButton"
            onClick={() => {
              setReportCopyState("idle");
              setReportOpen(true);
            }}
            type="button"
          >
            Report
          </button>
        </div>
      </header>

      <aside className="clinicalStatesRail" aria-label="Clinical states">
        <div className="clinicalStatesRailHeader">
          <div>
            <h2>Case structure</h2>
          </div>

          <span>{caseRecord.clinicalStates.length}</span>
        </div>

        <div className="clinicalStateCards">
          {caseRecord.clinicalStates.map((clinicalState, index) => {
            const isActive = clinicalState.id === activeClinicalStateId;
            const isAblationState = clinicalState.context.phase === "Ablation";
            const cycleLength = tachycardiaCycleLengthMs(clinicalState);
            const stateTag = formatClinicalStateTag(clinicalState.context);

            // Ablation-phase second line: location name, then the entered
            // ablation count appended as "X<count>" (e.g. "Septum X3") —
            // per Murph's ask, the count moved off the title line onto
            // this one. Either half can be blank; only render the line at
            // all if something ended up in it.
            const ablationLocationLine = isAblationState
              ? [
                  clinicalState.ablation.location.trim(),
                  clinicalState.ablation.count.trim()
                    ? `X${clinicalState.ablation.count.trim()}`
                    : "",
                ]
                  .filter(Boolean)
                  .join(" ")
              : "";

            return (
              <button
                className={`clinicalStateCard${isActive ? " active" : ""}${
                  isAblationState ? " ablationPhase" : ""
                }`}
                key={clinicalState.id}
                onClick={() => setActiveClinicalStateId(clinicalState.id)}
                type="button"
              >
                <div className="clinicalStateCardTop">
                  <span className="clinicalStateNumber">{index + 1}</span>
                  <span className="clinicalStateStatus">
                    {isActive ? "Active" : "Recorded"}
                  </span>
                </div>

                <div className="clinicalStateCardTitle">
                  {isAblationState ? (
                    <span
                      className="clinicalStateCardRhythm"
                      title={summarizeAblationSession(clinicalState.ablation)}
                    >
                      {clinicalState.ablation.modality
                        ? `${abbreviateAblationModality(clinicalState.ablation.modality)} Ablation`
                        : "Ablation"}
                    </span>
                  ) : (
                    <>
                      {/* Full Name, not the Clinical States knowledge-base
                          sheet's Abbreviated Name — see
                          CASE-STRUCTURE-CARD-FULL-NAME-2026-08-10. No
                          `title` tooltip needed: this card wraps rather
                          than truncates (.clinicalStateCardRhythm), so the
                          full text is always already on screen. */}
                      <span className="clinicalStateCardRhythm">
                        {clinicalState.context.rhythm}
                      </span>
                      {cycleLength !== null ? (
                        <span className="clinicalStateCardCycleLength">
                          CL {cycleLength} ms
                        </span>
                      ) : null}
                    </>
                  )}
                </div>

                {isAblationState && ablationLocationLine ? (
                  <div className="clinicalStateCardAblationLocation">
                    {ablationLocationLine}
                  </div>
                ) : null}

                {isAblationState ? null : (
                  <span
                    className="clinicalStateCardTag stateTagPill"
                    title={stateTag}
                  >
                    <ClinicalStateTagText tag={stateTag} />
                  </span>
                )}

                <div className="clinicalStateMeta">
                  <span>
                    {enteredMeasurementCount(clinicalState)} measurements
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        <div
          className={`railResizeHandle${
            draggingRail === "clinicalStates" ? " isDragging" : ""
          }`}
          onMouseDown={(event) => startRailResize("clinicalStates", event)}
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Clinical States panel"
        />
      </aside>

      <aside
        className="differentialDiagnosisRail"
        aria-label="Differential diagnosis monitor"
      >
        <div
          className={`railResizeHandle${
            draggingRail === "differentialDiagnosis" ? " isDragging" : ""
          }`}
          onMouseDown={(event) =>
            startRailResize("differentialDiagnosis", event)
          }
          role="separator"
          aria-orientation="vertical"
          aria-label="Resize Differential Diagnosis panel"
        />

        <Panel eyebrow="Differential diagnosis" title="">
          {maneuverCatalogStatus === "loading" && (
            <p className="maneuverCatalogStatus">Loading knowledge base…</p>
          )}

          {maneuverCatalogStatus === "error" && (
            <p className="maneuverCatalogStatus isError">
              Couldn&rsquo;t load the knowledge base. Try reloading the page.
            </p>
          )}

          {maneuverCatalogStatus === "ready" &&
            differentialResults.length === 0 && (
              <p className="maneuverCatalogStatus">
                No diagnoses are defined in the knowledge base yet — add them
                in the admin editor.
              </p>
            )}

          {maneuverCatalogStatus === "ready" &&
            differentialResults.length > 0 && (
              <div className="diagnosisList">
                {differentialResults.map((result) => (
                  <article
                    className="diagnosisCard"
                    key={result.diagnosis.diagnosisId}
                  >
                    <div className="diagnosisTop">
                      <span className="abbreviation">
                        {result.diagnosis.abbreviatedName}
                      </span>
                      <div className="diagnosisText">
                        <h3>{result.diagnosis.fullName}</h3>
                        <p>{result.diagnosis.description}</p>
                      </div>
                      <span
                        className={`status ${result.status.toLowerCase()}`}
                      >
                        {DIFFERENTIAL_STATUS_LABEL[result.status]}
                      </span>

                      <button
                        className="diagnosisWhyButton"
                        type="button"
                        title="Show justification"
                        onClick={() =>
                          window.alert(explainDifferentialResult(result))
                        }
                      >
                        Why?
                      </button>
                    </div>

                    <div className="confidence">
                      <small>
                        {result.status === "Possible"
                          ? `${result.supportCount} supporting finding${
                              result.supportCount === 1 ? "" : "s"
                            }`
                          : `${result.findings.length} clinical reasoning finding${
                              result.findings.length === 1 ? "" : "s"
                            }`}
                      </small>
                    </div>
                  </article>
                ))}
              </div>
            )}
        </Panel>
      </aside>

      <section className="caseStrip" aria-label="Active clinical state">
        <div className="stateToolbarRow">
          <div className="toolbarHeading activeClinicalStateHeading">
            <div className="activeClinicalStateLabel">
              <span className="liveIndicator" />
              <small>Active Clinical State</small>
            </div>

            <button
              className="newClinicalStateButton"
              onClick={addClinicalState}
              type="button"
            >
              NEW
            </button>
          </div>

          <div className="toolbarField phaseField">
            <label htmlFor="phase">Phase</label>
            <select
              id="phase"
              value={activeClinicalState.context.phase}
              onChange={(event) =>
                requestContextChange(
                  "phase",
                  event.target.value as ClinicalStateContext["phase"],
                  "Phase",
                )
              }
            >
              {resolveDropdownOptions("Phase", clinicalStateVocabulary).map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="toolbarField rhythmField">
            <label htmlFor="rhythm">Rhythm</label>
            <select
              id="rhythm"
              value={activeClinicalState.context.rhythm}
              onChange={(event) =>
                requestContextChange(
                  "rhythm",
                  event.target.value as ClinicalStateContext["rhythm"],
                  "Rhythm",
                )
              }
            >
              {resolveDropdownOptions("Rhythm", clinicalStateVocabulary).map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="toolbarField sedationField">
            <label htmlFor="sedation">Sedation</label>
            <select
              id="sedation"
              value={activeClinicalState.context.sedation}
              onChange={(event) =>
                requestContextChange(
                  "sedation",
                  event.target.value as ClinicalStateContext["sedation"],
                  "Sedation",
                )
              }
            >
              {resolveDropdownOptions("Sedation", clinicalStateVocabulary).map(
                (option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ),
              )}
            </select>
          </div>

          <div className="toolbarField">
            <label htmlFor="isoproterenol">Isoproterenol</label>
            <input
              id="isoproterenol"
              inputMode="decimal"
              value={activeClinicalState.context.isoproterenol}
              onFocus={(event) => {
                contextFieldBaselineRef.current.isoproterenol = event.target.value;
              }}
              onChange={(event) =>
                updateActiveClinicalState((current) => ({
                  ...current,
                  context: {
                    ...current.context,
                    isoproterenol: event.target.value,
                  },
                }))
              }
              onBlur={() => handleContextFieldBlur("isoproterenol", "Isoproterenol")}
              aria-label="Isoproterenol value"
            />
          </div>

          <div className="toolbarField">
            <label htmlFor="adenosine">Adenosine</label>
            <input
              id="adenosine"
              inputMode="decimal"
              value={activeClinicalState.context.adenosine}
              onFocus={(event) => {
                contextFieldBaselineRef.current.adenosine = event.target.value;
              }}
              onChange={(event) =>
                updateActiveClinicalState((current) => ({
                  ...current,
                  context: {
                    ...current.context,
                    adenosine: event.target.value,
                  },
                }))
              }
              onBlur={() => handleContextFieldBlur("adenosine", "Adenosine")}
              aria-label="Adenosine value"
            />
          </div>

          <div className="toolbarField">
            <label htmlFor="epinephrin">Epinephrin</label>
            <input
              id="epinephrin"
              inputMode="decimal"
              value={activeClinicalState.context.epinephrin}
              onFocus={(event) => {
                contextFieldBaselineRef.current.epinephrin = event.target.value;
              }}
              onChange={(event) =>
                updateActiveClinicalState((current) => ({
                  ...current,
                  context: {
                    ...current.context,
                    epinephrin: event.target.value,
                  },
                }))
              }
              onBlur={() => handleContextFieldBlur("epinephrin", "Epinephrin")}
              aria-label="Epinephrin value"
            />
          </div>
        </div>

        {isAblationPhase ? (
          <div className="clinicalMeasurementRow">
            <div className="intervalsHeading">
              <span>Ablation Details</span>
            </div>

            <div className="ablationRow">
              <div className="ablationActiveFields">
                <div className="ablationField ablationModalityField">
                  <span className="ablationFieldLabel">Modality</span>
                  <div className="ablationModalityToggles" role="group" aria-label="Modality">
                    {ablationModalityOptions.map((modality) => {
                      const selected = activeClinicalState.ablation.modality === modality;
                      return (
                        <button
                          aria-pressed={selected}
                          className={
                            selected
                              ? "ablationModalityToggle active"
                              : "ablationModalityToggle"
                          }
                          key={modality}
                          onClick={() => selectAblationModality(modality)}
                          title={modality}
                          type="button"
                        >
                          {abbreviateAblationModality(modality)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="ablationField ablationLocationField">
                  <span className="ablationFieldLabel">Location</span>
                  <input
                    aria-label="Ablation location"
                    onBlur={(event) =>
                      logStateChange("Ablation location", event.target.value)
                    }
                    onChange={(event) =>
                      updateAblation("location", event.target.value)
                    }
                    value={activeClinicalState.ablation.location}
                  />
                </div>

                <div className="ablationField ablationCountField">
                  <span className="ablationFieldLabel"># Ablations</span>
                  <input
                    aria-label="Number of ablations"
                    inputMode="numeric"
                    onBlur={(event) =>
                      logStateChange("Number of ablations", event.target.value)
                    }
                    onChange={(event) =>
                      updateAblation("count", event.target.value)
                    }
                    value={activeClinicalState.ablation.count}
                  />
                </div>

                <div className="ablationField">
                  <span className="ablationFieldLabel">Duration</span>
                  <div className="unitInput ablationDurationInput">
                    <input
                      aria-label="Ablation duration in seconds"
                      inputMode="numeric"
                      onBlur={(event) =>
                        logStateChange("Ablation duration", event.target.value)
                      }
                      onChange={(event) =>
                        updateAblation("durationSeconds", event.target.value)
                      }
                      value={activeClinicalState.ablation.durationSeconds}
                    />
                    <span>s</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        ) : (
          <>
            {activeWorkspace.sections.map((section) => (
              <div className="clinicalMeasurementRow" key={section.id}>
                <div className="intervalsHeading">
                  <span>{section.title}</span>
                </div>

                <div
                  className="clinicalMeasurementFields"
                  style={{
                    gridTemplateColumns: `repeat(${section.fields.length}, minmax(120px, 1fr))`,
                  }}
                >
                  {section.fields.map((field) => {
                    return (
                      <div
                        className="toolbarField intervalField"
                        key={field.id}
                      >
                        <label htmlFor={`measurement-${field.id}`}>
                          {field.label}
                        </label>

                        <div className="unitInput">
                          <input
                            id={`measurement-${field.id}`}
                            inputMode="decimal"
                            value={
                              activeClinicalState.measurements[field.id] ?? ""
                            }
                            onChange={(event) =>
                              updateActiveClinicalState((current) => ({
                                ...current,
                                measurements: {
                                  ...current.measurements,
                                  [field.id]: event.target.value,
                                },
                              }))
                            }
                            onBlur={(event) =>
                              updateMeasurement(
                                field.id,
                                event.target.value,
                                field.label,
                              )
                            }
                            aria-label={`${field.label} in milliseconds`}
                          />
                          <span>{field.unit}</span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}

            {activeWorkspace.sections.length === 0 && (
              <div className="clinicalWorkspacePlaceholder">
                <strong>{activeClinicalState.context.rhythm}</strong>
                <p>{activeWorkspace.placeholder}</p>
              </div>
            )}
          </>
        )}
      </section>

      <section
        className="effectiveRefractoryPeriodCard"
        aria-label="Refractory Periods"
      >
        <div className="intervalsHeading refractoryPeriodsHeading">
          <span>Refractory Periods</span>
          <small className="refractoryPeriodsCardNote">
            Every recorded finding, across every clinical state
          </small>
        </div>

        <div className="refractoryPeriodsRows">
          <div className="refractoryPeriodDirectionRow">
            <span className="refractoryPeriodDirectionLabel">Antegrade</span>

            <div className="refractoryPeriodFindings">
              {maneuverCatalogStatus === "ready" &&
                antegradeRefractoryPeriods.length === 0 && (
                  <p className="refractoryPeriodEmpty">
                    None recorded yet — record one on the back of whichever
                    maneuver card produces it.
                  </p>
                )}

              {antegradeRefractoryPeriods.map(({ definition, finding }) => (
                <div
                  className="refractoryPeriodFinding"
                  key={`${definition.id}-${finding.clinicalStateId}`}
                  title={`${definition.label} via ${definition.maneuverName} — ${finding.stateTag}`}
                >
                  <span className="refractoryPeriodFindingLabel">
                    {definition.label}
                  </span>
                  <span className="refractoryPeriodFindingValue">
                    {finding.value}
                    <span className="refractoryPeriodFindingUnit">ms</span>
                  </span>
                  <span className="refractoryPeriodFindingTag stateTagPill">
                    <ClinicalStateTagText tag={finding.stateTag} />
                  </span>
                </div>
              ))}
            </div>
          </div>

          <div className="refractoryPeriodDirectionRow">
            <span className="refractoryPeriodDirectionLabel">Retrograde</span>

            <div className="refractoryPeriodFindings">
              {maneuverCatalogStatus === "ready" &&
                retrogradeRefractoryPeriods.length === 0 && (
                  <p className="refractoryPeriodEmpty">
                    None recorded yet — record one on the back of whichever
                    maneuver card produces it.
                  </p>
                )}

              {retrogradeRefractoryPeriods.map(({ definition, finding }) => (
                <div
                  className="refractoryPeriodFinding"
                  key={`${definition.id}-${finding.clinicalStateId}`}
                  title={`${definition.label} via ${definition.maneuverName} — ${finding.stateTag}`}
                >
                  <span className="refractoryPeriodFindingLabel">
                    {definition.label}
                  </span>
                  <span className="refractoryPeriodFindingValue">
                    {finding.value}
                    <span className="refractoryPeriodFindingUnit">ms</span>
                  </span>
                  <span className="refractoryPeriodFindingTag stateTagPill">
                    <ClinicalStateTagText tag={finding.stateTag} />
                  </span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="workspace">


        <Panel className="maneuverPanel" eyebrow="Pacing maneuvers" title="">
          {maneuverCatalogStatus === "loading" && (
            <p className="maneuverCatalogStatus">Loading maneuvers…</p>
          )}

          {maneuverCatalogStatus === "error" && (
            <p className="maneuverCatalogStatus isError">
              Couldn&rsquo;t load the maneuver knowledge base. Try reloading
              the page.
            </p>
          )}

          {maneuverCatalogStatus === "ready" &&
            sortedManeuverCatalog.length === 0 && (
              <p className="maneuverCatalogStatus">
                No maneuvers are defined in the knowledge base yet — add them
                from the admin editor.
              </p>
            )}

          {maneuverCatalogStatus === "ready" &&
            sortedManeuverCatalog.length > 0 && (
              <div className="maneuverGrid">
                {sortedManeuverCatalog.map((entry) => {
                  // Every Clinical State this maneuver actually has a
                  // recorded result under (active or not), each paired with
                  // its performance — the Findings list on the card needs
                  // every value, not just whether other states exist. Order
                  // matches caseRecord.clinicalStates, which is already
                  // chronological (states are only ever appended).
                  const performedStates = caseRecord.clinicalStates.flatMap(
                    (clinicalState) => {
                      const performance = findPerformance(
                        clinicalState,
                        entry.definition.maneuverId,
                      );
                      return performance ? [{ clinicalState, performance }] : [];
                    },
                  );

                  return (
                    <ManeuverCard
                      key={entry.definition.maneuverId}
                      entry={entry}
                      performedStates={performedStates}
                      activeClinicalStateId={activeClinicalState.id}
                      activeClinicalStateSummary={activeClinicalStateSummary}
                      onSave={(values) =>
                        saveManeuverPerformance(
                          entry.definition.maneuverId,
                          values,
                        )
                      }
                      onBeforeOpenEditor={() => attemptOpenManeuver(entry)}
                      autoOpen={
                        autoOpenManeuver?.maneuverId ===
                        entry.definition.maneuverId
                          ? autoOpenManeuver.token
                          : null
                      }
                      onFlipChange={(isFlipped) => {
                        // Snapshot the live order the instant the *first*
                        // card flips away from front — from inside this
                        // event handler, not render (React's
                        // react-hooks/refs rule disallows mutating
                        // ref/state-like values during render, even for a
                        // "remember it for next render" memoization). See
                        // MANEUVER-GRID-FREEZE-WHILE-FLIPPED-2026-08-11 in
                        // docs/PROJECT_DESIGN.md.
                        if (isFlipped && flippedManeuverIds.size === 0) {
                          setFrozenManeuverOrder(
                            liveSortedManeuverCatalog.map(
                              (catalogEntry) =>
                                catalogEntry.definition.maneuverId,
                            ),
                          );
                        }

                        setFlippedManeuverIds((current) => {
                          const alreadyFlipped = current.has(
                            entry.definition.maneuverId,
                          );
                          if (isFlipped === alreadyFlipped) return current;
                          const next = new Set(current);
                          if (isFlipped) next.add(entry.definition.maneuverId);
                          else next.delete(entry.definition.maneuverId);
                          return next;
                        });
                      }}
                    />
                  );
                })}
              </div>
            )}
        </Panel>

        <Panel eyebrow="Current interpretation" title="Evidence and reasoning">
          <article className="synthesis">
            <small>Current synthesis</small>
            <h3>Typical AVNRT is favored, but ORT remains unresolved.</h3>
            <p>
              The short septal VA interval and concentric retrograde activation
              support AVNRT. A ventricular maneuver is still required before
              excluding a concealed septal accessory pathway.
            </p>
          </article>

          <div className="evidenceList">
            <article>
              <span className="positiveDot" />
              <div>
                <h3>Short septal VA</h3>
                <p>Compatible with typical AVNRT.</p>
              </div>
            </article>

            <article>
              <span className="positiveDot" />
              <div>
                <h3>Concentric atrial activation</h3>
                <p>Earliest atrial activation is septal.</p>
              </div>
            </article>

            <article>
              <span className="unresolvedDot" />
              <div>
                <h3>Accessory pathway unresolved</h3>
                <p>No pathway-specific ventricular maneuver is recorded.</p>
              </div>
            </article>
          </div>

          <div className="safetyNotice">
            <strong>Clinical review required</strong>
            <p>
              Recommendations are decision-support outputs and require review
              against the complete study context.
            </p>
          </div>
        </Panel>
      </section>

      <section className="lowerWorkspace">
        <Panel eyebrow="Recorded steps" title="Case timeline">
          <div className="timeline">
            <div className="timelineHeader">
              <span>Step</span>
              <span>Maneuver</span>
              <span>Observed result</span>
              <span>Diagnostic effect</span>
            </div>

            <div className="timelineRow">
              <span>01</span>
              <strong>Baseline observations</strong>
              <span>Regular narrow-complex tachycardia; TCL 330 ms</span>
              <span>AV node-dependent SVT suspected</span>
            </div>

            <div className="timelineRow">
              <span>02</span>
              <strong>Retrograde activation review</strong>
              <span>Concentric; earliest at the His region</span>
              <span>AVNRT favored</span>
            </div>
          </div>

          <div className="stateLogPanel">
            <div className="stateLogHeader">
              <div>
                <small>Current-state history</small>
                <h3>State log</h3>
              </div>
              <span>{stateChanges.length} changes</span>
            </div>

            {stateChanges.length ? (
              <div className="stateLogList">
                {[...stateChanges]
                  .reverse()
                  .slice(0, 8)
                  .map((change, index) => (
                    <div className="stateLogEntry" key={`${change}-${index}`}>
                      <span>{String(stateChanges.length - index).padStart(2, "0")}</span>
                      <p>{change}</p>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="stateLogEmpty">
                State changes will appear here as rhythm conditions,
                medications, and intervals are updated.
              </div>
            )}
          </div>
        </Panel>
      </section>

      {aboutOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => setAboutOpen(false)}
        >
          <section
            aria-labelledby="about-title"
            aria-modal="true"
            className="aboutModal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modalHeader">
              <div>
                <h2 id="about-title">About DiagnosticPacing.org</h2>
              </div>
            </header>

            <div className="modalBody">
              <p>
                Diagnostic Pacing Maneuvers is an interactive educational and
                clinical decision-support workspace for organizing pacing
                maneuvers, observations, diagnostic reasoning, and case
                reports.
              </p>

              <p>
                The diagnostic engines and logic will be maintained as
                separate open-source packages so they can be inspected,
                tested, and used independently of this interface.
              </p>

              <div className="modalPrivacyNotice">
                <p>
                  <strong>DiagnosticPacing.org is free to use, and always
                  will be.</strong>
                </p>
                <p>
                  <strong>Case data never leaves your device.</strong>{" "}
                  It stays in your browser and in any file you choose to
                  save.
                </p>
              </div>

              <div className="downloadSection">
                <h3>Knowledge base</h3>

                <div className="downloadCard">
                  <div>
                    <strong>Browse the clinical knowledge base</strong>
                    <span>
                      Every maneuver, diagnosis, and reasoning rule the
                      workspace uses — read-only, with a download to
                      Excel any time
                    </span>
                  </div>
                  <Link
                    className="downloadCardAction"
                    href="/knowledge"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Open
                  </Link>
                </div>
              </div>

              <div className="downloadSection">
                <h3>Get involved</h3>

                <div className="downloadCard">
                  <div>
                    <strong>Contribute or critique</strong>
                    <span>
                      Feedback, corrections, and contributions are
                      welcome — email isn&rsquo;t wired up for
                      DiagnosticPacing.org yet, but it&rsquo;s coming
                    </span>
                  </div>
                  <button
                    className="downloadCardAction"
                    disabled
                    title="Coming soon"
                    type="button"
                  >
                    Contact
                  </button>
                </div>
              </div>

              <p className="modalNotice">
                Medicine can only be practiced by trained, licensed
                physicians. This workspace does not provide medical advice —
                consult primary sources before relying on any statement it
                produces.
              </p>
            </div>

            <div className="modalFooter">
              <button
                className="modalOkButton"
                onClick={() => setAboutOpen(false)}
                type="button"
              >
                OK
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {reportOpen ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => setReportOpen(false)}
        >
          <section
            aria-label="Case report"
            aria-modal="true"
            className="reportModal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modalHeader">
              <div>
                <p>Plain text, ready to copy or print</p>
                <h2>Case report</h2>
              </div>

              <button
                aria-label="Close case report"
                className="reportCloseButton"
                onClick={() => setReportOpen(false)}
                type="button"
              >
                ×
              </button>
            </header>

            <div className="reportModalBody">
              <pre className="reportPrintable">{reportText}</pre>
            </div>

            <div className="modalFooter reportModalFooter">
              <button
                className="modalOkButton"
                onClick={() => void copyReportText()}
                type="button"
              >
                {reportCopyState === "copied"
                  ? "Copied"
                  : reportCopyState === "error"
                    ? "Couldn't copy — try again"
                    : "Copy all text"}
              </button>
              <button
                className="modalOkButton"
                onClick={() => window.print()}
                type="button"
              >
                Print
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingContextChange ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => resolvePendingContextChange("cancel")}
        >
          <section
            aria-labelledby="context-change-title"
            aria-modal="true"
            className="contextChangeModal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modalHeader">
              <div>
                <h2 id="context-change-title">
                  Change {pendingContextChange.label}?
                </h2>
              </div>
            </header>

            <div className="modalBody">
              <p>
                This Clinical State already has findings recorded under
                its current context. Changing {pendingContextChange.label}{" "}
                from &ldquo;{formatContextChangeValue(pendingContextChange.previousValue)}
                &rdquo; to &ldquo;{formatContextChangeValue(pendingContextChange.nextValue)}
                &rdquo; here would apply to everything already recorded in
                this state, including results captured under the old
                value.
              </p>
              <p>
                Start a new Clinical State with this change instead, or
                apply it to the current state anyway?
              </p>
            </div>

            <div className="modalFooter contextChangeModalFooter">
              <button
                className="modalOkButton"
                onClick={() => resolvePendingContextChange("new-state")}
                type="button"
              >
                Start new state
              </button>
              <button
                className="modalSecondaryButton"
                onClick={() => resolvePendingContextChange("keep-here")}
                type="button"
              >
                Change this state
              </button>
              <button
                className="modalGhostButton"
                onClick={() => resolvePendingContextChange("cancel")}
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      {pendingManeuverRequirement ? (
        <div
          className="modalBackdrop"
          role="presentation"
          onMouseDown={() => resolvePendingManeuverRequirement({ type: "cancel" })}
        >
          <section
            aria-labelledby="maneuver-requirement-title"
            aria-modal="true"
            className="contextChangeModal"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="modalHeader">
              <div>
                <h2 id="maneuver-requirement-title">
                  {pendingManeuverRequirement.maneuverName} requires a
                  different state
                </h2>
              </div>
            </header>

            <div className="modalBody">
              <p>
                {pendingManeuverRequirement.maneuverName} can only be
                performed in:{" "}
                {pendingManeuverRequirement.requirements.join(", ")}. The
                active Clinical State doesn&rsquo;t currently satisfy that.
              </p>
              <p>
                {pendingManeuverRequirement.candidateStateIds.length > 0
                  ? "Switch to a Clinical State that already qualifies, or create a new one configured to match."
                  : "Create a new Clinical State configured to match, or cancel."}
              </p>
            </div>

            <div className="modalFooter contextChangeModalFooter">
              {pendingManeuverRequirement.candidateStateIds.map((stateId) => {
                const candidate = caseRecord.clinicalStates.find(
                  (clinicalState) => clinicalState.id === stateId,
                );
                if (!candidate) return null;
                return (
                  <button
                    key={stateId}
                    className="modalSecondaryButton"
                    onClick={() =>
                      resolvePendingManeuverRequirement({
                        type: "switch",
                        stateId,
                      })
                    }
                    type="button"
                  >
                    Switch to &ldquo;{clinicalStateSummary(candidate.context)}
                    &rdquo;
                  </button>
                );
              })}
              <button
                className="modalOkButton"
                onClick={() =>
                  resolvePendingManeuverRequirement({ type: "create" })
                }
                type="button"
              >
                Create new state
              </button>
              <button
                className="modalGhostButton"
                onClick={() =>
                  resolvePendingManeuverRequirement({ type: "cancel" })
                }
                type="button"
              >
                Cancel
              </button>
            </div>
          </section>
        </div>
      ) : null}

      <footer className="statusbar">
        <div>
          <span className="onlineDot" />
          <strong>Local draft</strong>
          <span>No patient data is being transmitted</span>
        </div>
        <div>
          <span>Rules engine: not connected</span>
          <span className={autosaveHandle ? "autosaveStatusText isActive" : "autosaveStatusText"}>
            Autosave:{" "}
            {autosaveStatus === "saving"
              ? "saving…"
              : autosaveStatus === "error"
                ? "error — file not writable"
                : autosaveHandle
                  ? "on"
                  : "off"}
          </span>
          <span>GUI draft v1</span>
        </div>
      </footer>

      {tutorialOpen ? (
        <Tutorial onClose={() => setTutorialOpen(false)} />
      ) : null}
    </main>
  );
}
