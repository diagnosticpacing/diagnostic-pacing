# Diagnostic Pacing — Project Design

This document records committed architecture, workflow, and interface decisions.

<!-- STATUS-SUMMARY-2026-08-08 -->
## Status Summary (checkpoint as of 2026-08-08)

A fast-read reconciliation point, since this doc is the only durable memory
across sessions. Full reasoning for everything below lives in its own dated
section further down — this is an index, not a replacement.

**Live and implemented — core architecture:**

- Clinical State measurement architecture for plain intervals (AA, VV,
  PR, and similar) — still direct-entry, unchanged. The original ERP
  card's rhythm-specific display rules are superseded — see
  `REFRACTORY-PERIODS-V2-2026-08-03` below.
- Refractory periods (FRP/ERP) are now maneuver results, not direct
  entry: recorded on the back of whichever maneuver produces them,
  tagged via a single **Refractory Period Direction** column on
  Maneuver Response Fields (Antegrade/Retrograde/n/a — the Type and
  Structure columns this originally shipped with were both later
  removed as redundant, see `REFRACTORY-PERIODS-SIMPLIFY-2026-08-06`
  below); every RP field always renders exactly 3 optional entry boxes,
  and the clinician-facing label is just the field's own Maneuver
  Response Prompt. Shown in a derived "Refractory Periods" panel under
  Intervals, restyled 2026-08-04 to match the Active State/Intervals
  visual language, each finding tagged with the standardized Clinical
  State tag (see below) — see `REFRACTORY-PERIODS-V2-2026-08-03`,
  `REFRACTORY-PERIODS-STYLE-GUIDE-2026-08-04`, and
  `REFRACTORY-PERIODS-SIMPLIFY-2026-08-06`.
- The Clinical State tag ("Pre-ABL · Iso-On", etc.) is standardized:
  identical text and one shared pill component
  (`ClinicalStateTagText`/`formatClinicalStateTag` in
  `app/clinical/model.ts`) everywhere it's rendered (Refractory Period
  findings, maneuver card history/findings, Case Structure cards), each
  of the four possible values (Pre-ABL/Post-ABL/Iso-On/Iso-Off) with its
  own fixed identity color (cyan/violet/red/amber), with an
  Ablation-phase-aware bucketing (Phase `"Ablation"` reads as
  `"Pre-ABL"` until the case moves to a Post-ablation phase) and a
  separate active-state ring/highlight that's never a recolor — green is
  reserved exclusively for that highlight. See
  `STATE-TAG-STANDARDIZE-2026-08-08`, `STATE-TAG-COLOR-2026-08-08`, and
  `ABLATION-AS-PHASE-2026-08-08`.
- Knowledge base schema v2, including Clinical States, Rule Group ID /
  Required Clinical State on Clinical Reasoning, and the three-value
  Differential Action (Supports/Excludes/Confirms). The Clinical States
  fixed vocabulary is NSR, Brady, Tachy, CRM Paced, Iso On, Iso Off,
  Adenosine — **Iso Washout was removed** from the original v2 list early
  in this stretch of work. The sheet's Abbreviated Name column became a
  plain open text field (was a fixed dropdown Murph didn't choose the
  values for) on 2026-08-04 — see
  `CLINICAL-STATE-CARD-WRAP-AND-ABBREVIATION-2026-08-04`.
- Clinical Reasoning can evaluate either a Maneuver's response field or
  an Interval directly (Maneuver Considered vs. Interval Considered),
  mutually exclusive and enforced live in the UI, not just by validation.
- Clinical Terms sheet renamed to "Intervals" in every user-facing label
  (internal `SheetId`/keys unchanged on purpose — no migration needed).
- Main GUI: live maneuver card grid (flip-to-enter-results) replacing the
  old static tile mockup, independently resizable Clinical States and
  Differential Diagnosis rails, and a **real differential diagnosis
  engine** (`app/differential/engine.ts`) replacing the old hardcoded
  demo array and fake percentage-confidence bar. Both the card grid's
  relevance ordering and the differential rail now read from the same
  live knowledge base via the public `GET /api/knowledge/public` route.
  Maneuver card ordering is now also controlled by a manual Base Rank
  column (tiebreaker under relevance scoring) — see
  `MANEUVER-BASE-RANK-2026-08-04`.
- The knowledge base save pipeline now self-heals from schema changes:
  `pruneUnknownColumns()` (`app/admin/model.ts`) strips any row key that
  isn't in the current schema before validating/storing, so removing a
  column (as happened when Refractory Period Component # was dropped)
  can never permanently block saving again — see the tail end of
  `REFRACTORY-PERIODS-V2-2026-08-03` below.
- Public read-only knowledge base viewer at `/knowledge` — no login,
  same live data and schema as the admin editor via a new `readOnly`
  mode on `SpreadsheetTable`/`Toolbar`, plus Excel download — see
  `PUBLIC-KNOWLEDGE-BASE-VIEWER-2026-08-04`.

**Live and implemented — GUI polish, mostly 2026-08-04:**

- The About modal now doubles as the site's landing page: opens
  automatically on every load (still reachable afterward via the About
  button), is dismissed with a large "OK" button centered at the bottom
  rather than a small corner ×, and its one working card — "Browse the
  clinical knowledge base" — opens `/knowledge` in a new browser tab so
  the clinical workspace itself is never navigated away from. See
  `PUBLIC-KNOWLEDGE-BASE-VIEWER-2026-08-04` and its same-day
  `ABOUT-MODAL-LANDING-PAGE-2026-08-04` follow-up.
- The topbar's non-functional "Workspace"/"Reference" tab toggle (a
  draft holdover that never did anything) is gone — see
  `REMOVE-WORKSPACE-REFERENCE-TABS-2026-08-04`.
- Differential diagnosis card statuses display as "Included" /
  "Confirmed" / "Excluded" (internal `DifferentialStatus` values
  unchanged) — see `DIFFERENTIAL-STATUS-LABEL-2026-08-04`.
- Clinical State rail cards (left pane): show the actual recorded Phase,
  Rhythm, and Iso status — not an ordinal "Clinical State N" — in a
  three-column grid where all three get equal visual weight (no field
  is a bold headline over the others), values wrap instead of
  truncating, and any value automatically abbreviates itself via the
  Clinical States knowledge-base sheet whenever a matching Full
  Name/Abbreviated Name row exists (falls back to the full value
  otherwise). See `CLINICAL-STATE-COMPACT-SUMMARY-2026-08-04`,
  `CLINICAL-STATE-CARD-EQUAL-WEIGHT-2026-08-04`, and
  `CLINICAL-STATE-CARD-WRAP-AND-ABBREVIATION-2026-08-04`.
- Maneuver cards: the "recorded under other clinical states" history is
  a compact chip row in the card's top-right corner (real Phase ·
  medication · sedation details, not a bare count); the redundant
  "Suggested next" tag that used to occupy that same corner is gone
  (the grid is already relevance-sorted); the front badge and
  card-back header's clinical-state text wrap instead of truncating.
  See `CLINICAL-STATE-COMPACT-SUMMARY-2026-08-04` and its two same-day
  addenda within that section.
- Admin spreadsheet editor: cross-sheet reference links, live cascading
  lookup dropdowns (see the dedicated reference section below — this is
  the "how are the tailored column menus auto-populated" answer),
  auto-populated hidden ID columns, column sorting, resizable columns,
  required-field highlighting, and **per-row locking** with save-locks-
  everything semantics — the lock button now sits at the left of every
  row (moved from the right) and row numbers were removed entirely, see
  `ADMIN-ROW-LOCKING-V1-2026-08-03` and
  `ADMIN-HIDE-ROW-NUMBERS-2026-08-04`. The Response Fields sheet gained
  an "Associated Maneuver" name picker that auto-populates the existing
  ID column, matching the app's other cascading-lookup columns — see
  `RESPONSE-FIELDS-MANEUVER-NAME-2026-08-04`.
- Small polish items: browser tab titles reflect the active case
  (`BROWSER-TAB-TITLES-2026-08-03`); Interval IDs are prefixed `IID-`
  (`INTERVAL-ID-PREFIX-2026-08-03`); native `<select>` dropdown popups
  are styled for the dark theme instead of showing the OS default light
  popup (`NATIVE-SELECT-DARK-THEME-2026-08-03`).

**Live and implemented — 2026-08-05:**

- Case Save / Open / New: client-side JSON export/import
  (`app/case/persistence.ts`, schema-versioned, tolerant of older files
  missing newer fields) wired to three new top-bar buttons — see
  `CASE-SAVE-OPEN-2026-08-05`.
- GUI header alignment: Active Clinical State's section header is the
  same width as Intervals'; Refractory Periods' header moved to the
  same left-column position/style as Intervals and Active Clinical
  State, with the Antegrade/Retrograde rows to its right — see
  `SECTION-HEADER-ALIGNMENT-2026-08-05`.
- Active Clinical State's fields collapsed from two rows to one — see
  `ACTIVE-STATE-SINGLE-ROW-2026-08-05`.
- Default first-load width for both side rails bumped
  190px → 225px — see `RAIL-DEFAULT-WIDTH-2026-08-05`.
- ~~New Ablation section under Refractory Periods~~ — **superseded
  2026-08-08, see the "Ablation folded into Phase" bullet further down.**
  Originally: Modality (multiselect RF/Pulsed Field/Cryo), Location,
  Number of Ablations, Duration, kept to one line always via a
  collapsing-session pattern — only the active session shows full
  fields, prior sessions collapse to a reopenable `ABL Session N` badge.
  See `ABLATION-SECTION-2026-08-05` and `ABLATION-SESSION-RECALL-2026-08-05`
  for the original design and `ABLATION-AS-PHASE-2026-08-08` for the
  relocation into the Intervals row. **The underlying session data model
  itself is now also superseded** — see `ABLATION-PER-CLINICAL-STATE-2026-08-09`:
  ablation detail lives on the Clinical State directly (one entry per
  Ablation-phase state, single-select modality), not a shared case-level
  array; the multi-session badge/add-session UI is gone, replaced by
  "start a new Clinical State for a second session." Case Structure
  cards for an Ablation-phase state now headline `{count} {Modality}
  Ablation` with location underneath, in place of Rhythm. Still **not
  wired into the case report generator** — ablation data doesn't appear
  in generated reports yet.
- Maneuver cards rebuilt end to end, in four passes:
  1. Redesigned per Murph's sketch — Name + Performed History on top, a
     Findings box in the middle (every recorded finding across every
     Clinical State, not just the active one, each tagged Pre/Post ·
     Iso on/off), Enter/Edit Result + Maneuver Details on the bottom. A
     third card-flip state (`"front" | "results" | "details"`) holds a
     Details face — Technique text now, a diagram placeholder for
     later. See `MANEUVER-CARD-REDESIGN-2026-08-05`.
  2. "Maneuver details" made reachable from the results-entry side too,
     plus click-anywhere-on-a-card-face-to-flip layered on top of (not
     replacing) the explicit buttons. See
     `MANEUVER-CARD-CLICK-TO-FLIP-2026-08-05`.
  3. Fixed a real scrollbar bug (a CSS overflow-x quirk plus an
     unscoped overflow region on the back face) and turned "title /
     Performed History / bottom buttons never scroll" into an explicit,
     structurally-enforced rule (pinned header/footer via
     `flex-shrink: 0`, exactly one scrollable body region per face).
     Action button labels shortened to guarantee single-line (`Enter`/
     `Edit`, `Details`, `Save`, `Cancel`), full wording kept via
     `aria-label`. See `MANEUVER-CARD-LAYOUT-LOCK-2026-08-05`.
  4. The results-entry face replaced its all-fields-at-once list with a
     field picker "landing page" — a compact list of every possible
     finding (with a live value preview once drafted) that expands to
     one field's entry control on tap, so a maneuver with many possible
     findings (e.g. up to 8 for Ventricular Extrastimulus) doesn't
     dump a wall of number boxes into a small card. Also documented
     under `MANEUVER-CARD-LAYOUT-LOCK-2026-08-05`. **Note:** the
     "Save"/"Cancel" pair described here was itself later merged into a
     single "Done" button — see the Enter-key/autosave bullet under
     2026-08-06 below.

**Live and implemented — 2026-08-06:**

- About modal (the auto-opening landing page) gained a green
  "free-forever + no server-side storage" privacy callout, later
  trimmed to one short sentence each; the amber disclaimer that used to
  say "early GUI draft" now says something legally meaningful (medicine
  only practiced by licensed physicians, no medical advice, consult
  primary sources); a real mobile scrollability bug was fixed (the
  modal had no `max-height`/scroll region, so the only dismiss button
  could render off-screen with no way to reach it) using the same
  fixed-header/scrollable-body/fixed-footer recipe as the Report modal.
  See `ABOUT-MODAL-FREE-PRIVACY-NOTICE-2026-08-06` and
  `ABOUT-MODAL-COPY-AND-MOBILE-FIX-2026-08-06`.
- The topbar's "Active case" title is now an editable field (was static
  text) — it already was the single source `exportCaseRecord()` (Save
  filename) and the report generator (report title) read from, so only
  the write path needed building. See `ACTIVE-CASE-TITLE-EDITABLE-2026-08-06`.
- The header's plain "DP" text mark was replaced with Murph's own
  finished wordmark logo, processed into a CSS `mask-image` (luminance
  → alpha cutout) so it recolors live via `--cyan` with no baked-in
  color; same-day follow-up simplified the full "Dp.org" lockup down to
  a compact "Dp" monogram. See `BRAND-MARK-WORDMARK-2026-08-06`.
- Case structure rail header collapsed from two lines to one; a new
  `--violet` style-guide color (same hex the admin lock indicator
  already used — `--locked` now points at it too) promotes three
  section titles (Case structure / Differential diagnosis / Pacing
  maneuvers) to larger, violet, sentence-case headings. See
  `VIOLET-SECTION-ACCENTS-2026-08-06`.
- Enter key now confirms/closes the About modal (previously only the OK
  button worked). Maneuver card results: "Cancel" and "Save result"
  merged into one "Done" button — there's no longer a silent-discard
  path — and results also debounce-autosave 3 seconds after the user
  stops typing, so data reaches the differential engine even if a card
  is just left open. A `lastCommittedValuesRef` snapshot guards against
  logging spurious no-op case-timeline entries from either path. See
  `ENTER-KEY-ABOUT-OK-AND-MANEUVER-AUTOSAVE-2026-08-06`.
- Refractory Period tagging simplified from three columns (Type,
  Direction, Structure) to Direction only — see the core-architecture
  bullet above for the current state, and
  `REFRACTORY-PERIODS-SIMPLIFY-2026-08-06` for the full investigation
  (Structure was cosmetic, Type was load-bearing) and the
  AskUserQuestion-driven decision to accept losing the
  Functional/Effective box-count distinction in exchange for the
  simpler schema. One dormant edge case flagged, not fixed: a field
  tagged under the old schema with Direction left at `"n/a"` will now
  silently stop being recognized as an RP field.

**Live and implemented — 2026-08-08:**

- Context-change guard: changing Phase, Rhythm, Sedation,
  Isoproterenol, Adenosine, or Epinephrin on a Clinical State that
  already has findings recorded (measurements, maneuver results, or —
  as of `ABLATION-PER-CLINICAL-STATE-2026-08-09` — ablation detail)
  prompts "start a new state or change this one?" before applying the
  change — a `<select>` field is intercepted before it writes, a
  free-text dose field compares its blur value against a focus-time
  baseline. See `CONTEXT-CHANGE-PROMPT-2026-08-08`.
- Case Structure cards reworked: the title is now the Clinical State's
  Rhythm (abbreviated via the knowledge base where available), plus
  cycle length for Tachycardia (shorter of the AA/VV interval
  measurements), plus the standardized Clinical State tag — replacing
  the old three-column Phase/Rhythm/Iso grid. See
  `CASE-STRUCTURE-CARD-REWORK-2026-08-08`. A Clinical State whose Phase
  is Ablation is the exception: no Rhythm/cycle length, no tag pill —
  title is `{Modality} Ablation`, with `{location} X{count}` rendered
  underneath. The card itself is shorter than a standard card and
  carries its own dark-fuchsia (`--fuchsia`) identity instead of the
  default border/background, including when it's also the active card.
  See `ABLATION-PER-CLINICAL-STATE-2026-08-09` (the per-state data
  model) and `ABLATION-CARD-STYLE-2026-08-10` (this restyle).
- Guided Walkthrough tutorial: a new "Walkthrough" button beside About
  opens an 11-step spotlight tour (`app/tutorial/Tutorial.tsx`) that
  highlights one live section of the GUI at a time with an oversized
  box-shadow cutout, live-tracking the target's position on
  resize/scroll. Deliberately routes around three panels found to be
  non-functional placeholder content during the build: "Evidence and
  reasoning" (hardcoded fake synthesis text), the "Maneuver result
  entry" panel (since removed — see below), and the still-fake top half
  of "Case timeline". See `TUTORIAL-WALKTHROUGH-2026-08-08`.
- The dead "Maneuver result entry" panel (static empty-state, a
  non-functional "Enter manually" button) is deleted; "Case timeline"
  (including the real, live state log) stays, earmarked for future
  wiring. New "Yes/No Buttons" Input Type option on the Response Fields
  admin sheet — a two-button toggle that always starts with neither
  selected, distinct from Checkbox (which always starts unchecked and
  so can't represent "not yet answered" separately from an actual
  "No"). See `MANEUVER-RESULT-ENTRY-REMOVED-2026-08-08`.
- Ablation folded into Phase: `"Ablation"` is now a Phase option
  (`Pre-ablation, Ablation, Post-ablation, Post-ablation 2`); selecting
  it swaps the Active Clinical State's Intervals row to "Ablation
  Details" (the same modality/location/count/duration session UI,
  relocated) instead of the normal per-Rhythm interval fields. The old
  always-visible standalone Ablation card/section is gone — see the
  superseded 2026-08-05 bullet above. Pre-ABL/Post-ABL tag bucketing
  and the report generator's Pre-/Post-Ablation Measurements sections
  both treat the Ablation phase as pre-ablation until the case moves to
  a Post-ablation phase. The Pacing Maneuvers panel's explanatory
  subhead paragraph ("Ordered by relevance...") was also removed in
  the same pass. See `ABLATION-AS-PHASE-2026-08-08`.
- Case autosave to a local file: a new "Enable autosave" button
  (Chromium-only — Firefox/Safari keep the existing manual Save/Open/New
  unchanged and never see this button) uses the File System Access API
  to let the user pick or create a file once; every later change to any
  field is then silently rewritten to that same file, debounced ~1.5s
  after the last edit. New case / Open case both disable autosave first
  so a freshly loaded case can never get its edits silently written
  into the previous case's file. The file handle doesn't survive a page
  reload — the user reconnects via "Enable autosave" again each
  session; no persistence layer was built for that. See
  `CASE-AUTOSAVE-2026-08-08`.
- Pacing Maneuvers panel width fix: `.workspace` and `.lowerWorkspace`
  had a stale 24px `padding-right` left over from an older 3-column
  grid design, making the Pacing Maneuvers panel (and Case Timeline /
  Evidence and reasoning below it) render 24px narrower on the right
  than Active Clinical State, Intervals, and Refractory Periods, which
  carry no outer padding of their own. Both sections' right padding is
  now zeroed alongside the left, matching all four top-level sections'
  already-shared outer margins. See
  `MANEUVER-PANEL-WIDTH-FIX-2026-08-10`.
- Conditional Response Field visibility: four new columns on the
  Response Fields sheet (Display When, Display Field, Display Field ID,
  Display Operator, Display Value) let a field only appear once another
  field on the *same* maneuver has a matching recorded response — e.g.
  a follow-up question that only shows after a Yes/No Buttons field is
  answered "Yes." Display Field is a cascading lookup narrowed to the
  same maneuver (the same mechanism Response Options' Associated Field
  already used), and Display Operator reuses Clinical Reasoning's exact
  operator vocabulary (`Is Checked`, `Is Unchecked`, `=`, `≠`, `>`, `<`)
  via a newly shared `evaluateOperator` (moved out of
  `app/differential/engine.ts` into `app/shared/operatorEvaluation.ts`
  so it's not owned by the differential engine anymore). Evaluated live
  against the in-progress draft in `ManeuverCard.tsx`, not just the last
  saved performance, so a follow-up field appears the instant its
  trigger is answered. See
  `RESPONSE-FIELD-CONDITIONAL-DISPLAY-2026-08-10`.
- Admin site: the spreadsheet's column-header row (labels + "How the
  application uses this" description) now actually freezes in place
  while a long list of rows scrolls. Two independent bugs had to be
  fixed, not one — see below for why the first fix alone didn't do it.
  `.adminTableViewport`'s `overflow: auto` had no height constraint, so
  it never actually scrolled internally; the whole page scrolled past
  it instead. Fixed by turning `.adminShell` into a fixed-viewport-height
  flex column (a deliberate exception to every other top-level shell's
  ordinary min-height-plus-page-scroll) with only `.adminTableViewport`
  (now `flex: 1`) as a real scrolling region — which also pins the
  topbar, tabs, maneuver subnav, sheet heading, and toolbar permanently
  above the grid as a side effect. Applies to both the editable admin
  site and the read-only public knowledge viewer, which share this
  exact shell. See `ADMIN-TABLE-STICKY-HEADER-2026-08-10`. That alone
  turned out not to be enough: `button.adminTableHeader { position:
  relative }` — a more specific selector matching every actual header
  cell (all rendered as `<button>`) — was silently overriding the base
  rule's `position: sticky` the entire time, for a reason unrelated to
  scrolling at all. See `ADMIN-STICKY-HEADER-SPECIFICITY-FIX-2026-08-10`
  for the second fix, found by reading Murph's screenshots of the
  actual scrolled state after the first fix shipped and still didn't
  work.
- Clinical Reasoning's Operator column and Response Fields' Display
  Operator column both gained "Yes Selected"/"No Selected" options,
  alongside the existing "Is Checked"/"Is Unchecked" — intentional
  aliases (identical comparison, evaluateOperator now treats them as
  the same two cases) so the dropdown reads naturally whichever of the
  two Yes/No-style input types the field being compared actually is.
  See `ADMIN-OPERATOR-YES-NO-ALIASES-2026-08-10`.
- Admin site: every column's "How the application uses this" description
  (`modelUse` in `app/admin/model.ts`) rewritten to be short — usually one
  clause, rarely more than a sentence — instead of the multi-sentence
  copy that had accumulated column by column. Prompted by the header row
  no longer scrolling out of view
  (`ADMIN-STICKY-HEADER-SPECIFICITY-FIX-2026-08-10`), which turned that
  copy's height into permanent, always-visible page space rather than
  something that scrolled away. `.adminTableHeader`'s `min-height` floor
  (the one that actually renders — see the "Administration visible
  column guidance v2" block) dropped from 150px to 92px to match, along
  with `.adminDeleteHeader`/`.adminLockHeader` so the header row stays
  aligned. See `ADMIN-COLUMN-GUIDE-SHORTEN-2026-08-10`.
- Maneuver cards: a Yes/No Buttons response field answers inline in its
  results-side picker row (label plus the real Yes/No buttons, side by
  side) instead of being a clickable row that navigates into the
  single-field editor screen the way every other input type still
  does — a Yes/No answer is only two buttons, so the extra screen
  wasn't buying anything. See `ANSWER-YESNO-INLINE-2026-08-10`.
- Maneuver cards no longer show a duplicate row of Clinical State tag
  pills top-right (`.maneuverPerformedHistory`, next to the maneuver
  name) — that tag already appears on every row of the findings list
  below, paired with the actual result, so the top-right copy was
  redundant and never carried a value of its own. Removed at Murph's
  request so the findings list (the "summary side" of the card) is the
  only place the tag is used to differentiate results. See
  `TAG-DEDUP-REMOVE-CARD-TOP-PILLS-2026-08-10`.
- Case Structure cards' title now shows Rhythm's Full Name (the value
  already recorded on the Clinical State) instead of looking it up
  against the Clinical States knowledge-base sheet and substituting its
  Abbreviated Name — e.g. "Normal Sinus Rhythm" rather than "NSR".
  `abbreviateClinicalStateLabel`, the lookup helper this used, is
  removed (it had no other caller). See
  `CASE-STRUCTURE-CARD-FULL-NAME-2026-08-10`.
- Admin/Knowledge site's per-sheet heading (`.adminSheetHeading`, above
  the toolbar) no longer restates which sheet is selected — dropped
  the "Knowledge-base sheet"/"Maneuver workbook" eyebrow and the `<h2>`
  sheet name, since AdminTabs (and, for Maneuvers, ManeuverWorkspace's
  subnav) already show that. Only the description line remains. See
  `ADMIN-SHEET-HEADING-DEDUP-2026-08-10`.
- Admin site's topbar (`/admin` only, not the read-only `/knowledge`
  viewer): "Diagnostic Pacing" and "Knowledge-Base Administration"
  collapsed from a stacked eyebrow-above-`<h1>` into one `<h1>` line
  (the eyebrow is now an inline span inside it), and the explanatory
  sentence below ("Edit the clinical content and transparent reasoning
  used by the application.") is removed outright. See
  `ADMIN-TOPBAR-SINGLE-LINE-2026-08-11`.
- Maneuver card results side: the field-picker "landing page" +
  single-field editor (introduced `MANEUVER-CARD-REDESIGN-2026-08-05`,
  most recently touched by `ANSWER-YESNO-INLINE-2026-08-10`) is
  removed. Every visible field's prompt and entry control now render
  together immediately, all stacked in one scrolling list — no more
  picking a field first and entering its value on a second screen.
  Front-tile ↔ results-face flip is unchanged; only the navigation
  *within* the results face is gone. See
  `MANEUVER-CARD-FIELDS-INLINE-2026-08-11`.

**Still open / intentionally deferred:**

- Differential engine: Required Clinical State is not enforced yet (checked
  existentially across all recorded states); interval-to-measurement
  matching is a name heuristic, not a formal ID join.
- Maneuver relevance scoring still uses the documented fallback (count of
  a maneuver's own Relevant Diagnoses still active) rather than the fuller
  Clinical-Reasoning-weighted / value-of-information approach — needs more
  real reasoning-rule data before that's worth building. As of
  `MANEUVER-GRID-BASE-RANK-FIX-2026-08-10`, this fallback is only used to
  sort the maneuver grid once the case has recorded Maneuver Response
  Field data — an empty case sorts by Base Rank alone.
- Two schema-v2 items flagged but never explicitly re-confirmed: the
  `enabled` Yes/No row-disable toggle, and `storedValue` on Response
  Options (Compared Value is currently free text with no controlled
  vocabulary to validate against it).
- The `INFRA-STATUS-2026-08-01` snapshot below (Blob revision number, row
  counts, the revision-index gap at 5/7) is now stale given the volume of
  saves since — treat it as historical, not current, until re-verified.
- Ablation session data (Modality/Location/#Ablations/Duration) still
  isn't wired into the generated case report — noted as a gap when the
  Ablation section first shipped 2026-08-05, still true after its
  2026-08-08 relocation into the Intervals row, and still true after
  moving to a per-Clinical-State model 2026-08-09
  (`ABLATION-PER-CLINICAL-STATE-2026-08-09`).
- Opening a case file saved before `ABLATION-PER-CLINICAL-STATE-2026-08-09`
  drops its ablation data: that format kept ablation sessions in a
  shared case-level list, undifferentiated by Clinical State, and there's
  no reliable way to map an old session onto one specific state on
  import — each Clinical State just starts with a blank ablation entry
  instead. Accepted and flagged to Murph when the change shipped, not
  silently absorbed.
- Two panels remain non-functional placeholder content, discovered and
  explicitly flagged (not fixed) while building the Walkthrough tutorial
  `TUTORIAL-WALKTHROUGH-2026-08-08`: "Evidence and reasoning" (hardcoded
  fake synthesis text, no binding to live case data) and the top half of
  "Case timeline" (two hardcoded fake rows sitting above the real,
  live `.stateLogPanel` in the same Panel). The Walkthrough tour
  deliberately routes around both.
- Refractory Period Direction's dormant `"n/a"` edge case from
  `REFRACTORY-PERIODS-SIMPLIFY-2026-08-06`: a field tagged under the old
  three-column schema with Direction left at `"n/a"` will silently stop
  being recognized as an RP field, since Direction is now the sole
  signal. Documented as "not used in practice" at the time, not
  re-verified against current production data since.
- Case autosave's file handle doesn't survive a page reload or browser
  restart (`CASE-AUTOSAVE-2026-08-08`) — no IndexedDB-backed
  handle-persistence layer was built, by design for this first pass, so
  autosave always starts back at "off" on a fresh load.

<!-- ERP-CLINICAL-STATE-DESIGN-V1 -->
## Clinical State Measurement Architecture (SUPERSEDED — see REFRACTORY-PERIODS-V2-2026-08-03)

**Everything below this point through "Rhythm-Specific ERP Display
Rules" describes the original hardcoded, direct-entry ERP/FRP card —
fields in `workspaceConfigurations`, the `erp.<field>.N` storage keys,
the rhythm-specific field ordering, the manual "Add Accessory Pathway
2" button. None of it exists in code anymore.** Refractory periods are
now recorded as maneuver results (tagged Response Fields) and rendered
by a derived, read-only panel — see `REFRACTORY-PERIODS-V2-2026-08-03`
much further down, which is the current, accurate design. Left in place
below only as a historical record of what the original direct-entry
model looked like and why it was replaced (the "an ERP is the *output*
of a maneuver, not an ambient observation" reasoning that motivated the
rebuild). Plain intervals (AA, VV, PR, and similar) are the one part of
this section still accurate — those are still direct-entry, unchanged.

Intervals, Functional Refractory Periods, and Effective Refractory Periods are
Clinical State-specific data. Each Clinical State owns its own context,
measurements, and ERP-card presentation state.

Switching Clinical States must display that state's distinct:

- intervals
- Functional Refractory Periods
- Effective Refractory Periods
- Accessory Pathway 2 visibility state

No measurement values are shared globally between Clinical States.

### Clinical State creation

The action for creating a Clinical State is a compact button labeled `NEW`
beside the `ACTIVE CLINICAL STATE` label. The Case Structure rail is reserved
for Clinical State navigation.

## Effective Refractory Period Card

Effective Refractory Periods use a dedicated, compact, responsive card rather
than the generic single-measurement grid.

Each ERP is represented by three numerical input components:

`value 1 / value 2 / value 3 ms`

The inputs must remain visibly outlined and large enough for three-digit values.

ERP values are stored as predictable component keys:

- `erp.<field>.1`
- `erp.<field>.2`
- `erp.<field>.3`

For reports, summaries, exports, and diagnostic processing, trailing blank
components are omitted and values are normalized with slash separators.

Examples:

- `600`, `300`, `300` becomes `600/300/300`
- `600`, `300`, blank becomes `600/300`
- blank values are never converted to zero

## Rhythm-Specific ERP Display Rules

### Atrial Pacing

The ERP card badge displays `Antegrade`.

ERP fields appear in this order:

1. Fast Pathway
2. Slow Pathway
3. Accessory Pathway 1
4. Accessory Pathway 2, when added
5. AV Node
6. Atrial

Accessory Pathway 2 is hidden initially. An `Add` button appears next to
Accessory Pathway 1. Selecting it reveals Accessory Pathway 2 for the active
Clinical State and then removes the Add button.

### Ventricular Pacing

The ERP card badge displays `Retrograde`.

ERP fields appear in this order:

1. Accessory Pathway 1
2. Accessory Pathway 2, when added
3. Retrograde
4. Ventricular

Accessory Pathway 2 follows the same state-specific Add behavior.

### Presentation-state ownership

Whether Accessory Pathway 2 has been added belongs to the individual Clinical
State. One state may display it while another state does not. Switching states
must restore the ERP card exactly as it was configured for that state.

The full ERP field definitions remain available in the domain model. The ERP
card derives its visible fields and ordering through rhythm-specific display
rules rather than deleting fields from the underlying model.

<!-- INFRA-STATUS-2026-08-01 -->
## Infrastructure Status (as of 2026-08-01 — stale, see Status Summary)

**This snapshot is out of date.** Dozens of saves have landed since
(schema v2, Intervals rename, Clinical Reasoning additions, row locking,
and all the ordinary data entry in between), so the revision number and
row counts below no longer reflect production. Left as-is rather than
guessed-at — re-run `scripts/blob-status.mjs` for a current read rather
than trusting these numbers. The revision-index gap noted below hasn't
been specifically re-checked since.

- Local project folder, GitHub (`diagnosticpacing/diagnostic-pacing`), and
  Vercel are connected and verified in sync. Local `main` tracks
  `origin/main`; pushes trigger live Vercel deploys.
- `.env.local` includes `BLOB_READ_WRITE_TOKEN`, giving local scripts direct
  read access to the production Vercel Blob knowledge store. See
  `scripts/blob-status.mjs` for a read-only status check.
- Production knowledge base (as of revision 8): clinicalTerms 1 row,
  diagnoses 1 row, maneuverDefinitions 2 rows, maneuverResponseFields 1 row,
  maneuverResponseOptions 0 rows, clinicalReasoning 0 rows, references 1 row.
  Content is intentionally sparse/placeholder — the schema is still being
  iterated before real data entry begins in earnest.
- Known bug: the knowledge revision index (`index.json`) is missing entries
  for revisions 5 and 7 even though `current.json` points to revision 8 —
  likely a lost-update race when two saves land close together in
  `knowledge/service.ts`'s `createRevision()`. The revision files for 5/7
  are probably still intact in Blob; only the browsable history list is
  affected. Not yet fixed.
- Local `.data/knowledge/` (dev fallback storage) is stale test data from
  2026-07-27 and can be ignored or discarded.

<!-- KNOWLEDGE-ENGINE-DESIGN-2026-08-01 -->
## Knowledge Base Rules Engine (original design notes — implemented 2026-08-03)

**Superseded by `DIFFERENTIAL-ENGINE-V1-2026-08-03` below**, which built
almost exactly what this section proposed (hard/soft rules, Rule Group ID
AND-grouping, the Relevant-Diagnoses fallback for maneuver suggestion).
Left in place for the original reasoning; treat the section below as the
current, accurate description of what actually exists in code.

Design direction agreed at the time:

- The existing `clinicalReasoning` sheet's `effect` column (Supports /
  Against / Remains Possible / Excludes / Confirms) already implies a hybrid
  model: **hard rules** (Confirms/Excludes) decisively set a diagnosis's
  status regardless of other evidence, while **soft rules**
  (Supports/Against) contribute weighted evidence combined into a
  confidence percentage among diagnoses not already excluded.
- Real clinical reasoning is often conjunctive (finding A AND finding B
  together imply something neither implies alone). Proposed fix: add a
  rule-group id to `clinicalReasoning` rows. Rows sharing a group id must
  all be true (AND) before that group's effect applies; separate groups
  reaching the same diagnosis are alternative (OR) paths. This keeps the
  table flat and Excel-editable rather than requiring an expression parser.
- A related but separate concern: which maneuver to suggest next. This maps
  to a note left in production data — replace the `category` column on
  Maneuver Definitions with a "Diagnoses Effected" list (diagnosis IDs the
  maneuver discriminates between); suggest whichever maneuver's list most
  overlaps with diagnoses still active in the differential.
- Two other production-data notes flagged specific columns as unnecessary:
  `expansionNotes` on Maneuver Definitions (should instead be a
  reference-ID link into the References sheet) and `helpText` on Response
  Fields.
- The schema is expected to keep changing as real cases are worked through
  — this is intentionally iterative, not meant to be finalized up front.

**Next step when resuming:** walk through discriminating AVNRT from
orthodromic AVRT using a His-refractory PVC (the example already used in
the GUI mockup) step by step, and map each piece of that reasoning onto
hard-rule / soft-rule / rule-group-AND to pressure-test the model above
before committing to a schema change.

<!-- KNOWLEDGE-SCHEMA-V2-2026-08-02 -->
## Knowledge Base Schema v2 (implemented 2026-08-02)

Following a full revision pass (done in Numbers, exported to Excel, and
reviewed together), the knowledge base schema was rebuilt in
`app/admin/model.ts` and `knowledge/validation.ts`. Key changes from the
original schema:

- New **Clinical States** sheet (`clinicalStates`): a fixed vocabulary of
  pharmacologic/rhythm conditions (NSR, Brady, Tachy, CRM Paced, Iso On,
  Iso Washout, Iso Off, Adenosine) that a maneuver performance or
  Clinical Reasoning condition can be scoped to. **Update:** Iso Washout
  was subsequently removed from this vocabulary (NSR, Brady, Tachy, CRM
  Paced, Iso On, Iso Off, Adenosine is current) — it didn't correspond to
  a distinct enough pharmacologic state to justify its own row.
- **Diagnoses** gained `baseRank`: the fixed population-frequency fallback
  sort order (see the differential-hierarchy decision above).
- **Clinical Reasoning** gained `ruleGroupId` (rows sharing a group id must
  all be true together — AND — before the Differential Action applies) and
  `requiredClinicalState` (scopes a condition to results recorded under a
  specific Clinical State; combined with `ruleGroupId` this is how
  cross-state compound rules like "exclude if absent both on and off
  isoproterenol" get expressed as two grouped rows).
- `Differential Action` narrowed to three values: Supports, Excludes,
  Confirms (previously five, including Against/Remains Possible/a
  `strength` weight column). Confidence is no longer a percentage —
  diagnoses are ranked by count of satisfied Supports rules, pegged above
  by Confirmed and below by Excluded, with `baseRank` as the tiebreaker.
  See the differential-hierarchy decision above for the full display
  model.
- `ColumnDefinition` (the type describing each sheet's columns) now
  carries structured metadata — `required`, `idPrefix`, `options`,
  `multiSelect`, `lookup` — instead of only free-text guidance. The admin
  UI (`SpreadsheetTable.tsx`) uses this to render real dropdowns for
  fixed-option and cross-sheet-lookup columns alike (including
  multi-select as a checkbox picker) and to highlight required-but-blank
  cells in red. **Update:** this was still free-text/comma-separated at
  the time this note was written; live cascading dropdowns were built the
  next day (`ADMIN-UI-FEATURES-2026-08-02`, then fully audited and
  extended in `CASCADING-LOOKUP-AUDIT-2026-08-03`) — see the consolidated
  "Admin Auto-Populate & Cascading Lookup Reference" section below for how
  the mechanism actually works today.
- Two things worth flagging that got dropped in the revision and haven't
  been explicitly re-confirmed: the `enabled` Yes/No toggle (on Maneuver
  Definitions and Clinical Reasoning, for disabling a row without
  deleting it) and `storedValue` on Response Options (previously a
  separate machine-readable value distinct from the display label — its
  removal means Clinical Reasoning's `comparedValue` is free text with no
  controlled vocabulary to validate against, so a typo there will
  currently fail silently rather than error).
- The knowledge base now starts empty (`initialData` = `emptyData()`) —
  all content will be entered through the live admin site rather than
  seeded in code.

<!-- DIFFERENTIAL-HIERARCHY-2026-08-02 -->
## Differential Diagnosis Hierarchy (decided 2026-08-02; implemented 2026-08-03)

No percentage confidence. It was demo scaffolding from the original GUI
draft and doesn't reflect real clinical reasoning — dropped entirely.
Maneuver results only Support, Exclude, or Confirm a diagnosis (see
Clinical Reasoning's `differentialAction`), and the differential list is a
three-tier ranking built from that:

- **Confirmed** diagnoses are pegged to the top of the list, regardless of
  support count. Confirming one diagnosis does **not** remove or demote
  the others — multiple concurrent mechanisms are clinically possible, so
  every diagnosis not explicitly excluded stays visible and active.
- **Excluded** diagnoses are pegged to the bottom, still visible (not
  hidden) so the clinician can see why something was ruled out, per the
  transparency theme running through the rest of this design.
- **Possible** diagnoses (everything else) sort by count of satisfied
  Supports rules, highest first, reshuffling live as results come in.
  Ties fall back to a fixed population-frequency order (`baseRank` on the
  Diagnoses sheet) as the default/tiebreak position — no separate
  tiebreaker mechanism needed.
- Order *within* the Confirmed tier or *within* the Excluded tier doesn't
  matter; only which tier a diagnosis is in is meaningful.

<!-- MANEUVER-CARD-UI-2026-08-02 -->
## Maneuver Suggestion & Card UI (decided 2026-08-02; implemented 2026-08-03)

The current published site (the static GUI draft) is explicitly **not**
the model going forward. The redesigned workspace centers on an array of
maneuver cards/tiles:

- Card front: maneuver name, performed/not-performed, which Clinical
  State it was performed in (a maneuver can legitimately be performed
  more than once per case — e.g. once off isoproterenol, once on — so
  "performed" is tracked per maneuver-and-state pair, not as a single
  global flag), and a result summary if performed.
- Clicking a card flips it (animated) to reveal the response fields
  defined for that maneuver in the knowledge base, for data entry.
  Flipping it back triggers recalculation of the differential and
  refreshes the display.
- The array reorders dynamically by relevance, always laid out top to
  bottom, left to right — a single ordered array, not separate sections.
  Decision: **no separate "already performed" section.** Because a
  maneuver's relevance can legitimately return (e.g. still needed under a
  different Clinical State), a maneuver whose relevance has genuinely
  dropped to zero should just sink toward the bottom of the same ranked
  list rather than being bucketed away.
- Relevance/suggestion scoring proposal: primarily derive relevance from
  the Clinical Reasoning table — for each not-yet-exhausted maneuver,
  count how many of its reasoning rows touch a diagnosis still in the
  Possible tier, weighting Excludes/Confirms rows higher than Supports
  rows (a maneuver that could decisively exclude or confirm something is
  more valuable than one that can only nudge a support count). The
  coarser `relevantDiagnoses` column on Maneuver Definitions acts as a
  fallback signal for maneuvers that don't have Clinical Reasoning rows
  authored yet (which, as of this session, is effectively all of them —
  the knowledge base has almost no reasoning rows in it).
- **Still open, not resolved:** whether to go further than counting
  reasoning-row overlap — e.g. modeling each maneuver's possible *results*
  to estimate which next maneuver is most likely to be decisive
  (something closer to a value-of-information calculation) — versus
  keeping the simpler reasoning-row-count approach above. Revisit once
  there's enough real Clinical Reasoning data to tell whether the simple
  version is good enough.

<!-- ADMIN-UI-FEATURES-2026-08-02 -->
## Admin Site Feature Additions (implemented)

Beyond the schema itself, the admin spreadsheet editor (`app/admin/`)
gained:

- **Cross-sheet reference links.** Any cell whose value references a row
  in another sheet renders a small clickable chip below it; clicking
  switches tabs and scrolls to/briefly highlights the target row.
  Unmatched values show as a dim, non-clickable tag instead, so a
  dangling reference is visible at a glance.
- **Live cross-sheet lookup dropdowns.** Columns with `lookup` metadata
  render as real `<select>` dropdowns (or a checkbox picker for
  multi-select columns like Relevant Diagnoses / Required States /
  Available Terms), populated live from whatever's currently in the
  referenced sheet — no save/reload needed to see a newly added row show
  up as a choice elsewhere. Where a column is paired via
  `populatesColumn` (Maneuver Considered → Maneuver ID, Response Field
  Prompt → Field ID, Diagnosis Affected → Diagnosis ID, Reference Title →
  Reference ID), picking a name auto-fills the hidden ID column.
- **Column sorting.** Click a header to sort ascending, again for
  descending, a third time to clear. Numeric-aware (Base Rank/Order
  columns sort correctly rather than alphabetically), blanks always sort
  last. View-only — never changes saved row order or triggers unsaved
  changes.
- **Required-field highlighting.** Cells for a required-but-blank column
  get a red outline, driven by the same `required` metadata used for
  save-time validation.

A real bug was found and fixed this session: revisions saved under the
pre-Clinical-States schema were missing that sheet's key entirely (not an
empty array — absent), which crashed the save/load path. Every
loaded/saved workbook is now normalized (`normalizeWorkbookSheets` in
`app/admin/model.ts`) to guarantee all current sheet keys exist as
arrays, applied on both the read path and the write path (covering save,
restore-from-old-revision, and first-time initialization), with
`validateWorkbook` also hardened to tolerate a missing sheet defensively.

As of this session's end, all of the above is committed and pushed —
local `main`, GitHub, and the live Vercel deployment are in sync.

<!-- CASCADING-LOOKUP-AUDIT-2026-08-03 -->
## Cascading Lookup Columns — Full Audit (2026-08-03)

Every "pre-populated"/"auto-populated" column across all sheets, cross-
checked against the user's own spreadsheet column-instruction rows, to
confirm which ones should narrow their options based on a value already
picked earlier in the same row (`filterBy` in `app/admin/model.ts`), and
which are intentionally top-of-chain picks with nothing to narrow by:

- **Maneuver Definitions**: Relevant Diagnoses, Required States — first-
  tier multi-select picks (populated from Diagnoses/Clinical States).
  Nothing earlier in the row to scope by. Unscoped by design.
- **Response Fields**: Associated Maneuver is the first-tier pick
  (populated from Maneuver Definitions' Maneuver Name); Associated
  Maneuver ID auto-populates from it — the same shape as Response
  Options' Associated Maneuver Name/ID pair below.
- **Response Options**: Associated Maneuver Name is the first-tier pick
  (unscoped); Associated Maneuver Response Prompt is explicitly scoped
  to that maneuver's own fields (`filterBy` on `associatedManeuverId`) —
  this was the one column where the user's own spreadsheet notes spelled
  out the scoping ("...that also share the maneuver ID in the given
  row"), and the two-tier shape (pick maneuver, then pick from its
  fields only) is the reference pattern for everything below.
- **Clinical Reasoning**: Maneuver Considered is the first-tier pick
  (unscoped). Three downstream columns all cascade off it, each scoped
  to `maneuverId`: Response Field Prompt (narrowed to that maneuver's
  response fields), Diagnosis Affected (narrowed to the diagnoses listed
  in that maneuver's own Relevant Diagnoses), and Required Clinical
  State (narrowed to the states listed in that maneuver's own Required
  States). The latter two use a `viaSheet`/`viaListColumn` variant of
  `filterBy` because their allowed values live as a comma-separated list
  on the maneuver's own row rather than one row per option. Reference
  Title has no maneuver/diagnosis link anywhere in the References sheet
  to narrow by, so it stays a flat pick from all references — correctly
  unscoped, not an oversight. Compared Value is a plain text field per
  the user's own spec (not a lookup at all) — free text, not a dropdown.
- Every `lookup`/`populatesColumn` pair that auto-fills a hidden ID
  column (Maneuver Considered→Maneuver ID, Response Field Prompt→Field
  ID, Diagnosis Affected→Diagnosis ID, Reference Title→Reference ID,
  Associated Maneuver Name→Associated Maneuver ID, Associated Maneuver
  Response Prompt→Associated Field ID) is implemented and working.

Net: the cascading/narrowing behavior is fully implemented everywhere
the schema has data to narrow by. The remaining unscoped lookups are
unscoped because there's no "already selected" value in that row's
schema to narrow against, not because the work is incomplete.

<!-- AUTO-POPULATE-REFERENCE-2026-08-03 -->
## Admin Auto-Populate & Cascading Lookup — Reference (current mechanism)

The full picture, in one place, of how a column's menu selections get
scoped and how picking one column can fill in another. This mechanism
grew in pieces across several sessions (`ColumnDefinition` in
`app/admin/model.ts`, rendering logic in
`app/admin/components/SpreadsheetTable.tsx`) — this section is the
answer key rather than a change log entry.

Five `ColumnDefinition` fields drive it, and they combine:

- **`lookup: { sheet, column }`** — this column's value comes from
  another sheet's column rather than free typing. Renders as a `<select>`
  (or a checkbox picker if `multiSelect` is also set), live-populated
  from whatever's currently in that sheet — no save/reload needed to see
  a row added elsewhere show up as a choice.
- **`populatesColumn: "otherKey"`** — selecting a value in this column
  also auto-fills the named sibling column in the same row, using the
  matched row's *primary ID column* (whichever column has an `idPrefix`)
  by default. This is how a human-picks-a-name column silently keeps a
  machine-stable ID column in sync (e.g. Maneuver Considered → Maneuver
  ID).
- **`populatesColumnFrom: "columnKey"`** — overrides which column of the
  matched row gets copied, when the default (the primary ID) isn't what
  the paired column should mirror. Only Interval Considered → Interval
  Name sets this today (copies the interval's `name`, not its `IID-`
  code, since nothing else references an interval by ID).
- **`filterBy: { ownColumn, matchColumn, viaSheet?, viaListColumn?, optional? }`**
  — narrows this column's option list to rows relevant to a value already
  picked earlier in the same row, rather than showing every row in
  `lookup.sheet`:
  - Base form (`ownColumn`/`matchColumn` only): only include rows from
    `lookup.sheet` whose `matchColumn` equals this row's own
    `ownColumn` value. One row in the target sheet per allowed option
    (e.g. Response Field Prompt narrowed to fields whose
    `associatedManeuverId` matches this row's `maneuverId`).
  - `viaSheet`/`viaListColumn` variant: the allowed values instead come
    from a **comma-separated list column** on the matching row in
    `viaSheet`, rather than one target row per option (e.g. Diagnosis
    Affected narrows to whatever's in the chosen maneuver's own
    `relevantDiagnoses` list). `lookup.sheet` still supplies the actual
    option rows, just filtered down to that allowed set, so reference
    chips keep pointing at the right sheet.
  - `optional: true`: if the prerequisite (`ownColumn`) is blank, fall
    back to the full unfiltered list instead of blocking the column
    entirely. Used where a column is only *sometimes* scoped by another
    — Diagnosis Affected and Required Clinical State narrow off
    `maneuverId` when a row uses Maneuver Considered, but show every
    option when the row uses Interval Considered instead (which has no
    maneuver to narrow by). Without `optional`, a blank prerequisite
    shows zero options and a "Pick X first" placeholder — the correct
    behavior for Response Field Prompt, which is only ever meaningful
    for a maneuver-based row and should stay blocked without one.
- **`disabledWhenFilled: ["columnKey", ...]`** — independent of lookup
  scoping: this column becomes disabled (greyed out, blocked from
  editing, with a "Clear X to use this" note) whenever any named sibling
  column already holds a value. This is how Maneuver Considered/Maneuver
  ID/Response Field Prompt/Associated Field ID and Interval
  Considered/Interval Name stay mutually exclusive — picking one path
  locks out the other until it's cleared.

Current column-by-column map:

| Sheet | Column | lookup | filterBy | populatesColumn(From) |
|---|---|---|---|---|
| Maneuver Definitions | Relevant Diagnoses, Required States | ✓ (unscoped, first-tier) | — | — |
| Response Fields | Associated Maneuver | ✓ (unscoped, first-tier) | — | → Associated Maneuver ID |
| Response Options | Associated Maneuver Name | ✓ (unscoped, first-tier) | — | → Associated Maneuver ID |
| Response Options | Associated Maneuver Response Prompt | ✓ | on `associatedManeuverId` | → Associated Field ID |
| Clinical Reasoning | Maneuver Considered | ✓ (unscoped, first-tier) | — | → Maneuver ID |
| Clinical Reasoning | Response Field Prompt | ✓ | on `maneuverId` (blocking, not optional) | → Field ID |
| Clinical Reasoning | Interval Considered | ✓ (unscoped, first-tier) | — | → Interval Name (via `populatesColumnFrom: "name"`) |
| Clinical Reasoning | Diagnosis Affected | ✓ | on `maneuverId`, `optional`, via Maneuver Definitions' `relevantDiagnoses` | → Diagnosis ID |
| Clinical Reasoning | Required Clinical State | ✓ | on `maneuverId`, `optional`, via Maneuver Definitions' `requiredStates` | — |
| Clinical Reasoning | Reference Title | ✓ (unscoped — no maneuver/diagnosis link exists on References to narrow by) | — | → Reference ID |

Every unscoped ("first-tier") lookup in this table is unscoped by
design, not by omission — there's nothing earlier in that row to narrow
against. If a future column ever needs scoping and the schema doesn't
yet have an "already picked" value to key off of, that's a schema gap
to raise, not a UI gap to silently work around.

<!-- MANEUVER-CARD-GRID-2026-08-03 -->
## Maneuver Card Grid — Working Draft (implemented 2026-08-03)

The main workspace page's "Pacing maneuvers" panel — previously a single
hardcoded recommendation plus a static 3-item alternatives list — is now
a live card grid driven by the knowledge base, implementing the card-UI
decision recorded above under "Maneuver Suggestion & Card UI":

- **New public API**: `GET /api/knowledge/public` (unauthenticated) —
  the existing `/api/knowledge` route correctly requires an admin
  session since it can write; this read-only sibling lets the public
  page fetch the same knowledge base to render maneuvers.
- **`app/maneuvers/knowledge.ts`**: parses the raw sheets into a
  maneuver → response-fields → response-options catalog (fields sorted
  by Order, options sorted by Order within each field), tolerating
  rows with missing linking IDs rather than crashing.
- **`app/maneuvers/ManeuverCard.tsx`**: the flip card. Front face shows
  the maneuver name, a performed/not-performed badge scoped to the
  active Clinical State, a short result summary, and a note when it's
  also been recorded under other Clinical States. Clicking flips it
  (CSS 3D transform, `.maneuverCard`/`.maneuverCardFlipper` in
  globals.css) to a data-entry form built from that maneuver's own
  response fields — one control per Input Type: Checkbox, Single/Multi
  Select Dropdown (options pulled from that field's own Response
  Options), Number Field (with units), or Text Field(s).
- **`app/clinical/model.ts`**: replaced the unused `ManeuverPlaceholder`
  scaffold (a `{performed, suggested}` string-list pair that nothing
  ever read) with a real `ManeuverPerformance` record — maneuverId,
  a `values` map keyed by Field ID, and a timestamp — stored per
  Clinical State via `findPerformance`/`upsertPerformance`. A maneuver
  performed under two different Clinical States gets two independent
  records, matching the "performed" concept from the card-UI decision.
- **Ordering**: single flat grid, no separate "already performed"
  section — cards simply reorder by relevance, exactly as decided
  above. Relevance currently uses the documented fallback only (count
  of the maneuver's own Relevant Diagnoses still active/non-excluded in
  the differential) — the fuller Clinical-Reasoning-weighted algorithm
  is still the open item noted above and needs real reasoning-rule data
  to evaluate against before it's worth building.

**Resolved same stretch of work:** the limitation originally noted here
— that relevance scoring ran against a static demo diagnoses array — no
longer applies. `DIFFERENTIAL-ENGINE-V1-2026-08-03` below replaced that
array with a real, live-computed differential, so both this card grid's
relevance ordering and the differential diagnosis rail itself now read
from the same knowledge-base-driven result.

<!-- RESIZABLE-SIDE-RAILS-2026-08-03 -->
## Resizable Side Rails (implemented 2026-08-03)

The Clinical States (left) and Differential Diagnosis (right) rails on
the main workspace page are now independently user-resizable, each with
a drag handle at its inner edge, using the same drag pattern as the
admin spreadsheet's column-resize handles. Each rail's width is a CSS
variable (`--clinical-state-rail-width`, `--diagnosis-monitor-width`)
set via inline style on `.appShell`, clamped to 160-480px (and capped
at ~32% of viewport width per side so the two rails can't crowd out the
center workspace), and persisted per-rail in `localStorage` across
reloads. The center workspace's margins reference the same two
variables, so it keeps pace automatically. No card-level changes were
needed — both Clinical State cards and differential diagnosis cards
already used ellipsis truncation and flexible grid tracks rather than
fixed pixel widths, so they reflow to whatever width a rail is dragged
to.

<!-- INTERVALS-AND-CLINICAL-REASONING-2026-08-03 -->
## Intervals Rename + Clinical Reasoning Interval Support (implemented 2026-08-03)

Two related changes to the knowledge base schema:

- **"Clinical Terms" renamed to "Intervals"** everywhere it's shown to
  the user (tab label, sheet label/description, exported workbook's
  worksheet name, column labels — "Term ID" is now "Interval ID").
  The underlying `SheetId` key (`clinicalTerms`) and column key
  (`termId`) were deliberately left unchanged, since production Blob
  data already exists under those keys — renaming them would have
  required a migration path for no real benefit, since only the label
  was described as "more accurate," not the internal identifiers. The ID
  *prefix* was originally left unchanged too (`TID-`), but was later
  changed to `IID-` — see `INTERVAL-ID-PREFIX-2026-08-03` below.
- **Clinical Reasoning can now evaluate an Interval directly**, not
  just a maneuver's response field. Two options were weighed: (A) add a
  parallel column pair for intervals, or (B) merge Maneuver Considered
  and Interval Considered into one picker whose second-tier column
  would have to behave differently depending on which type was picked.
  (B) was rejected — a maneuver's second-tier column narrows to that
  maneuver's own response fields, but an interval has no equivalent
  "fields" to narrow to, so the column would need genuinely different
  behavior per row, which is exactly the kind of column-type mess
  flagged as a risk going in.
  Went with (A): added `Interval Considered` (lookup → Intervals'
  `name`) and an auto-populated `Interval ID`, mirroring the existing
  `Maneuver Considered`/`Maneuver ID` pair, placed right after
  Associated Field ID and before Operator. A row uses one pair or the
  other — for an interval-based row, Response Field Prompt/Associated
  Field ID simply stay blank, since Operator/Compared Value already
  compare directly against whatever's Considered with no field
  indirection needed. Every downstream column (Operator, Compared
  Value, Differential Action, Diagnosis Affected, Explanation,
  Reference, Rule Group ID, Required Clinical State, Rule Description)
  needed no changes at all.
- Validation now requires exactly one of Maneuver Considered / Interval
  Considered per row (flags both blank or both filled), plus a
  referential-integrity check on the new Interval ID against the
  Intervals sheet.

<!-- CLINICAL-REASONING-MUTUAL-EXCLUSION-2026-08-03 -->
## Maneuver/Interval Mutual Exclusion + Interval Name (implemented 2026-08-03)

Two follow-ups to the Interval Considered addition above, same day:

- **Mutual exclusion is now enforced live in the admin UI**, not just
  flagged after the fact by validation. New `disabledWhenFilled`
  column metadata: a column becomes disabled (greyed out, blocked from
  editing, with a "Clear X to use this" note) whenever a named sibling
  column already holds a value in the same row. Applied to both
  directions — Maneuver Considered, Maneuver ID, Response Field Prompt,
  and Associated Field ID all disable while Interval Considered or
  Interval Name holds a value, and vice versa. This was scoped wider
  than literally "the two Considered columns" on purpose: leaving
  Maneuver ID/Response Field Prompt independently editable would have
  let a row combine both paths anyway by going around Maneuver
  Considered directly, defeating the point.
- **Interval ID renamed to Interval Name**, and changed to actually
  mirror the interval's Name rather than its ID code — unlike
  Maneuver ID (a real foreign key other sheets reference), nothing
  references an interval by ID, so there's no reason for the
  auto-populated companion column to show a code instead of a readable
  name. This required a real fix, not just swapping which column the
  lookup reads: the auto-populate logic previously always copied the
  target sheet's *primary ID column* on selection, regardless of what
  the paired column's own lookup pointed at. Added
  `populatesColumnFrom` so a column can name which field of the matched
  row to copy instead of assuming the primary ID. Every other existing
  pair (Maneuver Considered → Maneuver ID, Diagnosis Affected →
  Diagnosis ID, Reference Title → Reference ID, etc.) doesn't set this,
  so all of them keep defaulting to the primary ID exactly as before —
  nothing about their existing behavior changed.

**Bug found and fixed same day:** Diagnosis Affected and Required
Clinical State both narrow their options via `filterBy` off the
maneuver considered, but that `filterBy` unconditionally blocked the
column ("Pick Maneuver ID first") whenever the prerequisite was blank
— including on rows that correctly use Interval Considered instead,
which has no maneuver and nothing to narrow by. Added
`filterBy.optional`: a blank prerequisite now falls back to the full
unfiltered list instead of blocking, so an interval-based reasoning row
can affect any diagnosis and reference any Clinical State exactly as
freely as a maneuver-based one. Response Field Prompt intentionally
keeps the old blocking behavior, since it's only ever meaningful for a
maneuver-based row.

<!-- DIFFERENTIAL-ENGINE-V1-2026-08-03 -->
## Differential Diagnosis Engine, first pass (implemented 2026-08-03)

The main GUI's Differential Diagnosis panel previously showed a
hardcoded, fake `diagnoses` array (four static entries with a made-up
percentage confidence bar). It's now driven by a real engine
(`app/differential/engine.ts`, `evaluateDifferential()`) that reads the
Diagnoses and Clinical Reasoning sheets straight from the public
knowledge API and evaluates them against the live case record.

Rule evaluation, per row: a Clinical Reasoning row's condition is
satisfied if, for a maneuver-based row, any recorded performance of
its Maneuver ID has a value for its Field ID that passes the row's
Operator against its Compared Value (`Is Checked` / `Is Unchecked` /
`=` / `≠` / `>` / `<`, numeric-aware when both sides parse as numbers);
for an interval-based row, the same check runs against a matching
measurement field's value instead of a maneuver's recorded result. A
row with no recorded data for its condition is neither satisfied nor
unsatisfied in a way that fires an action — silence isn't evidence.

Rule Group ID AND-grouping is real: rows sharing a Rule Group ID must
*all* be satisfied before any of their individual Differential Actions
apply; a blank Rule Group ID means the row stands alone (OR against
everything else). Per-diagnosis status follows the documented
hard-rule/soft-rule precedence: any fired `Confirms` row makes the
diagnosis Confirmed; otherwise any fired `Excludes` row makes it
Excluded; otherwise it's Possible, ranked by how many `Supports` rows
fired. The three-tier sort (Confirmed, then Possible by support count
then Base Rank, then Excluded) matches the
`DIFFERENTIAL-HIERARCHY-2026-08-02` decision exactly — no percentage
confidence anywhere. The panel's "Why?" button now shows the real
concatenated explanation/rule-description text from whichever Clinical
Reasoning rows fired for that diagnosis, or a plain "no rules have
fired yet" message when none have.

**Two scope simplifications, both intentional and disclosed rather
than silently cut:**

- **Required Clinical State is not enforced.** A reasoning row's
  condition is checked existentially across every Clinical State in
  the case, not restricted to the specific state the row names. The
  knowledge base's Clinical States sheet is a fixed abbreviation
  vocabulary (`NSR`, `Iso On`, etc.) with no formal link yet to the
  GUI's per-Clinical-State context fields (phase/rhythm/sedation/drug
  levels are free text or a different option set) — building that
  bridge is future work, not something to fake now.
- **Interval-to-measurement matching is a name heuristic, not a formal
  ID join.** The Intervals sheet has no field-level identifier that a
  measurement field could reference, so `findMatchingMeasurementField()`
  normalizes both the reasoning row's Interval Name and each rhythm's
  measurement field labels (stripping "interval"/"ERP"/"FRP"/punctuation)
  and matches on equality, falling back to substring containment. Good
  enough for a first pass with a small, hand-entered vocabulary; will
  need to become a real join once the knowledge base has enough rows
  for name collisions to matter.

Both limitations narrow what today's still-small knowledge base can
express, not what the engine architecturally supports — neither
requires a rework to close later, just more precise data on one side
of the join.

<!-- ADMIN-ROW-LOCKING-V1-2026-08-03 -->
## Admin Row Locking (implemented 2026-08-03)

Motivation: as the knowledge base grows, the main risk in the admin
spreadsheet editor isn't concurrent-edit conflicts (single admin
user) — it's fat-fingering a cell in a long table: a wrong dropdown
pick, an accidental clear, editing the wrong row. Row locking is a
deliberate, opt-in guard against that, not a permissions system.

Every row in every sheet can be locked or unlocked via a padlock
button in a row-action column. Originally placed next to the delete
button on the right; moved to the left, at the very start of the row,
on 2026-08-04 for visibility (`app/admin/components/SpreadsheetTable.tsx`
— purely a JSX/`gridTemplateColumns` reorder, no CSS or behavior
changes, since the lock styling already targeted elements by class
rather than by position). The row-number (`#`) column that used to sit
to its left was removed the same day (see
`ADMIN-HIDE-ROW-NUMBERS-2026-08-04` below), so the lock button is now
the leftmost thing in every row. A locked row disables every control in that row — reusing
the same disabling mechanism already built for the Maneuver/Interval
`disabledWhenFilled` mutual exclusion — and gets a deliberately new,
distinct visual treatment (a violet diagonal hatch + top/bottom band,
`--locked` in the palette) so it reads as "sealed" rather than as
another shade of the existing grey "disabled by a sibling field" look
or the red "required but empty" look. Deleting a locked row is also
blocked; unlocking is the only way to edit or delete it.

Lock state lives as `__locked` row metadata (alongside the existing
`__rowId`), not a real column — it's an editing-safety concern, not
domain content, so it's excluded from the exported Excel workbook and
from the columns considered by cross-sheet lookups. `validateWorkbook`'s
generic per-row check now allows `__locked` as a recognized internal
key so a locked row doesn't fail validation as having an "unexpected
column."

New rows default unlocked, so a row can be freely iterated on while
it's being built. Locking is intentionally coupled to the same
completeness bar as saving: clicking the lock button runs a new
`validateRow(sheetId, row, workbook)` (extracted from
`knowledge/validation.ts`, reusing `validateWorkbook`'s exact rules —
required fields, ID prefix, duplicate ID within its sheet, and
whatever sheet-specific cross-sheet reference checks apply) and blocks
the lock with the specific issues if the row wouldn't pass save. This
makes the guarantee "if a row can be locked, it will not block a save"
hold by construction, not by two independently-maintained rule sets
happening to agree. `validateRow` is a deliberate reimplementation
rather than a shared-loop refactor of `validateWorkbook`'s internals:
`validateWorkbook`'s duplicate-ID check is order-dependent (only the
*second* occurrence of a duplicate is flagged, correct for a one-pass
whole-workbook report), while `validateRow` checks a row against every
other row in its sheet regardless of order — stricter, which only ever
makes locking harder to obtain, never easier, so it can't produce a row
that locks cleanly but then fails to save. Unlocking never runs
validation, since it only ever loosens things.

Saving locks every row in every sheet, not just the one being edited.
This is the primary way rows end up locked in practice — the manual
per-row toggle exists for locking something before you're ready to
save everything else. The save flow already gates on
`assertValidWorkbook` passing for the whole workbook before anything is
persisted, so by the time a save succeeds every row has already met
the same bar the manual lock check enforces; locking is applied to a
local copy of the data right before the request is sent, and only
adopted into React state if the server confirms the save succeeded —
a rejected save (validation failure or revision conflict) leaves the
editor's in-progress state, including whatever was still unlocked,
completely untouched.

<!-- BROWSER-TAB-TITLES-2026-08-03 -->
## Browser Tab Titles (implemented 2026-08-03)

Both the main workspace and admin editor were still showing the Next.js
starter-template default ("Create Next App") as their browser tab
title/description — never actually set. `app/layout.tsx`'s root
`metadata` now reads `"DiagnosticPacing.org"` with a real description;
`app/admin/layout.tsx` adds its own `title: "Knowledge Base Admin"`
(Next.js layout metadata is per-segment, so the admin route's title
overrides the root one there without needing a shared title template).

<!-- INTERVAL-ID-PREFIX-2026-08-03 -->
## Interval ID Prefix Changed to IID- (implemented 2026-08-03)

The Intervals sheet's `termId` column (labeled "Interval ID" since the
Clinical Terms → Intervals rename) required a `TID-` prefix — a leftover
from before the rename, no longer matching the sheet's own name.
Changed `idPrefix` in `app/admin/model.ts` to `IID-` (e.g. `IID-001`),
consistent with every other sheet's ID column matching its own name
(`MID-`, `FID-`, `OID-`, `DID-`, `SID-`, `CRID-`, `REFID-`).

**Any existing Interval rows already saved under `TID-` will now fail
save/lock validation** (the `idPrefix` check requires the value to start
with the current prefix) until their IDs are manually renamed to
`IID-...` in the admin editor — this wasn't a live concern to check
before making the change, since the Intervals sheet was still
effectively empty/placeholder as of the last confirmed knowledge base
snapshot (see the now-stale `INFRA-STATUS-2026-08-01` note), but is
worth knowing if a save unexpectedly flags existing rows after this
change.

<!-- NATIVE-SELECT-DARK-THEME-2026-08-03 -->
## Native Select Dropdown Popups (implemented 2026-08-03)

The app is dark-only, but never told the browser that. A `<select>`'s
closed control was themed correctly (dark background, light text via
this stylesheet), but its *open dropdown popup* is drawn by the browser
itself using its default light UI — white popup background — while
still inheriting this stylesheet's light `--text` color for the option
text, producing white-on-white (reported on the clinical workspace's
Phase/Rhythm/Sedation selects, but the same root cause applied
everywhere a native `<select>` is used: admin lookup/option-list
dropdowns, and maneuver card response fields).

Fixed at the style-guide level rather than per-instance: `color-scheme:
dark` added to `:root` tells the browser to draw its own native chrome
(select popups, scrollbars, spin buttons) using its dark UI variant
site-wide. Backed up with an explicit `option { background: var(--raised);
color: var(--text); }` rule on each select context
(`.toolbarField select`, `.adminCell select`, `.maneuverField select`),
since Safari in particular has been inconsistent about fully re-theming
a select popup from `color-scheme` alone.

<!-- REFRACTORY-PERIODS-V2-2026-08-03 -->
## Refractory Periods Move From Direct Entry to Maneuver Results (implemented 2026-08-03, simplified same day)

Functional and Effective Refractory Periods (FRP/ERP) used to be typed
directly into a dedicated card on the main workspace — hardcoded fields
in `workspaceConfigurations` (`app/clinical/model.ts`), completely
disconnected from which maneuver actually produced them. That never
matched reality: an ERP or FRP is the *output* of performing a specific
pacing maneuver (an extrastimulus protocol, an overdrive pace), not an
ambient value a clinician just happens to observe. Settled on: refractory
periods are recorded as ordinary Maneuver Response Fields, entered on the
back of whichever maneuver produces them, alongside that maneuver's other
results — not as their own dedicated maneuver, since a single maneuver's
card can (and often will) produce more than one named refractory period
result mixed in among unrelated fields.

**V1 briefly used a Component # column — replaced same day.** The first
build gave each component (the "600," the "400," the "300" in a 600/400/300
result) its own separate Field ID, tagged with a Component # column to
say which position it filled. That turned out to be more specificity than
useful: it forced whoever populates the knowledge base to invent 2-3
separate meaningful prompts per refractory period, and it meant Clinical
Reasoning's Response Field Prompt picker would show 2-3 entries for what a
clinician thinks of as one finding. The design was revised the same day
to the simpler model described below, before any real knowledge base
content had been entered against the old shape.

**Current model: one field IS the whole refractory period.** Functional
Refractory Periods are always a single numeric value. Effective
Refractory Periods are always expressed as a series of 2-3 numbers (e.g.
400/240 or 600/400/380) — this is a fixed clinical convention, not a
per-field choice, so the GUI always renders exactly 3 boxes for an
Effective field with the 3rd treated as optional/blank when only 2
extrastimuli were performed. There's still no delimited string to parse
anywhere — the boxes are separate inputs — but they now save under one
admin-defined Field ID instead of 2-3.

**Why this needed knowledge-base content, not just GUI logic.** The
mapping from "this field, on this maneuver" to a clinically meaningful
label like "Retrograde AP1 ERP" is itself domain knowledge, not
presentation formatting — the same reason Clinical Reasoning rules live
in a spreadsheet instead of as `if` statements in code. A key wrinkle
surfaced during design: the same anatomical structure can require both a
different Type *and* a different Direction depending entirely on which
maneuver measured it (the Accessory Pathway's FRP from atrial pacing is
Antegrade AP FRP; from ventricular overdrive pacing it's Retrograde AP
ERP) — so Direction can't be inferred from the structure name or from
the maneuver's own name, it has to be its own explicit, admin-set tag.

**Schema (`app/admin/model.ts`, Maneuver Response Fields):** three
fixed-`options` columns, all `required` (with "n/a" as a real, selectable
answer for fields that aren't part of a refractory period — the same
pattern already used by Units and Available Terms):

- Refractory Period Type — n/a / Functional / Effective (this alone
  determines box count: Functional = 1, Effective = 3-with-3rd-optional)
- Refractory Period Direction — n/a / Antegrade / Retrograde (n/a is a
  genuine answer here, not just "not applicable" — Atrial and
  Ventricular refractoriness aren't meaningfully antegrade or retrograde)
- Refractory Period Structure — n/a / Atrial / AV Node / Fast Pathway /
  Slow Pathway / Accessory Pathway 1 / Accessory Pathway 2 / Ventricular

No new sheet. `(Type, Direction, Structure)` must be unique across the
*entire* workbook, not just within one maneuver — enforced in both
`validateWorkbook` and `validateRow` (`knowledge/validation.ts`) — since
nothing else stops two different maneuvers' fields from both claiming to
be "Effective / Retrograde / Accessory Pathway 1," and the derived
display has no rule for picking a winner if that happens.

**Storage.** A Functional field's value lives directly under its own
Field ID in `ManeuverPerformance.values`, identical to any other Number
Field. An Effective field's first box also uses the bare Field ID; its
2nd and 3rd boxes use suffixed keys (`FID-042.2`, `FID-042.3`) — see
`refractoryPeriodComponentKey()` in `app/refractoryPeriods/knowledge.ts`,
the single source of truth for this convention, used by both the
maneuver card (writing) and the catalog (reading).

**Catalog + derivation (`app/refractoryPeriods/knowledge.ts`):**
`buildRefractoryPeriodCatalog()` now does a plain filter+map over every
tagged response field — one field, one definition, no cross-field
grouping needed, since a field is never shared across a refractory
period anymore. `composeRefractoryPeriodLabel()` builds the display
label from the three tag dimensions (e.g. Effective + Retrograde +
Accessory Pathway 1 → "Retrograde AP1 ERP"). `formatRefractoryPeriodValue()`
reads the field's owning maneuver's performance for a given Clinical
State and slash-joins its values (1 for Functional, up to 3 for
Effective), trailing blanks dropped.

**Maneuver card UI (`app/maneuvers/ManeuverCard.tsx`):** a Functional-
tagged field needs no special treatment at all — it's rendered by the
same "Number Field" control as any other field. An Effective-tagged
field renders via `RefractoryPeriodTripletControl`, always 3 boxes for
that one field, wired to the suffixed storage keys above.

**Main GUI (`app/page.tsx`):** unchanged by this same-day simplification
— it only ever consumed `buildRefractoryPeriodCatalog()`'s output as
already-formatted strings, so the "Refractory Periods" panel (same
position, directly under Intervals, showing only definitions with an
actual recorded value for the active Clinical State) needed no code
changes.

**Differential engine (`app/differential/engine.ts`):** no built-in
comparison support for a multi-value Effective field, by explicit
decision rather than oversight — the user's own assessment is that
Clinical Reasoning rules are unlikely to ever compare directly against
an ERP series (exclusions tend to rest on more solid criteria than a raw
ERP comparison), and that if a rule ever did need one, values could only
be compared in like terms anyway (same drive train, same number of
extrastimuli), which is more complexity than it's worth building
speculatively. Practically: a Clinical Reasoning row referencing an
Effective field's Field ID directly would read its bare-Field-ID value —
i.e. the first/baseline box only, per the storage convention above —
which is a safe, harmless default (never a wrong comparison, just an
incomplete one) rather than a trap, since no such rules are expected to
be authored in the first place. A Functional field's Field ID always
reads correctly since it only ever has one value.

**Deliberately out of scope:**

- **No rhythm-based filtering on the panel.** The old direct-entry card
  only showed ERP slots relevant to the active rhythm. The new panel
  shows every refractory period with a recorded value for the active
  Clinical State, full stop — "has this actually been recorded here" is
  a more honest signal than an assumed rhythm mapping now that the data
  comes from maneuvers instead.

**Fallout: production data still had the old Component # column.** Right
after this same-day simplification shipped, saving the knowledge base
started failing with `Unexpected column "refractoryperiodcomponent"` —
some row saved to production Blob storage before the column was removed
still carried it, and `validateWorkbook`'s "Unexpected column" check
(correctly) rejected it on every save attempt, with no way to clear it
from the admin UI since there's no cell for a column that no longer
exists in the schema. Fixed generally rather than by hand-editing that
one row: `pruneUnknownColumns()` (`app/admin/model.ts`) now runs right
after `normalizeWorkbookSheets()` in `knowledge/service.ts`'s
`createRevision`, stripping any row key that isn't `__rowId`, `__locked`,
or a column the current schema actually defines, logging each drop
server-side. This is the mirror image of what `normalizeWorkbookSheets`
already did for a *missing* sheet (fill it in rather than crash) — here,
a *removed* column heals itself on the next save instead of blocking
every save indefinitely. Since every save creates a new, previous-
revision-preserving entry in the workbook's revision history, nothing
here is unrecoverable if a stripped value ever turns out to have mattered.

<!-- RESPONSE-FIELDS-MANEUVER-NAME-2026-08-04 -->
## Response Fields: Associated Maneuver Name Auto-Populate (implemented 2026-08-04)

Response Fields' `associatedManeuverId` was a lookup dropdown but still
asked the admin to pick a maneuver *by ID* — the one first-tier pick in
the whole knowledge base still using an ID rather than a human-readable
name, inconsistent with every other first-tier maneuver pick (Maneuver
Considered, Associated Maneuver Name on Response Options). Added
`associatedManeuverName` ("Associated Maneuver," lookup on Maneuver
Definitions' `maneuverName`) immediately to the left of
`associatedManeuverId`, with `populatesColumn: "associatedManeuverId"`
so picking the name auto-fills the ID — the exact same two-column shape
already used by Response Options' Associated Maneuver Name/ID pair, no
new mechanism needed. `associatedManeuverId` itself is unchanged other
than its `modelUse` text now noting it auto-populates.

<!-- MANEUVER-BASE-RANK-2026-08-04 -->
## Maneuver Definitions: Base Rank (implemented 2026-08-04)

The maneuver card grid (`MANEUVER-CARD-GRID-2026-08-03`) has always
reordered by relevance score, but ties (equal relevance — currently the
common case, since real Clinical Reasoning data is still sparse and the
fallback score is coarse) fell back to whatever order the knowledge base
happened to return rows in, with no way for an admin to control it.
Added `baseRank` to Maneuver Definitions (`app/admin/model.ts`),
identical in spirit to the Diagnoses sheet's existing `baseRank`: a
required, fixed, admin-set number, lower first. `app/page.tsx`'s
`sortedManeuverCatalog` sort now uses it as the tiebreaker after
relevance score, same two-tier pattern as the differential engine's
diagnosis sort (`DIFFERENTIAL-HIERARCHY-2026-08-02`).

This gives direct control over the grid's default layout right now,
since ties currently dominate — and remains exactly what it says on the
tin (a *tiebreaker*, not an override) once real relevance scoring
differentiates maneuvers further: a maneuver that's actually more
relevant to the live differential still sorts above one with a "better"
Base Rank. `ManeuverDefinition.baseRank` (`app/maneuvers/knowledge.ts`)
parses a blank/invalid value to `Number.MAX_SAFE_INTEGER` (sorts last)
rather than `0` (which would misleadingly promote it to first), mirroring
the same unparseable-sorts-last convention `parseDiagnosis`'s `baseRank`
parsing already used in `app/differential/engine.ts`.

<!-- ADMIN-HIDE-ROW-NUMBERS-2026-08-04 -->
## Admin Spreadsheet: Row Numbers Removed (implemented 2026-08-04)

The `#` row-number column at the start of every admin sheet is gone —
purely cosmetic, no data or behavior it exposed anywhere else.
`app/admin/components/SpreadsheetTable.tsx`: removed the `48px` track
from `gridTemplateColumns`, the `#` header cell, and each row's
`adminRowNumber` div; the empty-state row's `gridColumn` span dropped
from `+3` to `+2` extra tracks to match. `rowIndex` itself is untouched
and still backs every row's accessibility labels (`Lock row 3`, `Delete
row 3`, `${column.label}, row 3`) — only the visible numeral is gone.
`app/globals.css`: pruned every now-dead `.adminRowNumber`/
`.adminRowNumberHeader` selector (some shared a rule with
`.adminDeleteCell`/`.adminDeleteHeader`, trimmed rather than deleted
outright; a couple were `.adminRowNumber`-only and fully removed).
The lock button (`ADMIN-ROW-LOCKING-V1-2026-08-03`, moved left the same
day) is now the first thing in every row.

<!-- DIFFERENTIAL-STATUS-LABEL-2026-08-04 -->
## Differential Status Label: "Possible" Displays as "Included" (implemented 2026-08-04)

Display-only relabel on the main GUI's differential diagnosis cards:
the middle tier now reads "Included" instead of "Possible" — a
diagnosis in that tier hasn't been ruled out (it's included in the
active differential), which reads more clearly next to "Confirmed" and
"Excluded" than "Possible" did. `app/page.tsx` adds a
`DIFFERENTIAL_STATUS_LABEL` map (`Confirmed`→"Confirmed",
`Possible`→"Included", `Excluded`→"Excluded") and renders through it
instead of the raw status string. The internal `DifferentialStatus`
type/literal, the three-tier sort logic, and the CSS class the badge
gets (still `result.status.toLowerCase()` → `"possible"`) are all
unchanged — same label-only precedent as the Clinical Terms → Intervals
rename (`INTERVALS-AND-CLINICAL-REASONING-2026-08-03`): only what the
clinician reads changed, not the internal vocabulary Clinical Reasoning
rules, engine logic, or code comments use.

<!-- CLINICAL-STATE-COMPACT-SUMMARY-2026-08-04 -->
## Clinical State Display: Real Details Instead of "Clinical State N" (implemented 2026-08-04)

The main GUI labeled the active Clinical State as "Clinical State 1,"
"Clinical State 2," and so on — an ordinal with no clinical meaning,
shown on every maneuver card's "Performed —" badge, the maneuver grid's
subhead, and the Refractory Periods panel's empty-state text. Working
backwards from the actual workflow: what a clinician needs to know
about a state is what it *was* — Phase (pre/post-ablation), whether
isoproterenol was running, and sedation level — not which number it
happened to be created in. The Clinical States rail cards already
showed this detail; the rest of the GUI didn't.

**New helpers (`app/clinical/model.ts`):** `phaseAbbreviation()` (Pre /
Post / Post 2), `sedationAbbreviation()` (Awake / Sedated / GA — the
exact three-way shorthand requested), and `clinicalStateSummary()`,
which composes all three plus the existing `medicationSummary()` (Iso
off / Iso &lt;value&gt;) into one compact string, e.g. "Pre · Iso off ·
Awake". `app/page.tsx`'s `activeClinicalStateLabel` variable (an
ordinal string) is now `activeClinicalStateSummary` (this compact
string), threaded through every place the old ordinal label appeared.

**Maneuver cards, and the "tight space" problem.** A card's front
badge now reads "Performed — Pre · Iso off · Awake" instead of
"Performed — Clinical State 1." The harder problem was the "also
recorded under N other states" line — previously just a count, but the
user needs to see *which* states, and a card has very little room to
say it, especially as a case accumulates several states. Solved with a
compact chip row rather than a paragraph: `ManeuverCard.tsx`'s
`otherStatesPerformed` prop changed from a `number` to the actual
`ClinicalState[]`, and the card renders one small pill per state
(`.maneuverOtherStateChip`, `app/globals.css`), each showing its own
`clinicalStateSummary()`. No separate legend/key was needed — the
abbreviations (Pre/Post, Iso off/Iso &lt;value&gt;, Awake/Sedated/GA)
are already plain clinical shorthand a reader recognizes on sight, not
opaque codes. Each chip also carries the full text as a `title` tooltip
and truncates with an ellipsis, since isoproterenol is free text and
could occasionally run long — same overflow protection added to the
front badge and the card-back header's state span, which previously
had no overflow handling because the old ordinal label was always
short.

**Same-day refinement, two changes from user feedback:** (1) "Pre"/
"Post" alone weren't specific enough — `phaseAbbreviation()` is gone
and `clinicalStateSummary()` now uses the Phase value verbatim
(Pre-ablation/Post-ablation/Post-ablation 2); Sedation stays abbreviated
(Awake/Sedated/GA), which reads fine even short. (2) The other-states
chip row moved out of `.maneuverPerformedStatus` (which is about the
*active* state) into a new `.maneuverCardTopRight` column in the card's
header row, stacked under the "Suggested next" tag and right-aligned —
the card's actual upper-right corner, not just visually near it. The
"Also recorded under:" caption text was dropped in the move (no room
for it in the corner); the chips carry that context in their `title`
tooltip and an `aria-label` on the wrapping element instead.

**Second same-day round, two more changes from user feedback:**

- **"Suggested next" tag removed entirely.** The maneuver grid is
  already sorted by relevance (`MANEUVER-CARD-GRID-2026-08-03`,
  `MANEUVER-BASE-RANK-2026-08-04`), so a tag restating "this one's
  suggested" on top of that ordering was redundant — and it was the
  other occupant of the corner this whole stretch of work has been
  trying to free up. Removed the `isSuggested` prop end to end
  (`ManeuverCard.tsx`, and the `relevanceScore`/`isSuggested={...}`
  plumbing in `app/page.tsx`'s card-grid map) along with the
  `.maneuverSuggestedTag` CSS, rather than just hiding the tag —
  `scoreManeuverRelevance()` itself is untouched and still drives the
  actual sort. The state-history chips now have the corner to
  themselves.
- **The active-state summary now wraps instead of truncating.** The
  front "Performed — …" badge and the card-back header's state span
  both had single-line `overflow: hidden` + ellipsis, which — now that
  Phase is spelled out in full and isoproterenol is free text — was
  clipping real information off-card rather than gracefully shortening
  it. Both switched to `white-space: normal` (multi-line) instead of
  truncating; the badge's `border-radius` was knocked down from a full
  999px pill to 8px, since a wrapped two-line pill reads oddly. The
  corner history chips are unaffected — they keep their ellipsis +
  `title`-tooltip truncation, a deliberate, different tradeoff for a
  row that can hold several small chips at once rather than one
  prominent summary.

<!-- REFRACTORY-PERIODS-STYLE-GUIDE-2026-08-04 -->
## Refractory Periods Panel: Adopt the Active State/Intervals Style Guide (implemented 2026-08-04)

The Refractory Periods panel (under the Active Clinical State pane)
had its own bespoke visual design — a distinct header (`Clinical state
measurements` eyebrow + `Refractory Periods` h2) and its own 4-column
bordered item grid — inherited from the original direct-entry ERP card
design and never brought in line with the rest of the workspace's
established look after `REFRACTORY-PERIODS-V2-2026-08-03` replaced its
content model. Rebuilt to reuse the exact same classes the Active
Clinical State toolbar and Intervals row already use, rather than its
own:

- **Header.** The eyebrow text is gone. The panel now uses
  `.intervalsHeading` — the same left-accented, cyan-striped caption
  column already shared by the Active Clinical State toolbar heading
  and the Intervals row label — holding just "Refractory Periods."
- **Layout.** `app/page.tsx`'s markup is now one `.clinicalMeasurementRow`
  (label column + content column, identical grid shape to the
  Intervals row), with recorded values rendered as
  `.clinicalMeasurementFields` of `.toolbarField`/`.unitInput` boxes —
  the exact same read-only-styled input-with-unit-suffix control
  Intervals uses, just with a `readOnly` `<input>` instead of an
  editable one (recording still happens on the maneuver card, not
  here). The "via {maneuver}" provenance line is kept, styled with the
  pre-existing `.refractoryPeriodSource` caption class.
- **Container.** `app/globals.css`'s `.effectiveRefractoryPeriodCard`
  keeps its class name (a long list of unrelated layout rules —
  monitor-rail margins, responsive width bounds — already key off it
  structurally), but its own border/radius/background/shadow values
  were changed to match `.caseStrip` exactly, rather than the
  close-but-not-quite values it had before.
- **Pruned.** `.effectiveRefractoryPeriodCardHeader` (+ its `p`/`h2`
  children), `.effectiveRefractoryPeriodGrid`, `.effectiveRefractoryPeriodItem`
  (+ its `nth-child` border variants), `.effectiveRefractoryPeriodItemHeader`,
  `.effectiveRefractoryPeriodLabel`, `.effectiveRefractoryPeriodInputs`,
  `.effectiveRefractoryPeriodUnit`, `.refractoryPeriodValue`, and their
  two responsive media-query blocks — all now genuinely dead, since
  nothing in the new markup references them.

<!-- CLINICAL-STATE-CARD-EQUAL-WEIGHT-2026-08-04 -->
## Clinical States Rail Cards: Equal Visual Weight for Phase/Rhythm/Iso (implemented 2026-08-04)

On the left-hand Clinical States rail, each card previously gave Phase,
Rhythm, and Iso status three different visual treatments: Phase was a
bold `<strong>` headline, Rhythm a plain muted `<p>` line below it, and
Iso status was buried as a small span inside the `.clinicalStateMeta`
row (sharing that row, and its smallest type size, with the unrelated
measurement count). That was an unintentional hierarchy among three
fields that are actually peers for identifying a clinical state — none
of them is more important than the others.

- **Layout.** `app/page.tsx` now renders Phase, Rhythm, and Iso as a
  `.clinicalStateFields` three-column grid, one `.clinicalStateField`
  per value: a tiny uppercase `.clinicalStateFieldLabel` ("Phase" /
  "Rhythm" / "Iso") over a `.clinicalStateFieldValue`. All three labels
  share one type scale and all three values share another — no field is
  bigger, bolder, or better-positioned than the others. Each value
  carries a `title` attribute with the full text, since the column is
  narrow enough that long Rhythm/Phase strings can truncate.
- **Iso value.** Shown as the bare trimmed `isoproterenol` string (or
  "Off" when blank) rather than the `medicationSummary()`-formatted
  "Iso off" — the field's own label already says "Iso," so repeating it
  in the value would be redundant now that it has equal footing with
  Phase and Rhythm. `medicationSummary()` itself is untouched and still
  used by `clinicalStateSummary()` for the maneuver-card compact
  summary, which is a different, unlabeled context; its now-unused
  import was removed from `app/page.tsx`.
- **Measurement count.** Kept as its own line below the field grid in a
  simplified `.clinicalStateMeta` (now a single left-aligned span,
  since Iso status is no longer sharing that row) — it's a count of
  recorded values, not an identifying attribute of the state, so it
  deliberately stays visually secondary to the three equal-weight
  fields above it.
- **CSS.** `app/globals.css`: replaced `.clinicalStateCard > strong`
  and `.clinicalStateCard > p` with `.clinicalStateFields` /
  `.clinicalStateField` / `.clinicalStateFieldLabel` /
  `.clinicalStateFieldValue`; dropped the `:last-child` right-align
  rule from `.clinicalStateMeta span` (only one span remains) and the
  `justify-content: space-between` from `.clinicalStateMeta` itself.
  A pre-existing, already-fully-overridden "Clinical State architecture
  v1" CSS block earlier in the file (labeled as such in a comment) still
  defines its own dead `.clinicalStateCard strong`/`p`/`.clinicalStateMeta`
  rules — these were already inert before this change (the "v2" rules
  edited here have matched selectors later in the cascade and already
  won), so they were left alone rather than pruned in this pass.

<!-- PUBLIC-KNOWLEDGE-BASE-VIEWER-2026-08-04 -->
## Public Read-Only Knowledge Base Viewer (implemented 2026-08-04)

The knowledge base previously had no public-facing way to browse or
export it — the About modal gestured at "downloading" it via two
disabled "Coming soon" placeholder cards (Diagnostic engine package /
Clinical logic and rules), and the only working viewer was the
authenticated `/admin` editor. Decided, in conversation, to build a
genuine read-only clone of the admin spreadsheet UI rather than a
static export: same live data, same schema, same browsing conveniences
(sort, column resize, cross-sheet reference jump-links), just with
every mutation path removed, reachable with no login.

**Why parameterize instead of forking `app/admin/`.** A literal copy of
the admin tree would drift the moment a future column, sheet, or
validation rule changed in the real editor and didn't get hand-mirrored
into the clone. Instead, the existing admin components gained an opt-in
`readOnly` mode and a new thin page reuses them directly — one schema,
one set of components, two ways to render them.

- **`app/admin/components/SpreadsheetTable.tsx`**: new `readOnly?: boolean`
  prop. When true: the lock and delete columns (and their header cells)
  aren't rendered at all — nothing to protect or remove when nothing is
  editable — and `gridTemplateColumns` drops their `54px`/`50px` tracks
  accordingly. Every cell renders `disabled`, reusing the existing
  lightweight `isDisabledByPeer` visual treatment (a subtle background
  tint) rather than the heavier violet `isLocked` hatch — that hatch is
  a deliberate "this row is protected" editorial signal inside the admin
  editor, and would read as a wall-to-wall warning pattern if applied to
  every row on a page where nothing was ever editable to begin with.
  Sorting, column resizing, and cross-sheet reference jump-links are
  untouched and still work. The empty-sheet state drops its "Add First
  Row" button and adjusts its copy and `gridColumn` span math for the
  now-narrower (no lock/delete columns) grid.
- **`app/admin/components/Toolbar.tsx`**: new `readOnly?: boolean` prop
  hides Add Row and Save, replaces the dirty/saved indicator (meaningless
  with nothing editable) with a plain "Read-only" label, and keeps
  Download Workbook, which needed no changes — `exportKnowledgeWorkbook`
  already just serializes whatever `sheets`/`revision` it's given.
- **`app/knowledge/page.tsx` + `KnowledgeClient.tsx`** (new route,
  `/knowledge`, no auth): reuses `AdminTabs`, `ManeuverWorkspace`,
  `SpreadsheetTable readOnly`, and `Toolbar readOnly` as-is. Loads from
  the pre-existing unauthenticated `GET /api/knowledge/public` (added
  under `MANEUVER-CARD-GRID-2026-08-03` for the main workspace's own
  read needs) instead of the authenticated `/api/knowledge`, and reads
  `{ revision, sheets }`
  directly off that response rather than the admin route's
  `{ revision, workbook: { sheets } }` shape. No Save/Add Row/lock
  handlers exist on this page at all — `SpreadsheetTable`'s mutation
  callback props are still required by its type signature, so no-op
  stubs are passed rather than making those props optional just for
  this one read-only caller.
- **About modal (`app/page.tsx`)**: the two disabled "Coming soon"
  cards under "Open-source downloads" are replaced with one working
  card — "Browse the clinical knowledge base" — linking to `/knowledge`,
  under a renamed "Knowledge base" heading. The modal now also opens
  automatically on every page load (`aboutOpen` now defaults to `true`
  rather than `false`), since `/knowledge` has no other entry point in
  the site's navigation; it's still reachable afterward via the
  existing About button exactly as before. A new `.downloadCardAction`
  class in `app/globals.css` gives that one real link the same
  filled-cyan treatment as `.adminPrimaryButton`, distinct from the
  muted `.downloadCard button` styling the (now-removed) placeholder
  cards used.

<!-- ABOUT-MODAL-LANDING-PAGE-2026-08-04 -->
### Follow-up, same day: new-tab link + OK button (2026-08-04)

Two corrections once the above was live: the Knowledge Base card's link
now opens `/knowledge` in a new browser tab (`target="_blank"
rel="noopener noreferrer"`, and its `onClick={() => setAboutOpen(false)}`
was dropped) so the clinical workspace tab stays exactly where the user
left it rather than navigating away underneath them. And since the
About modal now doubles as the site's landing page (it opens on every
load), its small corner `×` close button was replaced with a large,
unmissable "OK" button centered along the bottom of the card — a
single deliberate dismissal action fits a landing page better than a
corner affordance easy to miss on first visit. `.modalClose` (button
and hover rule) is now dead and was pruned from `app/globals.css`; new
`.modalFooter`/`.modalOkButton` rules add the bottom bar, the latter
using the same filled-cyan language as `.adminPrimaryButton`/
`.downloadCardAction` but sized up (46px tall, 180px minimum width) to
read as the card's primary action.

<!-- REMOVE-WORKSPACE-REFERENCE-TABS-2026-08-04 -->
## Removed the Workspace/Reference Top-Bar Toggle (implemented 2026-08-04)

The topbar's center `<nav className="tabs">` — "Workspace" (permanently
`active`, unclickable) and "Reference" (no handler at all) — was a draft
holdover from before the app had any real second surface to switch to.
Now that `PUBLIC-KNOWLEDGE-BASE-VIEWER-2026-08-04` gives "Reference" a
real destination (the `/knowledge` link in the About modal, opening in
its own tab), the fake toggle that never did anything is just
confusing, so it's gone rather than wired up — the About modal is
already the entry point, and a second, non-functional nav implying the
same destination would be redundant.

- **`app/page.tsx`**: removed the `<nav className="tabs">` block
  entirely from the topbar.
- **`app/globals.css`**: `.topbar`'s grid went from three columns
  (`1fr auto 1fr`, the center one sized to the now-gone nav) to two
  (`1fr auto` — brand info left, `.topActions` right). Deleted the now
  fully dead `.tabs`, `.tabs button`, and `.tabs button.active` rules,
  along with the `@media (max-width: 1100px)` block's `.topbar`/`.tabs`
  overrides — that breakpoint used to collapse to `1fr auto` and hide
  the nav on narrower screens, which is exactly the new unconditional
  base layout, so the override became redundant rather than needed.

<!-- CLINICAL-STATE-CARD-WRAP-AND-ABBREVIATION-2026-08-04 -->
## Clinical States Rail Cards: Wrap Instead of Truncate + KB Abbreviation Lookup (implemented 2026-08-04)

The Phase/Rhythm/Iso value grid added in
`CLINICAL-STATE-CARD-EQUAL-WEIGHT-2026-08-04` truncated with an
ellipsis rather than wrapping, so values like "Normal Sinus Rhythm" or
"Pre-ablation" were getting cut off in the narrow three-column grid.
Two changes, decided together in conversation:

- **Wrap, don't truncate (the actual fix).** `app/globals.css`'s
  `.clinicalStateFieldValue` drops `white-space: nowrap` /
  `text-overflow: ellipsis` in favor of `overflow-wrap: break-word` /
  `word-break: break-word`. Cards grow taller to fit — nothing in
  `.clinicalStateCards`' grid or `.clinicalStateCard` constrains card
  height, so this was a pure CSS change. This is the guarantee: no
  value is ever cut off, regardless of length or whether an
  abbreviation exists.
- **Abbreviate via the Clinical States knowledge-base sheet, where
  available.** The admin Clinical States sheet's Abbreviated Name
  column was a fixed dropdown (`options: ["NSR", "Brady", "Tachy",
  "CRM Paced", "Iso On", "Iso Off", "Adenosine"]`) that Murph didn't
  choose the values for — changed to a plain open text field
  (`app/admin/model.ts`) so Murph can name the abbreviations directly.
  `app/page.tsx` adds `abbreviateClinicalStateLabel(value,
  clinicalStates)`: looks up `value` against the sheet's Full Name
  column (already loaded into `knowledgeSheets` for the maneuver
  catalog) and returns the matching row's Abbreviated Name, or `value`
  unchanged if there's no match. Applied to all three rail-card fields
  (Phase, Rhythm, Iso), independently, with no special-casing between
  them — deliberately generic rather than hardcoded to Rhythm, so any
  value that later gets a matching Clinical States row (whenever that
  happens) starts abbreviating automatically with no further code
  changes. Nothing breaks either way: the lookup always falls back to
  the full value, and the wrap fix above means an unabbreviated value
  is still fully readable, just taller.
  - Note: the Clinical States sheet's declared vocabulary today
    (rhythm and pharmacologic conditions like "Normal Sinus Rhythm" /
    "Isoproterenol On") only realistically overlaps with the Rhythm
    field's `rhythmOptions` values, and only partially (e.g. "Atrial
    Pacing" isn't in the sheet at all). Phase (`Pre-ablation` /
    `Post-ablation`) and the free-text Iso dose field aren't part of
    that vocabulary today, so wiring them in doesn't do anything yet —
    it's there so it works automatically if Murph ever extends the
    sheet to cover them, without needing to revisit this code.

<!-- ABOUT-MODAL-POLISH-2026-08-05 -->
## About Modal Polish: Renamed Header, Contact Placeholder (implemented 2026-08-05)

Small copy and content pass on the About modal, now that it's also the
site's landing page:

- **Header.** The "Open-source project" eyebrow above the title is
  gone — that framing will be covered elsewhere later rather than
  asserted here. The title itself changed from "About Diagnostic
  Pacing Maneuvers" to "About DiagnosticPacing.org", matching the
  project's actual domain/identity rather than the app's internal
  working name.
- **New "Get involved" card.** A second `.downloadSection`, in the
  same `.downloadCard` two-line-text-plus-action format as the
  Knowledge Base card above it: "Contribute or critique" with copy
  inviting feedback, corrections, and contributions, and explicitly
  noting email isn't wired up for DiagnosticPacing.org yet. The action
  is a `<button className="downloadCardAction" disabled>Contact</button>`
  — same cyan-filled visual treatment as the working "Open" link next
  to the Knowledge Base card, so the two cards read as one family, but
  inert since there's nowhere for it to go yet.
- **CSS.** `app/globals.css` adds `.downloadCardAction:disabled`
  (dimmed opacity, `not-allowed` cursor, hover suppressed) — the same
  "same style, visibly inert" pattern `.adminPrimaryButton:disabled`
  already uses elsewhere in the app, applied here for consistency
  rather than inventing a new disabled treatment.
- Follow-up when email is wired up: swap the `<button disabled>` for
  a real `mailto:` link or contact route, drop the `disabled`/`title`
  attributes, and this becomes a working card with no other changes
  needed — the placeholder was built to convert cleanly rather than
  needing to be rebuilt.

<!-- REFRACTORY-PERIODS-TWO-ROW-2026-08-05 -->
## Refractory Periods Panel: Two Fixed Rows, Every State (implemented 2026-08-05)

Reworked from a single-row, Active-Clinical-State-scoped panel into a
permanently affixed one showing every recorded finding across the
whole case at once. Decided in conversation, including two open
questions Murph resolved directly:

- **Two fixed rows, not one.** The panel now always renders exactly
  two rows — Antegrade and Retrograde — each with its own
  `.intervalsHeading` label, regardless of whether either has any
  findings yet (an empty row shows "None recorded yet…" rather than
  disappearing, since "permanently affixed" means the card's structure
  doesn't move around based on data). The schema's third direction
  value, `"n/a"` (used for Atrial/Ventricular structures, which aren't
  meaningfully antegrade or retrograde), is intentionally given no
  row — Murph's call: "all refractory periods can be classified as
  either antegrade or retrograde," so `"n/a"`-tagged definitions
  (`app/page.tsx`'s `buildRefractoryPeriodRow`) simply aren't matched
  by either row's filter. `"n/a"` remains schema-legal (unchanged in
  `app/admin/model.ts`/`app/maneuvers/knowledge.ts`) — this is a
  display-layer decision, not a validation change, so nothing breaks
  if it's ever used; it just wouldn't be visible on this panel.
- **Not state-dependent anymore.** Previously each definition showed
  at most one value — whatever was recorded under the currently active
  Clinical State — and switching states could change what the panel
  showed. Now every Clinical State in the case is checked
  (`collectRefractoryPeriodFindings`, `app/refractoryPeriods/
  knowledge.ts`), so a maneuver performed under two different states
  (e.g. once off isoproterenol, once on) surfaces both results at
  once, side by side, rather than one replacing the other as the
  active state changes.
- **New per-finding state tag**, since the panel no longer implies
  "this is the active state" via its position in the UI. Limited to
  exactly two axes, per the original request: ablation phase and
  isoproterenol status — `formatRefractoryPeriodStateTag()` reads
  `context.phase`/`context.isoproterenol` and renders e.g. "Pre · Iso
  off". Phase collapses to just two buckets (Pre/Post) — Murph's call
  on the second open question: Post-ablation 2 folds into "Post" rather
  than staying distinguishable, matching "limited to pre/post"
  literally. This is a deliberately different, narrower abbreviation
  than the general-purpose one tried and removed from
  `clinicalStateSummary()`'s design (`CLINICAL-STATE-COMPACT-
  SUMMARY-2026-08-04`) — that one needed the full phase name; this one
  is scoped tightly enough that losing the Post/Post-2 distinction is
  the intended behavior, not a regression.
- **Rendering.** Each row is a flat, wrapped list of finding "chips"
  (`.refractoryPeriodFinding`) — one chip per (definition, Clinical
  State) pair with a recorded value — each showing the definition's
  label (e.g. "AVN ERP"), the value with its "ms" unit, and the state
  tag. The "via {maneuver}" provenance that used to always be visible
  moved into a `title` tooltip (now also naming the state) rather than
  a fourth always-visible line, since a row can now hold many chips at
  once and space is precious. `app/globals.css` replaces the old
  fixed-column `.clinicalMeasurementFields` usage in this panel with
  `.refractoryPeriodFindings` (`flex-wrap`, since the number of
  findings is unbounded and no longer matches a known column count)
  and adds a persistent `.refractoryPeriodsCardHeading` title ("Refractory
  Periods" + a one-line note) above both rows — previously the single
  row's own "Refractory Periods" label served as the card's title, but
  that role now belongs to each row's own "Antegrade"/"Retrograde"
  label, so the card needed its own separate, permanent title. The
  now-dead `.refractoryPeriodSource` rule (the old always-visible "via"
  line) was removed.

<!-- REPORT-GENERATOR-2026-08-05 -->
## Case Report Generator (implemented 2026-08-05)

Wired the topbar's previously-dead "Report" button to a plain-text,
copy/print-friendly case summary — the first version of a reporting
function for this project. Deliberately simple per the request: no
formatting beyond an indented text outline, no PDF/rich export.

- **`app/report/generate.ts`**: `generateCaseReport(caseRecord,
  maneuverCatalog)` is a pure function (no DOM/browser APIs) returning
  the full report as one string. Reuses the exact same building blocks
  the Refractory Periods panel and its two-row redesign already
  established — `buildRefractoryPeriodCatalog`,
  `collectRefractoryPeriodFindings` — rather than re-deriving refractory
  period logic from scratch, so the report and the on-screen panel can
  never disagree about what counts as a recorded finding.
- **Structure** (exact section numbering as specified):
  1. Baseline State — `caseRecord.clinicalStates[0]` specifically (the
     first Clinical State recorded, whatever its Phase/Rhythm actually
     are), its Rhythm name, and every non-blank measurement recorded
     for it, labeled via `workspaceConfigurations[rhythm]`.
  2. Pre-Ablation Measurements, split 2.a Off Isoproterenol / 2.b On
     Isoproterenol, each split into 2.a.1/2.b.1 Antegrade and
     2.a.2/2.b.2 Retrograde refractory period findings. Every Clinical
     State tagged Pre-ablation is included, not just ones after the
     baseline — the baseline state itself typically qualifies too,
     since a fresh case starts Pre-ablation/Iso off by default, and
     that's correct: baseline is exactly where initial refractory
     periods are usually measured in a real study.
  3. Rhythms Induced — every Clinical State after the baseline whose
     Rhythm is exactly `"Tachycardia"`, each labeled "Clinical State
     {N}: Tachycardia — {phase}, {iso}" (N matching the same numbering
     shown on the rail cards, since there's no other name to give an
     induced rhythm) followed by its recorded intervals.
  4. Post-Ablation Measurements — same shape as section 2, for every
     Clinical State *not* tagged Pre-ablation (i.e. Post-ablation or
     Post-ablation 2, collapsed together — same two-bucket
     simplification the Refractory Periods panel's state tag already
     uses, for consistency).
  - Refractory period lines omit the direction word
    (`composeRefractoryPeriodLabel(type, "n/a", structure)`, e.g. "AVN
    ERP" not "Antegrade AVN ERP") since the enclosing 2.a.1/2.a.2-style
    heading already says it. Empty subsections print "None recorded"
    rather than a blank gap, so the outline's shape stays visible even
    for a mostly-empty case.
- **`app/page.tsx`**: the Report button now opens a `.reportModal`
  (same `.modalBackdrop`/`.modalHeader` shell as the About modal, but
  its own sizing/close-button treatment — this one's a transient
  triggered dialog, not a landing page, so a small corner × is the
  right fit here rather than the About modal's unmissable-OK-button
  pattern) showing the generated text in a `<pre>`. Two actions in the
  footer: **Copy all text** (`navigator.clipboard.writeText`, with a
  2.2s "Copied"/error state) and **Print**
  (`window.print()`). `reportText` is recomputed on every render —
  cheap enough not to need memoizing — so it's always current with
  whatever's in `caseRecord` when the modal opens.
- **Print isolation** (`app/globals.css`): a `@media print` rule hides
  every element (`visibility: hidden`, not `display: none`, so layout
  doesn't jump) except `.reportPrintable`, which gets pinned to the
  page origin via `position: fixed` — deliberately fixed rather than
  absolute, so it escapes `.reportModalBody`'s on-screen scroll
  clipping and the modal's own sizing entirely. This means printing
  works straight from the in-page preview with no popup window and no
  separate print-only document to keep in sync.

<!-- CASE-SAVE-OPEN-2026-08-05 -->
## Save / Open Case (implemented 2026-08-05)

Wired the topbar's previously-dead "Save case" button and added a new
"Open case" button, both operating entirely client-side — a downloaded
JSON file and a local file picker, no request ever leaves the browser.
This was a deliberate architecture call, not something the user
specified directly: grounded in the app's own footer copy ("No patient
data is being transmitted", "Autosave: off") and the existing
"Download Workbook" Excel-export precedent in
`app/admin/workbookExport.ts`, both of which point at local-file
persistence rather than a server-backed save. Server-backed persistence
would be a reasonable alternative if that posture ever changes, but
would need auth and a data-transmission conversation with the user
first.

- **`app/case/persistence.ts`** (new): the same `schemaVersion`
  versioning convention `knowledge/types.ts` established for the
  knowledge base workbook, applied to a case file:
  ```ts
  export const CASE_FILE_FORMAT = "diagnostic-pacing-case" as const;
  export const CASE_FILE_SCHEMA_VERSION = 1 as const;
  type CaseFile = { fileFormat, schemaVersion, exportedAt, case: CaseRecord };
  ```
  - `exportCaseRecord(caseRecord)` — Blob + `URL.createObjectURL` +
    a programmatically-clicked anchor, same technique as
    `workbookExport.ts`'s Excel download. Filename is
    `{slugified-title}-{YYYY-MM-DD}.json`.
  - `importCaseRecordFromFile(file)` — parses and validates before
    handing back a `CaseRecord`: rejects invalid JSON, anything missing
    the `fileFormat` marker, a `schemaVersion` newer than this build
    understands, and structurally incomplete cases (missing
    id/title/clinicalStates, or any Clinical State missing its
    id/context/measurements/performances shape). Every rejection throws
    a message written to be shown to the user directly, not a raw
    parse/type error.
- **`app/page.tsx`**:
  - **Save case** — calls `exportCaseRecord(caseRecord)` directly, no
    confirmation needed since downloading a file is non-destructive.
  - **Open case** (new button, between New case and Save case) — a
    `window.confirm` guard first (opening discards the current case,
    and there's no autosave to fall back on), then triggers a hidden
    `<input type="file" accept=".json,application/json">` via a ref.
    On selection, `importCaseRecordFromFile` either replaces
    `caseRecord` wholesale and resets the active Clinical State to the
    imported case's first state and clears the state-change log (since
    it's a log of the old case's edits), or on failure shows the
    thrown message via `window.alert` and leaves the current case
    untouched. The input's value is reset after every selection so
    re-opening the same filename still fires the change handler.
  - **New case** — was already a button in the topbar but fully
    unwired; wired now with the same confirm-guard-then-reset pattern
    as Open case, since both share the same "discards unsaved work"
    risk (`createInitialCase()`, reset active state to
    `clinical-state-1`, clear the state-change log).

<!-- SECTION-HEADER-ALIGNMENT-2026-08-05 -->
## Section Header Width/Position Alignment (implemented 2026-08-05)

Two related GUI polish fixes so the Active Clinical State, Intervals,
and Refractory Periods sections read as one consistent design language
rather than three different header treatments.

- **Active Clinical State heading width**: `app/globals.css` had
  accumulated several superseded `.stateToolbarRow` rules from earlier
  responsive-layout passes (dead code — later rules win the cascade at
  equal specificity, so only the last one in the file, under the
  "Active Clinical State complete-field layout v1" section, was
  actually rendering). That live rule's first grid column — the
  `.toolbarHeading`/`.activeClinicalStateHeading` cell — was
  `minmax(170px, 0.82fr)`, a flexible column that grows with whatever
  width is left over, so it visibly out-grew the Intervals row's fixed
  165px header column. Changed it (and its 1240px-breakpoint
  duplicate) to a plain `165px`, matching
  `.clinicalMeasurementRow`/`.intervalsHeading` exactly, so all three
  section headers now sit in the same fixed-width visual column. Left
  the earlier dead `.stateToolbarRow` rules and the narrower
  (≤760px, single-column stacked) breakpoint alone — neither affects
  what's actually rendering at normal widths, and stacked mobile layout
  isn't a case where "same width as Intervals" is meaningful.
- **Refractory Periods header repositioned**: previously "Refractory
  Periods" was a full-width heading bar across the top of the card,
  with "Antegrade"/"Retrograde" as separate `.intervalsHeading`-style
  row labels underneath. Restructured to match the Intervals/Active
  Clinical State pattern instead: `.effectiveRefractoryPeriodCard` is
  now a two-column grid (`165px minmax(0, 1fr)`, same as
  `.clinicalMeasurementRow`/`.stateToolbarRow`) with "Refractory
  Periods" as the left-column header — literally the same
  `.intervalsHeading` class (fixed width, cyan accent bar, gradient
  background), plus a `.refractoryPeriodsHeading` modifier so its
  "doesn't change with Clinical State" note can sit on its own line
  underneath rather than beside the title (there's no room for that
  side-by-side layout at 165px). Antegrade and Retrograde are no longer
  separate `.clinicalMeasurementRow`s with their own left-column
  labels — they're two stacked `.refractoryPeriodDirectionRow`s inside
  a single `.refractoryPeriodsRows` column to the header's right, each
  with an inline `.refractoryPeriodDirectionLabel` (small uppercase
  label, not a full header cell) ahead of its findings. The header
  cell's height is driven by CSS Grid's default `stretch` alignment —
  it isn't spanning rows explicitly, it's just the only other item in
  the grid's single implicit row, so it naturally matches the combined
  height of both direction rows, the same effect
  `.stateToolbarRow > :first-child { grid-row: 1 / 3 }` achieves
  explicitly for the Active Clinical State heading.

<!-- ACTIVE-STATE-SINGLE-ROW-2026-08-05 -->
## Active Clinical State: Single-Row Field Layout (implemented 2026-08-05)

The "Active Clinical State complete-field layout v1" pass (documented
earlier this session) deliberately split Phase/Rhythm/Sedation/
Isoproterenol/Adenosine/Epinephrin across two rows so nothing would
clip at typical widths. Reconsidered per Murph's observation that most
of those fields don't need to be wide - replaced that with a genuine
single row at normal widths, sized per field rather than uniformly:

- app/globals.css: the live (non-media) .stateToolbarRow rule is now
  165px (heading) followed by six explicit minmax() columns instead of
  a uniform repeat(3, minmax(150px, 1fr)) split across two rows -
  Rhythm and Sedation get the most room (minmax(140px, 1.3fr) /
  minmax(130px, 1.15fr), since their select options include text like
  "Normal Sinus Rhythm" and "General Anesthesia"), Phase a bit less
  (minmax(100px, 0.85fr)), and the three numeric medication inputs the
  least (minmax(80px, 0.7fr) each, since a dose value never needs much
  width). All seven cells (heading + six fields) now rely on plain grid
  auto-placement into that one row - the explicit nth-child-based
  two-row placement rules (and the row-2 top-border rule that went with
  them) were removed as no longer needed.
- Left the two narrower fallback breakpoints alone (max-width: 1240px
  drops to 2 field columns x 3 rows, max-width: 760px stacks everything
  into 1 column) - six fields plus the heading genuinely don't fit in
  one row once the center workspace gets that narrow, and those
  breakpoints already handle it by adding rows rather than clipping or
  hiding a field, which is still the right fallback there. Single-row
  is specifically a normal/wide-viewport change.

<!-- RAIL-DEFAULT-WIDTH-2026-08-05 -->
## Side Rail Default Width Nudge (implemented 2026-08-05)

Both side rails (Clinical States, Differential Diagnosis) are
independently drag-resizable and remember their width per-rail via
localStorage - Murph likes that, but wanted the first-load width (i.e.
before either rail has ever been dragged) to be a little more
prominent.

- app/page.tsx: RAIL_WIDTH_DEFAULT 190 -> 225 (still well inside
  RAIL_WIDTH_MIN 160 / RAIL_WIDTH_MAX 480, and comfortably under
  clampRailWidth's viewport-relative cap at any reasonable desktop
  width). This is the single source of truth for first-load width -
  loadStoredRailWidth() falls back to it whenever localStorage has
  nothing stored yet for that rail.
- app/globals.css: matched the :root --side-monitor-width fallback
  (190px -> 225px) for consistency. This value is only a pre-hydration/
  no-JS fallback - .appShell sets --clinical-state-rail-width and
  --diagnosis-monitor-width inline from the same JS state, and that
  inline declaration is what actually renders once the page hydrates -
  but keeping the two in sync avoids a mismatched flash and avoids
  leaving a stale number for whoever reads this file next.
- Dragging either rail still works exactly as before, and a
  previously-dragged width (already in localStorage) is unaffected by
  this change - it only shifts the starting point for a case where
  nothing's been saved yet.

<!-- ABLATION-SECTION-2026-08-05 -->
## Ablation Section (implemented 2026-08-05)

New always-visible section below Refractory Periods, capturing
intervention detail strictly for the case report - modality, location,
number of ablations, duration. As discussed before building it: this is
deliberately not wired to clinical reasoning or to the Pre-/Post-ablation
Phase tag anywhere else, and it isn't shaped like a Clinical State
(no Rhythm/Sedation/measurements of its own, no differential-engine
role) - it's case-level procedural data, a sibling to clinicalStates on
CaseRecord, not something nested inside one.

The one hard constraint driving the whole design: this section must stay
a single line, always, no matter how many ablation sessions get
recorded. That's the opposite of this app's usual rule for the Active
Clinical State toolbar ("expand vertically rather than clip, hide, or
scroll" - see ACTIVE-STATE-SINGLE-ROW-2026-08-05 above), which is fine -
different sections can make different tradeoffs, and here the tradeoff
that satisfies "one line, ever" is horizontal scroll instead of adding a
row.

- app/clinical/model.ts: `ablationModalityOptions` ("Radio Frequency" /
  "Pulsed Field" / "Cryo"), `AblationSession` (`id`, `modalities:
  AblationModality[]`, `location`, `count`, `durationSeconds` - the
  latter three are free text per the spec, same convention as
  Isoproterenol/Adenosine/Epinephrin already being free-text rather than
  strictly-numeric inputs), `createAblationSession`,
  `hasAblationSessionData` (gates the "+" button - see below),
  `abbreviateAblationModality` (RF / PFA / Cryo, for the tight toggle
  buttons), `summarizeAblationSession` (the collapsed badge's tooltip
  text). `CaseRecord` gained `ablationSessions: AblationSession[]`;
  `createInitialCase()` seeds it with one blank session so the entry row
  is always present.
- app/page.tsx: exactly one session is ever "active" - whichever is
  last in the array - and it's live-bound to input onChange/onBlur the
  same way every other free-text field in this app already works.
  Clicking "+" (`addAblationSession`) just appends a fresh blank session;
  the previous last one collapsing to an "ABL Session N" badge is a pure
  rendering consequence of no longer being at the last index, not a
  separate "commit" step or flag on the data. "+" is disabled
  (`hasAblationSessionData`) until the active session has at least one
  field filled in, so it can't spawn a run of empty badges from
  double-clicks. Session ids come from a `useRef` counter, not
  `Date.now()` - this avoids adding a second instance of the
  react-hooks/purity finding that already exists (and is accepted as
  pre-existing) for `addClinicalState`'s ordinal id. Removing a session
  (the small × on each collapsed badge) is a small addition beyond what
  was asked, in case a session gets collapsed by mistake.
  Modality renders as three small toggle buttons (a real multiselect -
  more than one can be active - rather than a native `<select multiple>`,
  which would need much more vertical room than one line allows) rather
  than a dropdown, so what's selected is always visible without opening
  anything.
- app/globals.css: `.ablationCard` shares `.effectiveRefractoryPeriodCard`'s
  box/grid treatment verbatim (same 165px `.intervalsHeading` header
  column, same margin/border/background/shadow) by literally sharing
  that class name, the same reuse precedent Refractory Periods already
  set for Intervals. `.ablationRow` is `flex-wrap: nowrap` with
  `overflow-x: auto` - collapsed badges and the active entry fields all
  have `flex: 0 0 auto` (fixed width, never shrink/wrap), so the row
  can only ever grow sideways and scroll, never wrap to a second line.
- app/case/persistence.ts: `isValidCaseRecord` treats `ablationSessions`
  as optional (a case file saved before this feature existed won't have
  it), validating it only when present via a new
  `isValidAblationSession` check; `importCaseRecordFromFile` defaults a
  missing `ablationSessions` to `[]` on the way out, so older exports
  still open cleanly instead of getting rejected.

Not done yet, and flagged to Murph rather than assumed: the case report
generator (app/report/generate.ts) doesn't include Ablation data at all
yet. This section was scoped to GUI capture only per the request - report
wiring is a clear next step whenever it's wanted.

<!-- ABLATION-SESSION-RECALL-2026-08-05 -->
## Ablation: Recall Prior Sessions (implemented 2026-08-05)

The first pass only ever showed the last session as editable - once a
second session was started, earlier ones were read-only badges (a
hover tooltip was the only way back to their data). Fixed: any
collapsed badge is now clickable to bring that session back for
viewing or editing.

- app/page.tsx: added `activeAblationSessionId` state - which session
  is currently expanded is now tracked explicitly, decoupled from "is
  it the last item in the array" the way it was before.
  `activeAblationSessionIndex` resolves that id against the current
  case's sessions and falls back to the last session whenever it
  doesn't match anything - the initial "nothing clicked yet" state,
  and also what happens automatically if the active session gets
  removed, or a different case is opened or started (both
  `startNewCase` and `handleCaseFileSelected` explicitly reset it to
  null too, so a stale id from the previous case can never coincidentally
  match a same-named session id in the new one).
  `addAblationSession` now also sets the newly created session active,
  so clicking "+" both starts and immediately shows the new entry
  fields, from wherever you were.
- The "+" button moved out of the per-session map to a single instance
  at the end of `.ablationRow`, since it always means "add a session
  after the true last one" regardless of which session happens to be
  expanded at the moment - its enabled/disabled state still checks the
  actual last session's data (`lastAblationSession`), not whatever's
  currently on screen.
- Each collapsed badge is now a small `<div>` holding two sibling
  `<button>`s - a label button (click to reopen) and the existing
  remove `<button>` - rather than one clickable region, so the remove
  control never ends up nested inside another interactive element.
  `app/globals.css`: `.ablationSessionBadgeLabel` replaces the old
  plain `<span>` styling, plus a hover state (cyan text) so it reads as
  clickable.
- The invariant that made this safe to build without extra empty-array
  handling: the active session's own remove button was never rendered
  (only collapsed badges get one), so `ablationSessions` can shrink but
  never go below one item - `lastAblationSession` is always defined.

<!-- MANEUVER-CARD-REDESIGN-2026-08-05 -->
## Maneuver Card Redesign (implemented 2026-08-05)

Murph sketched a new layout: Maneuver Name + Performed History on top,
a big Findings box in the middle, Enter Result + Maneuver Details on the
bottom. Three follow-up questions resolved the design before building:
Maneuver Details is a placeholder for now (Technique text today, a
diagram later) revealed via a third card-flip state; and rather than a
separate merged "history" list, every individual finding on the front of
the card gets its own Pre/Post-ablation + Iso on/off state tag.

- **Shared state tag, moved out of Refractory Periods.**
  `formatRefractoryPeriodStateTag` (Pre/Post · Iso on/off) was scoped to
  that one panel, but Maneuver Card findings need the exact same tag now.
  Moved the logic to `app/clinical/model.ts` as `formatClinicalStateTag`;
  `refractoryPeriods/knowledge.ts` now just re-exports the old name as an
  alias (`export const formatRefractoryPeriodStateTag =
  formatClinicalStateTag;`) so nothing else in that file needed to
  change.
- **Findings are no longer scoped to the active Clinical State.**
  Previously a card only showed the active state's recorded value (via
  `performance`), plus a separate list of *which other* states it'd also
  been recorded under (`otherStatesPerformed: ClinicalState[]`, no
  values). Both are replaced by one prop,
  `performedStates: {clinicalState, performance}[]` — every Clinical
  State with an actual recorded performance for this maneuver, in the
  case's chronological order (`app/page.tsx` builds this with a
  `flatMap` over `caseRecord.clinicalStates`, same iteration order
  `collectRefractoryPeriodFindings` already relies on). The card derives
  `activePerformance` by finding the entry matching
  `activeClinicalStateId` — still needed to seed the "Enter/Edit result"
  editor, which stays scoped to the active state exactly as before; only
  the *display* of past findings changed, not what a save writes to.
- **Front face**, `app/maneuvers/ManeuverCard.tsx`:
  - `.maneuverCardTop`: maneuver name (unchanged) + `.maneuverPerformedHistory`
    — compact tags, one per performed state, no values (a fast-scan
    index of *when*, e.g. "Pre · Iso off", "Post · Iso on").
  - `.maneuverCardFindings`: the new main body. One row per performed
    state, each showing its tag next to the same summarized-result text
    `summarizePerformance` already produced (unchanged helper, just
    called once per state now instead of once total). The row matching
    `activeClinicalStateId` is highlighted (green tag/border) so it's
    still obvious at a glance whether the *current* context has been
    done, without a separate badge. `flex: 1` + internal
    `overflow-y: auto` so a maneuver with many findings scrolls in place
    rather than growing the card past its grid-row neighbors —
    `.maneuverCard`'s `min-height` went from 230px to 270px to give this
    room before it needs to scroll.
  - `.maneuverCardBottomActions`: two buttons, each `flex: 1 1 0` so
    they split the width evenly — "Enter/Edit result" (unchanged
    behavior) and the new "Maneuver details" (quieter secondary style,
    `.maneuverCardActionSecondary`, since it's reference lookup, not the
    card's primary purpose).
  - The old `.maneuverTechnique` paragraph (shown directly on the front)
    is gone from the front face entirely — technique now lives behind
    "Maneuver details" instead.
- **Back face — three-state flip, not three-sided.** A literal
  geometrically-distinct third face isn't practical with a CSS `rotateY`
  flip (backface-visibility only really gives you two orientations).
  Instead `flipState: "front" | "results" | "details"` — both
  non-"front" values flip to the *same* physical back plane
  (`isFlipped` triggers on `flipState !== "front"`), which conditionally
  renders either the existing result-entry form (`flipState ===
  "results"`, entirely unchanged logic) or the new details content
  (`flipState === "details"`). Functionally indistinguishable from a
  true third face to whoever's using it — you never see more than one
  back content at a time — without the fragile continuous-rotation
  carousel timing a real 3-face flip would need.
- **Details face**, deliberately scoped down to a placeholder per
  Murph's answer: a "Technique" section showing
  `entry.definition.technique` (or a fallback string if blank), and a
  `.maneuverDetailsDiagram` section — a dashed-border placeholder box
  reading "Diagram — coming soon", reserving the spot rather than
  building anything yet. Relevant Diagnoses / Required States (both
  already on `ManeuverDefinition`) were deliberately left out of this
  pass — narrower than what was floated as an option, matching what was
  actually asked for.
- Dead CSS removed alongside the rewrite (confirmed zero remaining
  references first): `.maneuverCardTopRight`, `.maneuverTechnique`,
  `.maneuverPerformedStatus`, `.maneuverPerformedBadge` (+
  `.isPerformed`), `.maneuverResultSummary`, `.maneuverOtherStatesChips`,
  `.maneuverOtherStateChip`.

<!-- MANEUVER-CARD-CLICK-TO-FLIP-2026-08-05 -->
## Maneuver Card: Click-Anywhere-to-Flip + Details on Results Side (implemented 2026-08-05)

Two follow-up requests on the redesign above: "Maneuver details" needed
to also be reachable from the results-entry side (previously only on
front), and clicking anywhere on a card face that isn't a button/field
should flip it — front → results, results → front, details → back to
whichever face opened it — on top of, not instead of, the existing
buttons.

- `detailsReturnState: "front" | "results"` (new state) records which
  face "Maneuver details" was opened from; `openDetails(from)` sets it,
  `closeDetails()` flips back to it. The front's details button and the
  new results-side details button both call `openDetails` with their
  own side, so "Back" on the details face always lands you where you
  actually came from, not always on front.
- `handleFaceClick(event, action)`: attached to both `<article>` faces'
  `onClick`. Walks up from `event.target` via `.closest("button, input,
  select, textarea, a, label")` — if the click originated inside any of
  those, it's a real control's own click and this does nothing (avoids
  double-handling a button click that also bubbles to the face). Any
  other click on the face runs the face's default action: front →
  `openEditor` (same as clicking Enter/Edit result), results-back →
  `setFlipState("front")` (same as Cancel, no save), details-back →
  `closeDetails`. No `role="button"`/`tabIndex` added to the faces on
  purpose — they already contain real interactive children, and the
  explicit buttons remain the only way to trigger any of this from a
  keyboard or screen reader; the whole-face click is a mouse
  convenience layered on top, not a replacement.
- One accepted tradeoff, flagged rather than silently worked around:
  since the results face is a dense field form, a click on the
  whitespace *between* fields (not on a label/input specifically) now
  also flips back to front without saving — matches "clicking anywhere
  that isn't a data entry field or another button" exactly as asked,
  but worth knowing if it ever feels like an accidental-exit trap while
  filling out a long form.
- `app/globals.css`: `.maneuverCardBackActions` changed from
  `justify-content: flex-end` to plain `flex-start` +
  `.maneuverCardBackActionsPrimary { margin-left: auto }` wrapping
  Cancel/Save, so "Maneuver details" sits alone on the left of the
  results row while Cancel/Save stay right-aligned as a pair. The
  details face's lone "Back" button gets the same right-alignment via
  its own `.maneuverDetailsBackButton { margin-left: auto }` — margin
  auto rather than `space-between` on the parent, since `space-between`
  would've left a single button sitting at the left instead of the
  right once the results row's two-button layout changed the shared
  parent rule.

<!-- MANEUVER-CARD-LAYOUT-LOCK-2026-08-05 -->
## Maneuver Card: Fixed Regions, Scrollbar Fix, Field Picker (implemented 2026-08-05)

Reported after click-anywhere-to-flip shipped: busy cards were showing
both vertical *and* horizontal scrollbars, which should never happen.
Alongside the fix, two new hard rules were set — title / Performed
History / bottom buttons must never scroll, change, or be hidden, and
action buttons must stay single-line — plus an open design question
about whether the results-entry side should show every field's control
at once (a maneuver like Ventricular Extrastimulus can have up to 8
distinct Refractory Period findings, most never all filled at once).

**Root cause of the scrollbar bug.** Two separate things, both fixed:
1. `.maneuverCardFindings` and `.maneuverDetailsBody` set `overflow-y:
   auto` but left `overflow-x` unset (default `visible`). Per the CSS
   overflow spec, an element with one axis non-`visible` and the other
   `visible` has the `visible` axis silently computed as `auto` too —
   so a region meant to scroll vertically only was quietly gaining a
   horizontal scrollbar whenever anything inside it (a long finding
   string, a wide refractory-period triplet row) was even slightly
   wider than the card. Fixed by setting `overflow-x: hidden` explicitly
   everywhere `overflow-y: auto` is used.
2. `.maneuverCardBack` had `overflow-y: auto` on the *whole back face*,
   not scoped to a body region — meaning the results/details header
   could scroll away with the rest of the content, and `.maneuverFieldList`
   was missing `min-height: 0`, so a flex child's default
   `min-height: auto` prevented it from ever shrinking enough for
   scrolling to actually engage; the whole face just grew instead.

**Fixed-region structure (both faces).** Standard flex-column
"pinned header / scrollable body / pinned footer" pattern, applied
consistently:
- `.maneuverCardFace` (shared base) now has `overflow: hidden` — this
  is what actually clips content at the card's rounded border; no
  scrolling happens at this level.
- Header row (`.maneuverCardTop` front / `.maneuverCardBackHeader`
  back) and footer row (`.maneuverCardBottomActions` /
  `.maneuverCardBackActions`) all get `flex: 0 0 auto` explicitly —
  without this, flex's default `flex-shrink: 1` on every child means
  *all* rows shrink proportionally under vertical pressure, not just
  the intended scroll region; `flex: 0 0 auto` makes header/footer
  categorically unshrinkable.
- The one designated body region per view (`.maneuverCardFindings`
  front, `.maneuverFieldList` results, `.maneuverDetailsBody` details)
  keeps `flex: 1; min-height: 0; overflow-y: auto; overflow-x: hidden`
  — it's the only thing allowed to scroll, and only vertically.
- Defense in depth against text forcing horizontal growth:
  `.maneuverFindingRow`/`.maneuverFindingText` get `min-width: 0` (lets
  flex children shrink below content width so text wraps instead of
  overflowing) and `.maneuverFieldRefractoryGroupRow` gets
  `flex-wrap: wrap` (so a 3-box triplet row on the narrowest grid
  column, 260px, wraps rather than overflows).

**Button labels shortened.** `Enter result`/`Edit result` → `Enter`/
`Edit`, `Maneuver details` → `Details` (both places it appears),
`Save result` → `Save`. `Cancel` and the details face's `Back` were
already short. Full wording is preserved for screen readers via
`aria-label` on each shortened button. `.maneuverCardAction` also
gained `white-space: nowrap` as a backstop — with these labels, no
combination of card width and button count should ever wrap to two
lines.

**Field picker ("landing page") on the results-entry side.** Rather
than rendering every response field's control at once, the results
face now defaults to a compact list — one row per field, in knowledge-
base order — showing just its label (the composed Refractory Period
label for RP-tagged fields, the field's own prompt otherwise) and, if
a value is already drafted, a right-aligned one-line preview plus a
`.hasValue` highlight. Tapping a row expands to that field's own entry
control (the existing `FieldControl`/`RefractoryPeriodTripletControl`,
unchanged), with a small "‹ All fields" link above it to go back to the
list. A maneuver with 0 or 1 possible fields skips the picker
entirely — nothing to choose between.
- `selectedFieldId: string | null` (new state) — `null` shows the
  picker, any field ID shows that field's editor. Reset by
  `openEditor()` each time results is entered: `null` if the maneuver
  has more than one field, otherwise the single field's ID.
- `draftFieldPreview(field, values)`: the live-draft equivalent of
  `summarizePerformance`'s per-field piece — same RP-triplet-join-with-
  trailing-blanks-trimmed logic, just reading `draftValues` instead of
  a saved `ManeuverPerformance`, so the picker can show progress before
  Save.
- Draft data persists across field switches (it's all still one
  `draftValues` object; only which field's control is *rendered*
  changes), so filling field A, going back to the list, and filling
  field B, then hitting Save, saves both — the picker is purely a
  display/navigation layer over the same save flow as before.
- The picker's own back-and-forth (list ↔ single field) is deliberately
  *not* wired into the whole-face click-anywhere behavior from the
  click-to-flip pass — clicking blank space on the results face still
  means "leave results, go to front" exactly as before, regardless of
  which sub-view is showing. Returning to the field list specifically
  requires the explicit "‹ All fields" button. Kept it this way rather
  than reinterpreting what "click the results face" means, since that
  contract was already agreed on and building a second, different
  meaning for the same gesture depending on sub-state seemed more
  confusing than a second small button.

<!-- ABOUT-MODAL-FREE-PRIVACY-NOTICE-2026-08-06 -->
## About Modal: Free-Forever + No-Server-Storage Notice (implemented 2026-08-06)

Requested addition to the About modal (the site's auto-opening landing
page): explain plainly that the site is free and will always be free,
and that case data isn't recorded or logged anywhere server-side.

- New `.modalPrivacyNotice` block in `app/page.tsx`'s `.modalBody`,
  placed right after the two intro paragraphs and before the
  "Knowledge base" section — the first thing a reader sees after
  learning what the workspace is. Two sentences: the free-forever claim
  (no account/subscription/paywall, now or planned), and the
  data-locality claim (case data lives in the browser for that session;
  saving a case downloads a local file to the user's own computer;
  there's no server-side database, and the site doesn't record, store,
  or log case information) — which is accurate to what's actually
  built: `app/case/persistence.ts` does a client-side Blob download for
  Save, nothing is POSTed to a server for case data.
- `app/globals.css`: new `.modalPrivacyNotice` style, deliberately
  separate from the existing `.modalNotice` class (used for the
  "demonstration content only" disclaimer) rather than reusing it —
  `.modalNotice` is amber (a caution/warning color), and this is
  reassurance, not a caveat, so it gets the same callout-box treatment
  (bordered, tinted background, rounded) in green instead, with
  `<strong>` text picking up `var(--green)` for the two key claims.

<!-- ACTIVE-CASE-TITLE-EDITABLE-2026-08-06 -->
## Active Case Title: Editable, Drives Save Filename + Report Title (implemented 2026-08-06)

The topbar's "Active case" label (`Untitled study` by default, from
`createInitialCase()` in `app/clinical/model.ts`) was static text. Made
it an editable field, since `caseRecord.title` already was — and
already is — the single source both `exportCaseRecord()`
(`app/case/persistence.ts`, used for the Save filename) and the report
generator (`app/report/generate.ts`, the report's first line) read
from. No new plumbing needed on the read side; only the write side
(there was previously no UI path to change `title` at all) needed
building.

- `app/page.tsx`: the `<strong>{caseRecord.title}</strong>` in
  `.activeCase` became a controlled `<input>` (`value={caseRecord.title}`,
  `onChange` writes straight into `caseRecord` via `setCaseRecord`).
  `onFocus` selects all text, so clicking in and typing replaces
  "Untitled study" wholesale rather than requiring a manual
  select-all — the common "click a document title, just start typing"
  pattern. `onBlur` resets to "Untitled study" if left blank, so an
  accidentally-cleared title can't produce an empty Save filename or a
  blank report header (though `slugify()` already had a
  `"diagnostic-pacing-case"` fallback for the filename specifically —
  this closes the same gap for the report title and the on-screen
  label itself).
- `app/globals.css`: new `.activeCaseTitleInput` — transparent
  background and border at rest so it still reads as a label, not an
  obvious form field, in a toolbar that's otherwise all buttons; a
  subtle border/background appears on hover and focus so it's
  discoverable as editable. Fixed `width: 150px` (`max-width: 220px`)
  keeps it from disrupting the topbar's layout regardless of title
  length.

<!-- BRAND-MARK-WORDMARK-2026-08-06 -->
## Header Brand Mark: "Dp.org" Wordmark Replaces "DP" Text (implemented 2026-08-06)

Explored replacing the topbar's plain "DP" text mark with a custom
line-art icon combining a pacing spike, calipers, and an electrogram
waveform, abstracted to spell D/P/M — sketched two directions (a wide
literal 3-letter strip vs. a compact square clinical pictogram) and
previewed both against a mockup of the real header bar to work out the
"legible letters want width, but the icon slot is a square" tension
before writing any code. That exploration was superseded — Murph
supplied an actual finished wordmark logo (a bold geometric "Dp.org"
lockup with overlapping D/p glyphs and a bullet-dot before "org") and
asked to use it directly instead, with its white background removed
and recolored to the app's palette.

- The source was a flat black-on-white raster image, not a vector —
  reproducing it by hand as SVG paths would have been both slow and
  inevitably slightly wrong. Used image processing instead: composited
  onto white (in case of stray transparency), took each pixel's
  luminance, and set alpha = 255 − luminance, so black art becomes
  fully opaque, white background becomes fully transparent, and every
  anti-aliased edge in between gets a smoothly interpolated alpha —
  free clean edges, no manual masking. Cropped tightly to content
  (small margin) and downsampled to a modest 357×240 PNG (retina-safe
  for the mark's ~34px on-screen display height, no need to ship the
  full-resolution original) at `public/logo-dpm.png`.
- Recoloring is done live in CSS, not baked into the PNG: `.brandMark`
  (`app/globals.css`) sets `background-color: var(--cyan)` and applies
  the PNG as a `mask-image` (`mask-mode: alpha`, `-webkit-mask-image`
  fallback for Safari) — since the asset is a pure alpha cutout with
  no meaningful RGB data, the mask clips the cyan fill to the
  wordmark's shape. Changing `--cyan` (or swapping in a different
  palette variable later, e.g. for a hypothetical light theme) restyles
  the mark automatically with no new asset needed.
- `app/page.tsx`: the old `<div className="brandMark">DP</div>` became
  an empty `<span className="brandMark" role="img" aria-label=
  "DiagnosticPacing.org" />` — the mark is now purely a CSS background,
  so there's no text content for the element to hold; `role="img"` +
  `aria-label` keeps it announced sensibly to screen readers instead of
  as blank space.
- The mark's own bordered/tinted box treatment (the rounded cyan-tinted
  square the old "DP" text sat in) was dropped — a multi-glyph wordmark
  doesn't read well boxed the way a 2-letter monogram did. Sized by a
  fixed height with width following the source image's aspect ratio
  rather than forcing it into the old 38×38 square.

**Follow-up, same day:** the full "Dp.org" wordmark was swapped for a
simpler "Dp" monogram (same overlapping-glyph style, no ".org"/dot/
"rg" tail) — same processing pipeline (luminance→alpha cutout, tight
crop, downsample to a 240px-tall PNG at `public/logo-dpm.png`, same
filename so no code reference changed), same CSS mask/recolor
mechanism. Only `.brandMark`'s fixed dimensions changed, since the new
source's aspect ratio is portrait rather than landscape (~0.57:1 vs.
~1.49:1) — now `width: 24px; height: 42px`. Matches the general
preference this session for "simpler is better" once a fancier option
was on the table.

<!-- ABOUT-MODAL-COPY-AND-MOBILE-FIX-2026-08-06 -->
## About Modal: Trimmed Copy, Legal Disclaimer, Mobile Lockout Fix (implemented 2026-08-06)

Three touch-ups reported together: the free-forever and privacy
callout had more explanation than needed, the "early GUI draft"
disclaimer was stale (the differential engine has been real for a
while now) and needed to say something legally meaningful instead, and
the modal was unusable on mobile — the OK button was rendering below
the visible viewport with no way to scroll to it, which matters a lot
since this modal auto-opens on load and offers the only way to
dismiss it.

- `.modalPrivacyNotice`'s free-forever line dropped its "no account,
  subscription, or paywall, now or planned" clause — just the bold
  claim now. Its privacy line was cut from a three-clause explanation
  down to one short sentence: "Case data never leaves your device. It
  stays in your browser and in any file you choose to save."
- `.modalNotice` (the amber callout at the bottom) no longer says
  anything about GUI/draft status. It's now a plain-language medical
  disclaimer: medicine can only be practiced by trained, licensed
  physicians, this workspace doesn't provide medical advice, and
  primary sources should be consulted before relying on anything it
  produces. Kept the same amber "caution" styling — appropriate for a
  disclaimer, unlike the green privacy notice above it.
- **Mobile lockout root cause:** `.aboutModal` had no `max-height` and
  no internal scroll region at all — just `width` and `overflow:
  hidden`. On a short viewport, the card would simply render taller
  than the screen, and `overflow: hidden` clips rather than scrolls,
  so the bottom of the card (where the only dismiss button lives) was
  literally unreachable. `.reportModal` already had the right pattern
  (`display: flex; flex-direction: column; max-height: 85vh` with an
  internally-scrolling body) — applied the same fix here:
  `.aboutModal` now caps at `85vh` and is a flex column;
  `.modalHeader`/`.modalFooter` get `flex: 0 0 auto` so they can never
  be squeezed; `.modalBody` gets `flex: 1; min-height: 0; overflow-y:
  auto` so it's the one thing that scrolls when the card's content
  (which grows over time as sections get added, like this one) doesn't
  fit. Same fixed-header/scrollable-body/fixed-footer recipe already
  used for the maneuver cards' scrollbar fix earlier this session.

<!-- VIOLET-SECTION-ACCENTS-2026-08-06 -->
## Case Structure Simplified + Violet Accent Committed to Style Guide (implemented 2026-08-06)

Two small requests handled together since they touched the same three
headers: the left rail's two-line "Case structure" / "Clinical
States" header was collapsed to just "Case structure" (redundant with
the rail's actual contents), and that header plus "Differential
diagnosis" (right rail) and "Pacing maneuvers" (main workspace panel)
were made larger and recolored — Murph liked the purple used for the
admin knowledge base's row-lock indicator and wanted it promoted from
a one-off admin color to a real style-guide entry, used here to make
these three section titles more visually distinct from the rest of
the GUI's cyan/muted palette.

- `app/globals.css` `:root`: added `--violet: #a78bfa;` — the same hex
  the admin lock indicator already used. `--locked` now reads
  `var(--violet)` instead of repeating the hex, so both names point at
  one color; `--locked` keeps its own name since "violet" doesn't
  describe what it means in the admin context, but they're
  intentionally the same value going forward.
- `app/page.tsx`: the rail header's `<p>Case structure</p>` +
  `<h2>Clinical States</h2>` pair became a single `<h2>Case
  structure</h2>` — one heading, not two.
- `Panel` (the shared component behind every workspace section) gained
  an optional `className` prop, applied to its outer `<section>`. Used
  only on the maneuver grid's `<Panel eyebrow="Pacing maneuvers" ...>`
  (now `className="maneuverPanel"`) so its eyebrow could be restyled
  without also restyling every other Panel's eyebrow (Current
  interpretation, Current finding, Recorded steps, ...), which all
  keep the original small-caps label look. The Differential diagnosis
  panel didn't need this — it's the only Panel inside
  `.differentialDiagnosisRail`, so `.differentialDiagnosisRail
  .panelHeader p` already scoped to just it.
- Sizing: `.clinicalStatesRailHeader h2`, `.differentialDiagnosisRail
  .panelHeader p`, and the new `.maneuverPanel .panelHeader p` all get
  the same treatment — `font-size: 17px`, `font-weight: 750`, `color:
  var(--violet)`, and (for the two that were previously small-caps
  eyebrows) `text-transform: none` / `letter-spacing: normal` instead
  of uppercase tracking, since a heading at this size reads better in
  sentence case than shouty small caps.
- As with earlier passes this session, found this file's
  `.clinicalStatesRailHeader`/`.differentialDiagnosisRail .panelHeader`
  rules defined three times each (an accumulation of superseded
  full-rewrite passes — see the "Matched Clinical States and
  Differential monitor rails v1" section) and edited only the
  cascade-winning (last-defined, ~line 2627+) copies; the earlier dead
  duplicates were left alone, out of scope for this pass.

<!-- ENTER-KEY-ABOUT-OK-AND-MANEUVER-AUTOSAVE-2026-08-06 -->
## Enter Key Confirms About Modal; Maneuver Card Results Autosave (implemented 2026-08-06)

Two GUI friction points: pressing Enter while the About/landing modal
was open did nothing (only clicking OK worked), and every edit to a
maneuver card's results had to end with an explicit Save click or the
data was lost — including a "Cancel" affordance that quietly discarded
whatever had been typed.

- `app/page.tsx`: while `aboutOpen` is true, a `keydown` listener on
  `window` closes the modal on Enter (`event.preventDefault()` +
  `setAboutOpen(false)`), added/removed via a `useEffect` keyed on
  `aboutOpen`. No guard needed against text inputs swallowing Enter —
  the modal has none.
- `app/maneuvers/ManeuverCard.tsx`: "Cancel" and "Save result" merged
  into one "Done" button. There's no longer a distinct discard path —
  `leaveResults()` (renamed from `handleSave`) commits `draftValues`
  and flips to front, and it's now what every way of leaving the
  results side calls: the Done button, and the results face's
  whole-card click-to-flip (previously `setFlipState("front")` with no
  save, matching the old Cancel behavior — that's exactly the
  no-longer-wanted "flip away without saving" case).
- Also added a debounced autosave so data reaches the differential
  engine even if the card is simply left open: a `useEffect` (deps
  `[flipState, draftValues, onSave]`) starts a 3-second `setTimeout`
  on every `draftValues` change while `flipState === "results"`,
  committing via `onSave` if the timer completes uninterrupted. A
  debounce rather than a fixed-interval tick on purpose — it resets on
  each keystroke, so it fires once a few seconds after the user
  actually stops (not mid-keystroke on a half-typed number), and does
  nothing while they're still actively typing.
- `lastCommittedValuesRef` (a ref holding a JSON snapshot of whatever
  was last actually passed to `onSave`) guards both `leaveResults` and
  the autosave timeout against committing — and logging a case-timeline
  entry for — a no-op. Without it, every mechanism above would fire
  unconditionally: opening a card just to look (no edits) and clicking
  away would log a spurious unchanged "Maneuver result" entry, and the
  debounce firing moments before a Done click would log the same
  values twice. `openEditor()` seeds the ref from the active
  performance's values each time the results side is (re)opened, so
  the comparison is always against what's genuinely already committed
  for the active Clinical State.

<!-- REFRACTORY-PERIODS-SIMPLIFY-2026-08-06 -->
## Refractory Period Tagging Simplified: Direction Only (implemented 2026-08-06)

The Refractory Period tagging schema on the Maneuver Response Fields
sheet started as three columns — Type (Functional/Effective), Direction
(Antegrade/Retrograde/n/a), Structure (7 anatomical options) — that
jointly flagged a field as an RP result, picked 1-vs-3 entry boxes
(Type), grouped the derived Refractory Periods panel into two rows
(Direction), and composed a clinician-facing label from all three
(`composeRefractoryPeriodLabel`). The user asked to remove the
Structure column as redundant and pull the maneuver-card prompt text
from the field's own Maneuver Response Prompt instead — then, mid-way
through, asked to remove the Type column too.

Investigation found Structure was purely cosmetic (folded into the
composed label, nothing else read it), but Type was load-bearing: it
was the sole signal for the Functional-vs-Effective 1-vs-3 box-count
distinction and, along with Structure, for whether a field was an RP
result at all. Removing it outright would silently collapse that
distinction. Rather than guess, I used AskUserQuestion to lay out the
tradeoff. The user chose: **remove both Type and Structure; every RP
field always renders exactly 3 optional boxes** (a second and third
extrastimulus, left blank if not performed) — accepting the loss of
the Functional/Effective box-count distinction as a deliberate
consequence.

- `app/admin/model.ts`: removed the `refractoryPeriodType` and
  `refractoryPeriodStructure` column definitions from the
  `maneuverResponseFields` sheet entirely. `refractoryPeriodDirection`
  (options `["n/a", "Antegrade", "Retrograde"]`) is now the sole RP
  signal — it both flags a field as an RP result (`n/a` means "not
  one") and picks which row of the derived panel it appears in. Its
  `modelUse` text was rewritten to explain that the field's own
  Maneuver Response Prompt is now the full clinician-facing label
  (e.g. "AVN ERP") and that it always renders as up to three boxes.
- `app/maneuvers/knowledge.ts`: `RefractoryPeriodTag` narrowed to
  `{ direction: RefractoryPeriodDirection }` (dropped `type`,
  `structure`); `RefractoryPeriodDirection` narrowed to
  `"Antegrade" | "Retrograde"` (no more `"n/a"` at the parsed-tag
  level — `"n/a"`/blank now just means `parseRefractoryPeriodTag`
  returns `null`, i.e. not an RP field).
- `app/refractoryPeriods/knowledge.ts`: `RefractoryPeriodDefinition`
  simplified to `{ id, direction, label, fieldId, prompt, maneuverId,
  maneuverName, componentCount: 3 }` — `label` is now just
  `field.prompt`, not a composed string. Removed
  `composeRefractoryPeriodLabel`, `refractoryPeriodComponentCount`,
  and the `STRUCTURE_ABBREVIATIONS`/`TYPE_ABBREVIATIONS` tables.
  Added `REFRACTORY_PERIOD_COMPONENT_COUNT = 3` as a named constant so
  every call site still reads "how many boxes" rather than a bare
  magic number.
- `app/maneuvers/ManeuverCard.tsx`: the field-picker button, draft
  preview, and performance summary all now show `field.prompt`
  directly instead of a composed label. `RefractoryPeriodTripletControl`
  and `renderFieldControl`'s dispatch both branch on
  `field.refractoryPeriod` being non-null (was `.type === "Effective"`)
  and always render `REFRACTORY_PERIOD_COMPONENT_COUNT` (3) boxes.
- `app/report/generate.ts`: `refractoryPeriodLines` was still calling
  the now-removed `composeRefractoryPeriodLabel(definition.type, "n/a",
  definition.structure)` — this file wasn't touched by the initial
  pass and would have failed to compile. Fixed to use
  `definition.label` (the field's own prompt) directly.
- `knowledge/validation.ts`: removed `refractoryPeriodTagKey` and both
  of its call sites (the cross-workbook uniqueness check in
  `validateWorkbook` and the pairwise collision check in `validateRow`,
  each previously attaching an error to the `refractoryPeriodStructure`
  column). The check existed only because the old composed label had
  no tiebreaker if two fields collided on the same (Type, Direction,
  Structure); with free-text labels there's no collision to detect —
  two fields sharing a Direction is normal and expected.
- Stale "Type/Direction/Structure" explanatory comments updated in
  `app/page.tsx` and `app/clinical/model.ts` to describe the
  Direction-only scheme.
- `pruneUnknownColumns()` in `app/admin/model.ts` (a generic,
  schema-driven mechanism from an earlier session) requires no changes
  to strip the now-removed `refractoryPeriodType`/
  `refractoryPeriodStructure` keys from any production Blob rows that
  still carry them — it already removes any column key not present in
  the current schema.
- Known dormant edge case, not addressed: a field that was genuinely
  RP-tagged under the old schema with Direction left at `"n/a"` (valid
  for Structure options without a directional distinction, e.g. some
  atrial/ventricular measurements) will now silently stop being
  recognized as an RP field, since Direction is the sole remaining
  signal and `"n/a"` means "not one." Per the schema's own prior
  documentation this combination was "not used in practice," so no
  production data is expected to hit it, but it's worth knowing if an
  RP result ever mysteriously stops appearing on the derived panel.
- Verification: `npx tsc --noEmit` clean; `npx eslint` on all touched
  files shows only the one known pre-existing `react-hooks/purity`
  finding in `app/page.tsx`'s `addClinicalState` (`Date.now()` during
  render), unrelated to this change and already present before it.

<!-- STATE-TAG-STANDARDIZE-2026-08-08 -->
## Standardized Clinical State Tag: Text + Style (implemented 2026-08-08)

The compact Clinical State tag (`formatClinicalStateTag` /
`formatRefractoryPeriodStateTag`) appears in three places — Refractory
Period panel findings, maneuver card performed-history chips, and
maneuver card per-finding rows — and had drifted into three different
visual treatments over separate sessions: a plain cyan label with no
pill, a bordered pill that recolored to green when it belonged to the
active Clinical State, and a bold uppercase label that also recolored
by active state. The user asked for one standardized appearance
everywhere, with exact tag text.

The tag is derived from two axes of `ClinicalStateContext`: ablation
phase (`Pre-ABL` when `phase === "Pre-ablation"`; `Post-ABL` when
`phase` is `"Post-ablation"` or `"Post-ablation 2"` — collapsed
together, same bucketing as before) and isoproterenol status (`Iso-On`
when `isoproterenol` has a non-blank dose entered; `Iso-Off` when
blank), joined as `"Pre-ABL · Iso-On"`. This is unchanged logic — only
the label text and hyphenation are new (was `"Pre"`/`"Post"`/`"Iso
on"`/`"Iso off"`).

Two design questions were asked via AskUserQuestion before
implementing, since both had real layout/behavior implications across
three files:
- **Combined vs. split tags** — keep phase + iso as one joined pill
  (`"Pre-ABL · Iso-On"`), or split into two independent pills. User
  chose combined — closest to the existing layout.
- **Active-state color** — keep the existing behavior where the tag
  recolors (to green) when it belongs to the active Clinical State, or
  give the tag a single fixed color always and signal "active" some
  other way. User chose fixed color always.

Changes:
- `app/clinical/model.ts`: extracted `clinicalStateAblationTag(phase)`
  and `clinicalStateIsoTag(isoproterenol)` as named, individually
  exported functions (previously an inline private
  `clinicalStateTagPhaseBucket` plus an inline ternary) returning the
  new `ClinicalStateAblationTag`/`ClinicalStateIsoTag` literal types.
  `formatClinicalStateTag` composes them unchanged in shape, just with
  the new text.
- `app/globals.css`: `.refractoryPeriodFindingTag`, `.maneuverHistoryTag`,
  and `.maneuverFindingTag` now share an identical pill treatment —
  `border-radius: 999px`, cyan border/background/text
  (`rgba(91, 214, 220, ...)` / `var(--cyan)`), `font-size: 8.5px`,
  `font-weight: 700`, `letter-spacing: 0.02em` — fixed regardless of
  active state. `.maneuverFindingTag` also lost its `text-transform:
  uppercase` (the other two were never uppercase) and its own
  active/inactive color swap, since `.maneuverFindingRow.isActiveState`
  already highlights the whole row via border/background — no
  redundant per-tag signal needed there. `.maneuverHistoryTag`, which
  has no equivalent row-level highlight of its own, keeps an
  `.isActiveState` modifier but changed it to `box-shadow: 0 0 0 1px
  var(--green)` — a ring around the pill — instead of recoloring the
  pill's border/background/text, per the user's answer.
  `.maneuverFindingRow`'s `align-items` changed from `baseline` to
  `center` so the now-padded pill sits centered against the finding
  text instead of hanging off its text baseline.
- No JSX changes needed in `app/page.tsx` or
  `app/maneuvers/ManeuverCard.tsx` — all three call sites already just
  render whatever `formatClinicalStateTag`/`formatRefractoryPeriodStateTag`
  returns inside their existing `className`, so the text and style
  changes took effect purely from the `model.ts` and `globals.css`
  edits.
- Verification: `npx tsc --noEmit` clean; `npx eslint` on touched files
  shows only the same pre-existing, unrelated `react-hooks/purity`
  finding noted in the section above.

<!-- CONTEXT-CHANGE-PROMPT-2026-08-08 -->
## New-State Prompt on Context Change After Findings Recorded (implemented 2026-08-08)

Changing Phase, Rhythm, Sedation, Isoproterenol, Adenosine, or
Epinephrin on the active Clinical State used to silently rewrite that
state's context in place, even if intervals had already been measured
or a maneuver result already recorded under the old context — which
would retroactively relabel that recorded data as having been captured
under whatever the field was just changed to. The user asked for a
prompt in that situation, offering to start a new Clinical State
instead.

The user explicitly left the exact wording and mechanics open ("open
to suggestions"), so this pass made the implementation calls directly
rather than routing every sub-decision through AskUserQuestion — the
request itself already resolved the one thing that would have
mattered most (fire only when the active state already has something
recorded, not on every change), and the rest were mechanical enough to
just build and let the user react to.

- `app/clinical/model.ts`: added `clinicalStateHasFindings(clinicalState)`
  — true if any interval measurement is non-blank, or any maneuver
  performance has at least one non-blank value. Deliberately excludes
  the six guarded context fields themselves (a state's own Phase/
  Rhythm/Sedation/dose values were never "findings" to protect).
- `app/page.tsx`:
  - `GuardedContextField` (= `keyof ClinicalStateContext`, all six
    fields are guarded) and `PendingContextChange` — the latter holds
    `key`, `label`, `previousValue`, `nextValue`, and `alreadyApplied`.
  - `alreadyApplied` exists because the two field kinds reach the
    prompt differently: the three `<select>` fields are intercepted in
    `requestContextChange` *before* anything is written anywhere
    (`alreadyApplied: false`), while the three dose `<input>` fields
    still write to context on every keystroke exactly as before (kept
    for a responsive typing feel — not changed by this feature), so by
    the time `handleContextFieldBlur` can compare against the value
    captured on focus (`contextFieldBaselineRef`), the edit is already
    sitting in the active state's context (`alreadyApplied: true`).
    Resolving the prompt has to account for which kind it is.
  - `resolvePendingContextChange("new-state" | "keep-here" | "cancel")`:
    "keep-here" applies the change to the current state (or is a no-op
    plus a log entry, if already applied); "cancel" reverts the
    already-applied case back to its focus-time baseline (selects have
    nothing to revert, since they were never written); "new-state"
    appends a new Clinical State via `appendClinicalStateFrom`, seeded
    from every other field of the outgoing state's context plus the
    new value for just the changed field — reverting the outgoing
    state's already-applied edit in the very same `setCaseRecord` call
    that appends the new state, so the two writes can't race.
  - `appendClinicalStateFrom` supersedes `addClinicalState`'s narrower
    phase+sedation-only carry-forward for this one code path — the
    "start a new state" resolution carries forward the *entire*
    context, which reads more correctly as "everything the same except
    the one thing that changed." `addClinicalState` itself (the
    toolbar's plain NEW button, a distinct explicit action) is
    unchanged.
  - New `.contextChangeModal` (reusing the established `.modalBackdrop`
    + fixed-header/scrollable-body/fixed-footer pattern from
    `.aboutModal`/`.reportModal`), offering three buttons: "Start new
    state" (primary, filled cyan `.modalOkButton`), "Change this
    state" (bordered neutral `.modalSecondaryButton`), "Cancel"
    (borderless `.modalGhostButton` — new, first use of either
    secondary treatment in the app).
  - Clicking the backdrop or dismissing without an explicit choice
    resolves as "cancel", same convention as the About/Report modals.
- Also fixed in passing: both `addClinicalState` and the new
  `appendClinicalStateFrom` used to read `Date.now()` directly for
  their id, the exact `react-hooks/purity` violation the codebase
  already has a house pattern for (see `ablationSessionCounterRef`) —
  added the equivalent `clinicalStateCounterRef` and switched both to
  it. This was the one pre-existing lint finding noted in every prior
  session's verification note; `npx eslint app/` is now fully clean,
  not just clean-except-that-one-finding.
- Known gap, not addressed (mirrors an identical, already-accepted gap
  in `ablationSessionCounterRef`): neither counter ref is resynced when
  a case is opened from a file, only initialized once from whatever
  `caseRecord` looked like at mount. Opening a saved case with more
  states/sessions than the ref currently reflects could produce a
  duplicate id. Out of scope for this pass — flagging since the fix
  I just made narrows the gap between the two counters but doesn't
  close it for either.
- Verification: `npx tsc --noEmit` clean; `npx eslint app/` fully
  clean (zero findings, including the previously-noted pre-existing
  one — see above).

<!-- STATE-TAG-COLOR-2026-08-08 -->
## Clinical State Tag: Per-Value Colors, Active Highlight Kept (implemented 2026-08-08)

Revisits STATE-TAG-STANDARDIZE-2026-08-08 from earlier the same day.
That pass gave the tag one fixed color (cyan) everywhere and kept
"active state" as a separate highlight (ring or row background) rather
than a color swap, per the user's answer to the AskUserQuestion asked
at the time. The user has now asked for the opposite trade on the
*identity* side while keeping the *active* side unchanged: each of the
four possible tag values (Pre-ABL, Post-ABL, Iso-On, Iso-Off) should
have its own distinct color from the existing style guide, and the
active-state highlight should still be there.

Color assignments, deliberately excluding `--green` (reserved
exclusively for the active-state highlight everywhere it already
appears — `.maneuverHistoryTag.isActiveState`'s ring,
`.maneuverFindingRow.isActiveState`'s row background — so green can't
mean two different things in the same view):
- Pre-ABL — `--cyan` (kept from the prior single-color pass, so the
  most-common/baseline value didn't change).
- Post-ABL — `--violet`.
- Iso-On — `--red`.
- Iso-Off — `--amber`.

The Phase axis (Pre-ABL/Post-ABL) uses the "cool" pair (cyan/violet)
and the Iso axis (Iso-On/Iso-Off) uses the "warm" pair (amber/red), so
the two axes read as visually distinct groups in addition to each of
the four individual values being distinguishable. This exact mapping
was a judgment call, not something the user specified value-by-value —
flagging in case any of the four should be swapped.

- New `app/clinical/ClinicalStateTagText.tsx`: a small presentational
  component that takes the already-formatted tag string (e.g.
  "Pre-ABL · Iso-On") and splits it on `" · "` into two independently
  colored `<span>`s, rather than taking a `ClinicalStateContext`
  directly. This was the key design choice that kept the change
  minimal — `RefractoryPeriodFinding.stateTag` only ever carried the
  formatted string, not the context it came from, so parsing the
  string back apart (safe, since the format is entirely ours and only
  ever has two fixed possible values per slot) avoided touching that
  type or `refractoryPeriods/knowledge.ts` at all. All three render
  sites (`app/page.tsx`'s two Refractory Period finding lists,
  `app/maneuvers/ManeuverCard.tsx`'s history chips and finding rows)
  now render `<ClinicalStateTagText tag={...} />` instead of the raw
  string, with no other JSX restructuring.
- `app/globals.css`: `.refractoryPeriodFindingTag`, `.maneuverHistoryTag`,
  and `.maneuverFindingTag` dropped their fixed cyan
  border/background/color in favor of a neutral pill (`var(--border)` /
  a faint white wash) — color now lives entirely on the new
  `.stateTagPhase.isPre`/`.isPost` and `.stateTagIso.isOn`/`.isOff`
  rules. `.maneuverHistoryTag.isActiveState`'s green ring and
  `.maneuverFindingRow.isActiveState`'s green-tinted row background are
  unchanged — still the only place green appears on this tag.
- `app/clinical/model.ts`: `formatClinicalStateTag`'s doc comment
  updated to point at `ClinicalStateTagText` instead of the
  now-inaccurate "single shared pill style" description.
- Verification: `npx tsc --noEmit` clean; `npx eslint app/` fully
  clean.

<!-- CASE-STRUCTURE-CARD-REWORK-2026-08-08 -->
## Case Structure Card Rework: Rhythm+CL Title, Standardized Tag (implemented 2026-08-08)

The Case Structure rail cards (`.clinicalStateCard`) showed Phase,
Rhythm, and Iso as three equally-weighted fields in a row
(EQUALIZE-CLINICAL-STATE-CARD-2026-08-04). The user asked to rework
this now that the standardized Clinical State tag exists: Rhythm
should become the card's headline, with cycle length appended when the
state is Tachycardia, and the tag (Pre-ABL/Post-ABL · Iso-On/Iso-Off)
should carry the Phase/Iso information the old field grid used to.

- `app/clinical/model.ts`: added `tachycardiaCycleLengthMs(clinicalState)`
  — the shorter of the `interval.aa`/`interval.vv` measurement values,
  whichever is present (only one measured is still the best available
  number; both measured, the shorter one is the true cycle length).
  Returns `null` for any non-Tachycardia state or if neither field has
  a valid positive number yet. The two field ids are the fixed ones
  the Tachycardia `workspaceConfigurations` entry always uses (see the
  `interval()` helper) — source-level constants, not admin-editable
  knowledge base data, so safe to reference by literal string.
- `app/page.tsx`: the old `.clinicalStateFields` three-column grid
  (Phase/Rhythm/Iso) is gone. In its place: `.clinicalStateCardTitle`
  holds the Rhythm name (still run through the existing
  `abbreviateClinicalStateLabel` knowledge-base lookup, unchanged) at
  a larger/bolder weight than anything else on the card, plus
  `.clinicalStateCardCycleLength` ("CL 320 ms") right next to it when
  `tachycardiaCycleLengthMs` returns non-null. Below that, a
  `.clinicalStateCardTag` renders `<ClinicalStateTagText tag={...} />`
  — the same colored Pre-ABL/Post-ABL · Iso-On/Iso-Off tag used
  everywhere else in the app now, giving these cards the Phase/Iso
  information the removed field grid used to carry, in the same visual
  language as the maneuver cards and Refractory Periods panel.
  Sedation was never shown here and still isn't — out of scope, not
  requested.
- Accepted tradeoff, flagged rather than silently absorbed: the old
  Phase field showed the exact value (including the KB-abbreviated
  distinction between "Post-ablation" and "Post-ablation 2") — the new
  tag only shows the coarser Pre-ABL/Post-ABL bucket, same collapsing
  `clinicalStateAblationTag` already applies everywhere else this tag
  is used. This is the literal ask ("use this new tagging to express
  ... information on the case structure cards"), not an oversight.
- `app/globals.css`: introduced `.stateTagPill` as the shared base for
  every property that was identical across all three existing tag
  call sites (`.refractoryPeriodFindingTag`, `.maneuverHistoryTag`,
  `.maneuverFindingTag`) plus the new fourth one
  (`.clinicalStateCardTag`) — adding a fourth copy of the same nine
  declarations was the trigger to finally do this refactor. Each
  semantic class now only keeps what's genuinely specific to its own
  layout context (`.refractoryPeriodFindingTag`/`.clinicalStateCardTag`:
  `align-self: flex-start`; `.maneuverFindingTag`: `flex: 0 0 auto`;
  `.maneuverHistoryTag`: nothing extra beyond its `.isActiveState`
  ring) and is applied in JSX alongside `stateTagPill` in `className`.
  Replaced the now-dead `.clinicalStateFields`/`.clinicalStateField`/
  `.clinicalStateFieldLabel`/`.clinicalStateFieldValue` rules (the
  cascade-winning copies only — the older, already-dead duplicate set
  from an earlier full-rewrite pass was left alone, same
  out-of-scope precedent as always) with
  `.clinicalStateCardTitle`/`.clinicalStateCardRhythm`/
  `.clinicalStateCardCycleLength`.
- Verification: `npx tsc --noEmit` clean; `npx eslint app/` fully
  clean.

<!-- TUTORIAL-WALKTHROUGH-2026-08-08 -->
## Guided Walkthrough Tutorial (implemented 2026-08-08)

A new "Walkthrough" button next to About opens a full-screen guided
tour: one section of the GUI spotlighted at a time, in a fixed
sequence, each with a short explanation and Back/Next/Skip controls.
Manual-open only (no auto-open on load, unlike About) — purely a
button-triggered reference tour, per the request.

- New `app/tutorial/Tutorial.tsx`, self-contained: `TUTORIAL_STEPS` is
  an array of `{ title, body, target }`, where `target` is a plain CSS
  selector (or `null` for the centered opening/closing stops) resolved
  fresh via `document.querySelector` on every step change. A selector
  was chosen over refs deliberately — the eleven stops span several
  independently-defined page.tsx sections plus `ManeuverCard`
  instances, and threading a ref through all of them would have been
  far more invasive than a handful of existing, already-unique class
  names / aria-labels the elements already carry.
- Spotlight technique: the classic oversized `box-shadow`
  trick — `.tutorialSpotlight` is a small `position: fixed` box sized
  to the target's `getBoundingClientRect()` (plus 8px padding), with
  `box-shadow: 0 0 0 9999px rgba(2, 8, 12, 0.78)` painting the dim
  everywhere *outside* its own rect, plus a cyan ring
  (`0 0 0 2px var(--cyan)`) for definition. A separate full-viewport
  `.tutorialBlocker` (`pointer-events: auto`, transparent whenever a
  spotlight is present) sits underneath and does the actual click-
  blocking across the *whole* viewport, including inside the
  spotlighted rect — the box-shadow trick alone only affects paint, not
  hit-testing, so without this second layer clicks inside the "hole"
  would still reach the live page underneath it. The walkthrough is
  therefore deliberately non-interactive: a narrated tour, not a
  "try it live" one, so there's no risk of a tour step accidentally
  editing real case data. `.tutorialBlocker`'s own background only
  paints the dim color on the two `target: null` steps, where there's
  no spotlight box to derive the dimming from otherwise.
- Positioning: `computeCardPosition()` picks whichever side (below /
  above / right / left of the target) has the most room in the current
  viewport, then clamps the result to stay fully on-screen with a 16px
  margin. Card size is measured via a ref in a `useLayoutEffect` (after
  the card has rendered at its natural size, so variable-length body
  text is accounted for) rather than assumed, keyed on both `rect` and
  `stepIndex` so it re-runs on every step. Runs synchronously before
  paint to avoid a visible flash at the wrong position.
- Live tracking: the target's rect is re-measured on every
  resize/scroll event (not just once per step), and each step change
  triggers one `scrollIntoView({ behavior: "smooth", block: "center" })`
  call on the target — needed for plain-document-flow sections
  (Refractory Periods, Ablation, the maneuver grid, the state log)
  that can be off-screen; a no-op for the two `position: fixed` side
  rails and the sticky topbar fields, which are always already in
  view. A missing target (e.g. the Intervals step, if the active
  state's Rhythm happens to be AV Pacing, which has zero measurement
  fields) degrades to a centered card with no spotlight rather than a
  broken empty box.
- Step selectors used: `.topActions`, `.clinicalStatesRail`,
  `.stateToolbarRow`, `.clinicalMeasurementRow`,
  `[aria-label="Refractory Periods"]`, `[aria-label="Ablation"]`,
  `.maneuverPanel`, `.differentialDiagnosisRail`, `.stateLogPanel` —
  all pre-existing, already-unique class names/aria-labels, so no
  selector or markup changes were needed anywhere else in the app.
- **Deliberately excluded from the tour, and worth flagging as a
  separate finding**: while mapping out sections, found three pieces
  of static/placeholder UI that don't actually do anything —
  the "Evidence and reasoning" panel (`eyebrow="Current interpretation"`)
  in `app/page.tsx`'s `.workspace` section, which renders a hardcoded
  fake synthesis ("Typical AVNRT is favored...") with no binding to
  live case data at all; the "Maneuver result entry" panel
  (`eyebrow="Current finding"`) in `.lowerWorkspace`, whose only
  content is a static empty-state and an "Enter manually" button with
  no `onClick` handler; and the top half of the "Case timeline" panel
  (`.timeline`, inside the same `eyebrow="Recorded steps"` Panel as
  the real `.stateLogPanel`), which shows two hardcoded fake rows
  ("Baseline observations" / "Retrograde activation review") unrelated
  to the actual case. These all predate this session and were left
  fully untouched — not a regression, not something this task was
  asked to fix — but a tutorial step describing any of them as
  functional would have been actively misleading, so the tour was
  built to route around them instead (the real, live differential
  output is the actual target of the Differential Diagnosis step; the
  real, live audit trail is `.stateLogPanel` specifically, not the
  whole "Recorded steps" panel). Worth wiring up or removing in a
  future pass.
- `app/page.tsx`: `tutorialOpen` state (manual-open only, no auto-open
  effect like `aboutOpen` has). The Walkthrough button's `onClick`
  closes About and Report first, so the tutorial's overlay is never
  stacked on top of another modal.
- `app/globals.css`: `.walkthroughButton` mirrors `.aboutButton`
  exactly but as its own class (same reasoning as
  `.modalSecondaryButton`/`.modalGhostButton` earlier this session —
  visually identical today, free to diverge later since they open
  unrelated things), hidden at the same mobile breakpoint
  `.aboutButton` already was. New `.tutorialBlocker`
  (z-index 400) / `.tutorialSpotlight` (401) / `.tutorialCard` (402) —
  comfortably above `.modalBackdrop`'s z-index 100 and every rail/topbar
  z-index in the app. `.tutorialCardNav` reuses `.modalSecondaryButton`/
  `.modalOkButton` from the context-change prompt work earlier today,
  sized down slightly for the more compact tutorial card.
- Verification: `npx tsc --noEmit` clean; `npx eslint app/` fully
  clean (including fixing two `react-hooks/exhaustive-deps` warnings
  on the keyboard-shortcut effect by wrapping `goNext`/`goBack` in
  `useCallback`).

<!-- MANEUVER-RESULT-ENTRY-REMOVED-2026-08-08 -->
## Maneuver Result Entry Panel Removed + Yes/No Buttons Input Type (implemented 2026-08-08)

Two related changes requested together: removing dead UI flagged during
the Walkthrough tutorial work above, and adding a new admin-configurable
input type the maneuver cards can use going forward.

**Maneuver result entry panel removed.** The "Maneuver result entry"
Panel (`eyebrow="Current finding"`) inside `.lowerWorkspace` — one of
the three placeholder sections flagged as non-functional in
`TUTORIAL-WALKTHROUGH-2026-08-08` above (static empty-state, "Enter
manually" button with no `onClick`) — is now deleted from `app/page.tsx`
entirely. Per explicit instruction, its sibling in the same
`.lowerWorkspace` row, the "Case timeline" Panel (`eyebrow="Recorded
steps"`, containing both the still-fake `.timeline` top half and the
real, live `.stateLogPanel`), was left fully in place — both the
synthesis/"Evidence and reasoning" panel elsewhere on the page and this
Case timeline panel are earmarked to be wired up later, not removed now.
`.lowerWorkspace`'s grid went from a two-column `0.75fr 1.5fr` split to
a single `minmax(0, 1fr)` column now that Case timeline is the only
child. Orphaned `.emptyState` CSS (the standalone block plus its two
entries in shared selectors alongside `.diagnosisText`/`.evidenceList`)
was removed from `globals.css`; confirmed via grep it no longer appears
anywhere in the file.

**Yes/No Buttons input type.** The Response Fields admin sheet's
existing `inputType` column (`app/admin/model.ts`) gained a sixth
option, `"Yes/No Buttons"`, alongside Checkbox/Single Select
Dropdown/Multi Select Dropdown/Number Field/Text Field(s). Rendered in
`ManeuverCard.tsx`'s `FieldControl` as two buttons, Yes and No
(`.maneuverFieldYesNo` / `.maneuverFieldYesNoButton` in `globals.css`,
visually matching the existing `.ablationModalityToggle` segmented-
toggle language but sized to match the other maneuver field controls).
The deliberate difference from Checkbox, spelled out in both the admin
sheet's `modelUse` guidance text and a code comment on the
`FieldControl` branch: Checkbox always starts unchecked, which is
indistinguishable from an actual recorded "No" — Yes/No Buttons always
starts with *neither* button selected (`value === ""`, unset until the
field is first touched), so "not yet answered" stays visually distinct
from "answered No" until the clinician actually clicks one. Clicking
the already-selected button again clears it back to unset rather than
forcing a permanent choice between only the two options, in case an
entry was made by mistake.

No second hardcoded list of input-type option strings exists anywhere
else in the codebase — confirmed via a repo-wide grep for the other
five option strings, which turned up only the admin sheet's own
`options` array (the sole source of truth), `ManeuverCard.tsx`'s
lowercase string-comparison consumer of it, an unrelated CSS class name
(`.maneuverFieldCheckbox`) coincidentally containing "Checkbox", and
historical prose in this document.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- ABLATION-AS-PHASE-2026-08-08 -->
## Ablation Folded Into Phase + Pacing Maneuvers Subhead Removed (implemented 2026-08-08)

Two changes, requested together.

**Pacing Maneuvers subhead removed.** The explanatory paragraph under
the "Pacing maneuvers" panel eyebrow ("Ordered by relevance to the
current differential — no separate 'already performed' section...")
is gone from `app/page.tsx`. `activeClinicalStateSummary` (the value it
used to interpolate) is still used elsewhere on the page, so nothing
else needed to change.

**Ablation is now a Phase value, not its own section.** Previously
ablation sessions (Modality/Location/#Ablations/Duration) lived in a
permanently-visible standalone card between Refractory Periods and
Pacing Maneuvers. Per Murph's request, that card is gone; `"Ablation"`
was added to `phaseOptions` in `app/clinical/model.ts` (ordered
`Pre-ablation, Ablation, Post-ablation, Post-ablation 2`, matching
chronological workflow), and the Active Clinical State's Intervals row
now conditionally renders as **Ablation Details** instead of the normal
per-Rhythm interval fields whenever the active state's Phase is
`"Ablation"`:

- `app/page.tsx` computes `isAblationPhase = activeClinicalState.context.phase === "Ablation"`
  right where `activeWorkspace` is derived (Phase and Rhythm are
  independent context fields, so this is its own boolean rather than
  another per-Rhythm `workspaceConfigurations` entry). The
  `.clinicalMeasurementRow` block that used to unconditionally map
  `activeWorkspace.sections` now branches: `isAblationPhase` renders one
  `.clinicalMeasurementRow` with an "Ablation Details" heading and the
  exact same `.ablationRow` session markup (badges for collapsed
  sessions, live fields for the active one, the `+` add button) that the
  old standalone section used verbatim, byte-for-byte — same state
  (`caseRecord.ablationSessions`, `activeAblationSessionId`), same
  handlers (`updateAblationSession`, `toggleAblationModality`,
  `addAblationSession`, `removeAblationSession`), same CSS classes.
  Otherwise it falls back to the original per-Rhythm Intervals rendering
  unchanged. This means switching Phase to/from Ablation on the active
  Clinical State is the only thing that swaps the view — Rhythm keeps
  driving which interval fields show up the rest of the time.
- The standalone `<section className="effectiveRefractoryPeriodCard
  ablationCard" aria-label="Ablation">` between Refractory Periods and
  the maneuver grid is deleted outright. `.ablationCard` was already a
  no-op class (nothing in `globals.css` ever selected on it — the shared
  look came entirely from `.effectiveRefractoryPeriodCard`), so no CSS
  rule needed removing, only the JSX. `.ablationRow` and its descendant
  classes (`.ablationSessionBadge`, `.ablationField`,
  `.ablationModalityToggle`, etc.) were already self-contained — none
  were scoped under a `.ablationCard`/`.effectiveRefractoryPeriodCard`
  parent selector — so they needed no CSS changes to keep working once
  relocated into `.clinicalMeasurementRow`, which uses the identical
  `165px minmax(0, 1fr)` two-column grid `.effectiveRefractoryPeriodCard`
  did. The explanatory comment above `.ablationRow` was rewritten to
  describe the new context instead of the old standalone card.
- **Ablation-phase tag bucketing.** The existing Pre-ABL/Post-ABL tag
  system (`clinicalStateAblationTag` in `clinical/model.ts`) only ever
  had two phase buckets; adding a third raw Phase value needed a
  decision about where it falls. Chose: `"Ablation"` buckets as
  `"Pre-ABL"` — the ablation isn't complete until the case is moved to
  a Post-ablation phase, so anything recorded while `"Ablation"` is
  active should read the same as pre-ablation findings. Implemented by
  flipping the function to explicit Post-ablation checks
  (`phase === "Post-ablation" || phase === "Post-ablation 2" ? "Post-ABL" : "Pre-ABL"`)
  rather than the old explicit Pre-ablation check, so it doesn't need to
  keep enumerating every non-Post value by name if more phases are ever
  added. `app/report/generate.ts`'s parallel `isPreAblation()` helper
  (used to bucket Clinical States into the report's "Pre-Ablation
  Measurements" vs. "Post-Ablation Measurements" sections) was updated
  the same way, for the same reason, to stay consistent with the tag
  logic. Ablation session data itself still isn't wired into the
  generated report — unchanged, pre-existing scope gap, not something
  this task touched.
- **Tutorial**: the Walkthrough's separate "Ablation" step (which
  targeted the now-deleted `[aria-label="Ablation"]`) is gone. Its
  content was folded into the existing "Intervals" step (retitled
  "Intervals / Ablation Details", same `.clinicalMeasurementRow`
  target), which now also explains the Phase-triggered swap — keeping
  two separate steps pointing at the same DOM element would have shown
  stale/misleading content depending on whichever Phase happened to be
  active when the tour ran.
- No fixed-enum validation of `phase` exists in `app/case/persistence.ts`
  (Save/Open case round-trips `context` as a loosely-typed object), so
  the new option needed no changes there. `phaseOptions` itself is the
  only place Phase's allowed values are enumerated in code.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.
`npx next build` couldn't be run to completion in this sandbox (missing
SWC binary for linux/arm64 — a pre-existing environment limitation, not
caused by this change).

<!-- CASE-AUTOSAVE-2026-08-08 -->
## Case Autosave to a Local File (implemented 2026-08-08)

Murph asked whether the site could automatically resave the case file —
rewriting the same file on disk — for every field entry, rather than
requiring a manual "Save case" click each time. Answered directly first
(see the chat: the existing download-based Save can't do this — a
browser download is always a fresh save, never a silent overwrite of an
existing file — but the File System Access API can, in Chromium browsers
only), then confirmed two design decisions with Murph via AskUserQuestion
before building: (1) browsers without the API (Firefox, Safari) keep
today's manual Save/Open/New exactly as-is, no autosave UI shown at all;
(2) autosave is a new, separate "Enable autosave" action, not folded into
the existing Save case button.

**Ambient types.** TypeScript's bundled `lib.dom.d.ts` (checked against
typescript 5.9.3) already declares `FileSystemFileHandle`,
`FileSystemHandle`, and `FileSystemWritableFileStream`/`createWritable` —
but not `Window.showSaveFilePicker` (the actual entry point) or the
`queryPermission`/`requestPermission` methods on `FileSystemHandle`. New
`app/case/file-system-access.d.ts` adds just those two pieces via
`declare global` interface augmentation/merging — deliberately minimal,
not a full redeclaration of the spec.

**`app/case/persistence.ts`** gained a new section alongside the existing
Save/Open functions:

- `isFileSystemAccessSupported()` — `typeof window !== "undefined" &&
  "showSaveFilePicker" in window`. False during SSR by construction, so
  it's safe to call directly in a component body (see the
  `loadStoredRailWidth`-style typeof-window guard convention already used
  elsewhere in `page.tsx`) without a hydration-mismatch-prone
  effect/state dance.
- `buildCaseFile(caseRecord)` — extracted from the body of
  `exportCaseRecord` so both the download path and the new autosave write
  path produce byte-identical file shape (same `fileFormat`/
  `schemaVersion`/`exportedAt`/`case` envelope), meaning a file produced
  by autosave is just as readable by `importCaseRecordFromFile` as one
  produced by a manual Save.
- `pickCaseFileForAutosave(caseRecord)` — opens the native
  `showSaveFilePicker`, then immediately writes the current case to
  whatever file the user picked/created (so the file is never left empty
  the instant it exists) and returns the handle. Rejects with an
  `AbortError` if the user cancels the picker — callers treat that as a
  silent no-op.
- `writeCaseRecordToHandle(handle, caseRecord)` — `createWritable()` →
  write the JSON → `close()`. Used both for that initial write and for
  every debounced autosave write afterward.

**`app/page.tsx` wiring:**

- `autosaveHandle` (state, drives the button/footer label) and
  `autosaveHandleRef` (ref, read inside the debounce timeout) both track
  the live `FileSystemFileHandle` or `null`. Kept as two mirrors rather
  than one, specifically so the debounced write effect below can depend
  on `caseRecord` alone — if it depended on `autosaveHandle` too, turning
  autosave on/off would spuriously reschedule (or cancel) a write that's
  unrelated to that toggle.
- `autosaveStatus`: `"off" | "saving" | "saved" | "error"`, surfaced in
  both the new topActions button's label and the footer's "Autosave: ..."
  line (previously static placeholder text — see
  `INFRA`/original-mockup-era code — now wired to something real for the
  first time).
- **The debounce.** A `useEffect` keyed only on `caseRecord` — meaning it
  re-fires on every change to any field anywhere, per Murph's "for each
  entry into any field" ask — clears any pending write timeout and
  schedules a new one 1.5s out. Writing on literally every keystroke
  would be excessive disk I/O and risked write races; 1.5s after the
  *last* change in a burst is the practical reading of "automatically."
  Status flips to `"saving"` the moment the timeout is (re)scheduled, not
  just when the write actually starts, so the UI reflects "there's an
  unsaved edit pending" during the debounce window too.
- **Enable/disable.** `enableAutosave()` calls `pickCaseFileForAutosave`
  and stores the resulting handle (both state and ref, together, always
  in lockstep). `disableAutosave()` clears both, resets status to
  `"off"`, and cancels any in-flight debounce timeout. `startNewCase()`
  and `handleCaseFileSelected()` (Open case) both call `disableAutosave()`
  before swapping in the new/opened `caseRecord` — deliberate: if autosave
  stayed connected across a New/Open, the *next* debounced write would
  silently overwrite the previous case's file with an entirely different
  case's content, which is exactly the kind of silent data-loss this
  feature should never cause. The user has to explicitly re-enable
  autosave (and pick a file) for whatever case is now loaded.
- **UI.** A new `.autosaveButton` in `topActions`, between Save case and
  Report, only rendered when `autosaveSupported` (the typeof-window-guarded
  `isFileSystemAccessSupported()` call) is true — so Firefox/Safari users
  never see it, exactly per the first AskUserQuestion decision above.
  Label reads "Enable autosave" when off, `Autosave: <filename>` when
  connected (or "Autosaving…" mid-debounce), clicking it toggles
  enable/disable. Styled with the same cyan "active toggle" treatment as
  `.ablationModalityToggle.active` elsewhere (`.autosaveButton.isActive`
  in `globals.css`) rather than green, since green stays reserved
  exclusively for the Clinical State tag system's active-state highlight
  (see `STATE-TAG-COLOR-2026-08-08`) and this is an unrelated generic
  toggle. The footer's `.autosaveStatusText` gets the same cyan-when-on
  treatment for consistency.

**Known limitation, intentionally out of scope for now:** the file
handle doesn't survive a page reload or browser restart (no
IndexedDB-backed handle-persistence layer was built), so autosave always
starts back at "off" on a fresh load — the user reconnects the file via
"Enable autosave" again. This matches the scope Murph confirmed
(a new, explicit action; no request for cross-reload persistence).

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.
`npx next build` still can't complete in this sandbox (same pre-existing
missing-SWC-binary limitation noted above, unrelated to this change).

<!-- ABLATION-PER-CLINICAL-STATE-2026-08-09 -->
## Ablation Data Moved to the Clinical State; Case Structure Cards Go Ablation-Aware (implemented 2026-08-09)

Murph asked for Case Structure cards to look distinct for a Clinical
State whose Phase is Ablation: instead of the Rhythm headline, show
`{count} {Modality} Ablation` (e.g. "3 RF Ablation"), with the ablation
entry's location text underneath.

That only makes sense if one ablation entry belongs to one specific
Clinical State. Since `ABLATION-SECTION-2026-08-05`, ablation data had
actually lived at the case level (`CaseRecord.ablationSessions`) — a
single shared list, decoupled from any Clinical State, with "whichever
session is last (or clicked)" as the one editable session and a
Modality *multiselect* (RF/PFA/Cryo could all be on at once). Flagged
this mismatch to Murph and confirmed two decisions via AskUserQuestion
before building:

1. **Ablation data moves onto the Clinical State itself** — one entry
   per state, not a shared case-level array. Recording a second
   ablation session now means creating a second Clinical State with
   Phase set to Ablation (the existing NEW button), the same way every
   other "new moment in the case" already works — not a separate
   add-session action inside one card.
2. **Modality becomes single-select.** One modality per ablation-phase
   Clinical State, not a multi-toggle.

This removes the multi-session badge/scroll/add-session machinery
entirely (nothing left to page through once it's 1:1 with a Clinical
State) and replaces it with a single, always-editable set of fields
tied to whichever Clinical State is active.

- **`app/clinical/model.ts`.** `AblationSession` lost `id` (redundant —
  it now lives inline on its owning `ClinicalState`, no separate key
  needed) and changed `modalities: AblationModality[]` to `modality:
  AblationModality | ""`. `createAblationSession()` dropped its `id`
  param. `ClinicalState` gained `ablation: AblationSession`, seeded by
  `createClinicalState()` via `createAblationSession()` — every
  Clinical State always has one, blank until Phase is set to Ablation
  and it's filled in. `CaseRecord.ablationSessions` is gone;
  `createInitialCase()` no longer seeds a separate session (the seeded
  Clinical State already carries its own via `createClinicalState`).
  `hasAblationSessionData()` and `summarizeAblationSession()` both kept
  (updated for the singular `modality`) rather than deleted as dead
  code: `hasAblationSessionData` is now also called from
  `clinicalStateHasFindings()` — an ablation-phase state with anything
  filled in now counts as "has findings" the same way a measurement or
  maneuver performance already did, so the existing context-change
  guard (`CONTEXT-CHANGE-PROMPT-2026-08-08`) protects it too — and
  `summarizeAblationSession` is repurposed as the Case Structure card's
  tooltip text for the new ablation title, the same role
  `clinicalState.context.rhythm` plays as the `title` attribute on the
  non-ablation card.
- **`app/case/persistence.ts`.** `isValidAblationSession` now checks a
  singular `modality` (`""` or a member of `ablationModalitySet`)
  instead of validating a `modalities` array.
  `isValidClinicalState` treats `ablation` as optional-if-present —
  same precedent as every other schema-gap case this file already
  handles — so a pre-2026-08-09 export (no `ablation` on any state at
  all) still opens instead of getting rejected. `isValidCaseRecord`
  dropped its `ablationSessions` check entirely (no longer a
  `CaseRecord` field). `importCaseRecordFromFile` now builds the
  returned record from only `id`/`title`/`clinicalStates` — this drops
  any stray old-format case-level `ablationSessions` array rather than
  carrying it forward via spread, and defaults each clinical state's
  `ablation` to a blank `createAblationSession()` when missing.
  **Accepted, flagged gap:** those old case-level sessions can't be
  reliably mapped onto specific Clinical States (they were an
  undifferentiated shared list), so opening an old case file loses its
  ablation data — every state just starts blank. Called out to Murph
  directly, not silently absorbed.
- **`app/page.tsx`.** Removed entirely: `ablationSessionCounterRef`,
  `activeAblationSessionId` state (plus its two `startNewCase`/
  `handleCaseFileSelected` resets), `lastAblationSession`,
  `activeAblationSessionIndex`, `updateAblationSession`,
  `toggleAblationModality`, `addAblationSession`,
  `removeAblationSession`. Added `updateAblation(key, value)` — modeled
  directly on the existing `updateMeasurement` pattern, writing into
  `activeClinicalState.ablation` via `updateActiveClinicalState` — and
  `selectAblationModality(modality)`, which sets the active state's
  modality to the clicked one, or clears it back to `""` if the clicked
  modality was already selected (keeps the existing "active" toggle-button
  affordance, just enforcing single-select instead of multi-select).
  The Ablation Details JSX (still inside `.clinicalMeasurementRow`,
  still swapped in whenever `isAblationPhase`) lost its session
  map/badges/"+" button and now renders one `.ablationActiveFields`
  block bound straight to `activeClinicalState.ablation` — same
  `.ablationField`/`.ablationModalityToggles`/`.ablationDurationInput`
  markup and class names as before, so the CSS diff stays minimal.
  Case Structure cards (`.clinicalStateCard` map): a Clinical State
  whose Phase is `"Ablation"` now renders `.clinicalStateCardRhythm` as
  `"{count} {Modality} Ablation"` (count omitted if blank; falls back
  to plain `"Ablation"` if no modality is picked yet), with
  `summarizeAblationSession(clinicalState.ablation)` as its tooltip —
  no cycle-length span, since Rhythm isn't the headline here. A new
  `.clinicalStateCardAblationLocation` line renders underneath,
  location text only, when the location field is non-blank. Every other
  Clinical State (Phase ≠ Ablation) renders exactly as before
  (`CASE-STRUCTURE-CARD-REWORK-2026-08-08`, unchanged) — Rhythm +
  cycle length. The tag pill and measurement-count meta row are
  unchanged either way, both phases.
- **`app/globals.css`.** Deleted the now-dead
  `.ablationSessionBadge`/`.ablationSessionBadgeLabel`/
  `.ablationSessionRemove`/`.ablationAddButton` rules (with their
  `:hover`/`:disabled` variants) — nothing in the JSX renders those
  classes anymore. `.ablationRow`/`.ablationActiveFields`/
  `.ablationField*`/`.ablationModalityToggle*`/`.ablationDurationInput*`
  all kept as-is (still used, unchanged markup). Added
  `.clinicalStateCardAblationLocation` alongside the other
  `.clinicalStateCard*` rules — small muted line (9.5px), sized between
  the bold 12px title and the 7px meta row.
- **`app/tutorial/Tutorial.tsx`.** The "Intervals / Ablation Details"
  step's copy, which described the now-removed "a new session can be
  started... earlier sessions collapse to a small badge" behavior, was
  rewritten to describe starting a new Clinical State instead. The
  "Case Structure" step's copy was extended to mention the
  Ablation-phase title/location exception.
- Not touched: `app/report/generate.ts` doesn't reference
  `AblationSession`/`ablationSessions` at all (its Pre-/Post-ablation
  bucketing reads `context.phase` directly) — no changes needed there,
  and the pre-existing "ablation data isn't in the report yet" gap is
  unaffected by this change.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- ABLATION-CARD-STYLE-2026-08-10 -->
## Ablation Card Restyle: Shorter, Dark Fuchsia, No Tag Pill, Count Moved to the Location Line (implemented 2026-08-10)

Follow-up to `ABLATION-PER-CLINICAL-STATE-2026-08-09`. Murph asked for
the Ablation-phase Case Structure card to look more distinctly
different from a standard card: shorter than the standard card, a dark
fuchsia identity color, no Pre-/Post-ABL · Iso-On/Off tag pill, and a
reworked text layout — modality on the title line ("RF Ablation"
instead of "3 RF Ablation"), with location and the entered ablation
count moved down to the second line as "`<location> X<count>`" (e.g.
"Septum X3").

- **`app/globals.css`.** New root custom property `--fuchsia: #d1399f`
  — its own hue, deliberately not reused from the Clinical State tag
  palette (cyan/violet/red/amber), since it marks a different kind of
  thing (a card-type identity) and this card doesn't render that tag at
  all anymore. New `.clinicalStateCard.ablationPhase` modifier: tighter
  `gap`/`padding` than the base `.clinicalStateCard` (shorter card,
  on top of already having one fewer row from the removed tag pill),
  fuchsia border/background tint, plus its own `:hover` and
  `.active` combinator rules so an active-and-ablation card gets a
  brighter fuchsia rather than falling back to the standard cyan active
  treatment — it should read as "an ablation card" first, "the active
  one" second. `.clinicalStateCardRhythm` picks up `var(--fuchsia)`
  when scoped under `.ablationPhase` (every other card's Rhythm title
  keeps the plain `--text` color). `.clinicalStateCardAblationLocation`
  recolored from `--muted` to a translucent fuchsia, since it's only
  ever rendered inside an ablation card.
- **`app/page.tsx`.** The Case Structure card button now adds an
  `ablationPhase` class when the state's Phase is Ablation. Title line
  dropped the leading count (`{modality} Ablation` / plain `"Ablation"`
  with no modality picked, same fallback as before). A new
  `ablationLocationLine` local combines `location` and, if the count
  field has anything in it, `X<count>` — joined with a space, either
  half optional, only rendered if the combined string is non-empty (so
  a card with a count but no location yet still shows "X3" alone,
  and vice versa). The `stateTagPill` span is no longer rendered at all
  for an Ablation-phase card — previously always rendered regardless of
  phase.
- Not touched: the Ablation Details entry fields themselves (still the
  same modality toggle / location / count / duration inputs from
  `ABLATION-PER-CLINICAL-STATE-2026-08-09`) — this pass only restyles
  how a Clinical State's ablation entry is *summarized* on its Case
  Structure card, not how it's entered.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- MANEUVER-GRID-BASE-RANK-FIX-2026-08-10 -->
## Fix: Maneuver Grid Wasn't Actually Honoring Base Rank (fixed 2026-08-10)

Murph reported the Pacing Maneuvers grid didn't appear to sort by Base
Rank (high-to-low, left-to-right). Root cause, not a rendering bug:
`sortedManeuverCatalog` in `app/page.tsx` sorts by relevance score
first, Base Rank only as a tiebreak — and the relevance score
(`scoreManeuverRelevance` in `app/maneuvers/knowledge.ts`) counts how
many of a maneuver's tagged Relevant Diagnoses are "active," where
active means "not yet Excluded" by `evaluateDifferential`. On a fresh
case, or any time nothing has actually been recorded, *no* diagnosis is
Excluded — every diagnosis reads as active — so the score isn't neutral
(0 for everyone) the way the old comment above the sort assumed
("before any relevance scoring differentiates maneuvers"); it's really
just "how many Relevant Diagnoses this maneuver happens to have
tagged," which varies maneuver to maneuver and was overriding Base Rank
from the very first render, not just once the differential narrowed.

Confirmed the fix with Murph via AskUserQuestion: sort by Base Rank
only while the case has no recorded Maneuver Response Field data at
all; once any performance has a non-blank value recorded anywhere in
the case, hand off to "a still-unbuilt recommendation engine" — for now
that's the existing relevance-score fallback (unchanged itself), since
the real Clinical-Reasoning-weighted version referenced elsewhere in
this doc ("Still open / intentionally deferred") isn't built yet.

- **`app/page.tsx`.** New `caseHasRecordedManeuverResponse`: true if
  any Clinical State's `performances` has any field with a non-blank
  value — same blank-check convention `clinicalStateHasFindings`
  already uses in `app/clinical/model.ts`, just scanning every Clinical
  State in the case rather than one. `sortedManeuverCatalog`'s
  comparator now short-circuits to `baseRank - baseRank` (ascending —
  same "lower number sorts first" convention as everywhere else Base
  Rank is used) whenever `caseHasRecordedManeuverResponse` is false;
  otherwise falls through to the existing relevance-then-Base-Rank
  comparator, unchanged.
- Not touched: `scoreManeuverRelevance` itself, `activeDiagnosisAbbreviations`,
  and the differential engine — all unchanged. This fix only changes
  *when* the relevance fallback is allowed to run, not how it scores
  once it does.
- Still true, unaffected by this fix: the "Still open" gap noting
  maneuver relevance scoring is a placeholder pending real
  Clinical-Reasoning-weighted / value-of-information data.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- MANEUVER-PANEL-WIDTH-FIX-2026-08-10 -->
## Fix: Pacing Maneuvers Panel Was Narrower Than the Other Sections (fixed 2026-08-10)

Murph reported that the Pacing Maneuvers section renders at a slightly
different size than Refractory Periods, Intervals, and Active Clinical
State — asked for it to match.

Root cause: `.appShell > .caseStrip, .appShell > .effectiveRefractoryPeriodCard,
.appShell > .workspace, .appShell > .lowerWorkspace` already share one
rule giving all four top-level sections identical `margin-left`/
`margin-right` (both `calc()`'d off `--clinical-state-rail-width` /
`--diagnosis-monitor-width` / `--side-monitor-gap`), so their outer
bounding boxes were never the mismatch. The mismatch was inside that
shared box: `.caseStrip` (Active Clinical State + Intervals) and
`.effectiveRefractoryPeriodCard` (Refractory Periods) carry no padding
of their own — only `margin`, set in their own older base rules — so
their content runs edge-to-edge inside the shared bounding box. But
`.workspace` (wrapping the Pacing Maneuvers `Panel`, which fills
`width: 100%` of its parent) still carries `padding: 16px 24px 0` from
its original 3-column-grid-era base rule, and `.lowerWorkspace`
(wrapping Case Timeline / Evidence and reasoning, below Pacing
Maneuvers) still carries `padding: 16px 24px 24px` from the same era.
An existing cleanup rule already zeroed `padding-left` on both
sections once they'd each collapsed to a single full-width column (see
`MANEUVER-RESULT-ENTRY-REMOVED-2026-08-08` and earlier), but never
zeroed the matching `padding-right` — so both sections have rendered
24px narrower on the right than the other three sections' content ever
since, and it went unnoticed because 24px against a wide panel reads
as "slightly off," not obviously broken.

**Fix — `app/globals.css`.** Extended the existing "Cancel older
left-rail padding/margin assumptions" rule (which zeroes `padding-left`
on `.caseStrip`, `.effectiveRefractoryPeriodCard`, `.workspace`, and
`.lowerWorkspace`) with an adjacent rule that also zeroes
`padding-right` on `.workspace` and `.lowerWorkspace` (the only two of
the four that had any). Deliberately left `padding-top`/`padding-bottom`
alone on both — `.workspace`'s 16px top padding is the real
inter-section gap above Pacing Maneuvers, playing the same role
`.caseStrip`'s 18px and `.effectiveRefractoryPeriodCard`'s 14px
`margin-top` already play for the sections above them, and
`.lowerWorkspace`'s 24px bottom padding is the page's bottom gutter
below Case Timeline / Evidence and reasoning.

**Bonus fix, same root cause:** `.lowerWorkspace` (Case Timeline /
Evidence and reasoning, below Pacing Maneuvers) had the identical
stale-`padding-right` bug and is fixed by the same rule — it wasn't
named in Murph's report but would have stayed visibly narrower than
the panel directly above it once Pacing Maneuvers was corrected, so
it's included rather than left mismatched.

**Noted, not fixed — pre-existing, unrelated:** the `max-width: 720px`
mobile breakpoint sets its own `.workspace, .lowerWorkspace { padding-left:
12px; padding-right: 12px; }` for a deliberate mobile gutter. Because
the unconditional (non-media-query) `padding-left: 0` rule already
comes later in the file's source order than that breakpoint rule, it
was already silently winning over the mobile `padding-left: 12px` even
before this fix — the same cascade collision now also applies to the
new `padding-right: 0` rule, silently winning over the mobile
`padding-right: 12px` too. This is pre-existing, imperfect behavior
this fix didn't introduce; flagging it here rather than touching mobile
layout, which is out of scope for this request.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean (CSS
itself isn't type/lint-checked; this confirms no incidental JS/TS
breakage). Root cause and fix were confirmed by reading every
non-media-query `.workspace { }` / `.lowerWorkspace { }` rule block in
source order to identify the winning padding declaration before and
after the change.

<!-- RESPONSE-FIELD-CONDITIONAL-DISPLAY-2026-08-10 -->
## Conditional Response Field Visibility (implemented 2026-08-10)

Murph asked to make certain Maneuver Response Fields conditional — only
shown once another field on the same maneuver has been answered a
certain way (e.g. a follow-up question that only appears after a
Yes/No Buttons field is answered "Yes"). Discussed as a design question
first: should this be a hardcoded GUI ruleset, or driven by new admin
spreadsheet columns? Agreed it should be spreadsheet-driven, matching
every other piece of clinical logic in this app (Clinical Reasoning,
maneuver relevance, refractory period tagging) — a clinician should be
able to add or change a conditional field without a code deploy, the
same as everything else in the knowledge base. Also confirmed with
Murph: a field's condition can only reference another field on the
*same* maneuver, not across maneuvers — cross-maneuver conditions would
need to decide which Clinical State's occurrence of that other maneuver
counts, which is a materially bigger feature (the same ambiguity
Clinical Reasoning already lives with via its existential
across-all-states check) and was deliberately scoped out.

**Schema — `app/admin/model.ts`, `maneuverResponseFields` sheet.** Four
new columns added right after Required:

- **Display When** (`displayWhen`) — `Always` / `If`. Required, since
  every row needs one value; a blank value on a row saved before this
  column existed is treated as `Always` at parse time, same convention
  as every other additive-optional-column migration in this project
  (e.g. Refractory Period Direction's `n/a` default).
- **Display Field** (`displayField`) — a lookup dropdown listing other
  Response Fields' prompts, narrowed via `filterBy: { ownColumn:
  "associatedManeuverId", matchColumn: "associatedManeuverId" }` to
  only fields belonging to the same maneuver already selected earlier
  on this row. This is the exact same cascading-lookup mechanism
  Response Options' "Associated Maneuver Response Prompt" column and
  Clinical Reasoning's "Response Field Prompt" column already use —
  just pointed at its own sheet instead of a different one, since no
  new machinery in `SpreadsheetTable.tsx` was needed (it's fully
  data-driven off `ColumnDefinition.lookup`/`filterBy`/
  `populatesColumn`, with no per-sheet or per-column-key special
  casing — confirmed by reading it before relying on it).
- **Display Field ID** (`displayFieldId`) — hidden, auto-populated from
  Display Field via `populatesColumn`, same pattern as every other
  name→ID pair on this sheet (e.g. Associated Maneuver → Associated
  Maneuver ID).
- **Display Operator** (`displayOperator`) — `Is Checked`, `Is
  Unchecked`, `=`, `≠`, `>`, `<`. Deliberately the *exact* vocabulary
  and labels Clinical Reasoning's own Operator column already uses,
  not a second, differently-worded set (the original request proposed
  "checked/unchecked/yes selected/no selected" as four separate terms;
  confirmed by reading `ManeuverCard.tsx` that Checkbox and Yes/No
  Buttons both store their answer as the literal strings `"Yes"`/`"No"`
  — Yes/No Buttons just starts blank instead of defaulting to `"No"` —
  so "yes selected"/"checked" and "no selected"/"unchecked" are the
  same underlying comparison regardless of which field type is being
  watched, and don't need distinct operators).
- **Display Value** (`displayValue`) — free text, same shape as
  Clinical Reasoning's Compared Value (not required, no options).

Display Field/Display Field ID/Display Operator/Display Value are only
meaningful when Display When is `If` — like Refractory Period
Direction's `n/a` and Units' `n/a` elsewhere on this same sheet, they're
simply ignored at runtime rather than being disabled in the admin grid
when they don't apply (the admin model's `disabledWhenFilled` only
supports "disabled when a sibling is *filled*," not "disabled unless a
sibling equals a specific value" — adding that was judged not worth it
for a first pass; noted as a possible future tightening below).

**Shared comparison logic — new `app/shared/operatorEvaluation.ts`.**
`evaluateOperator` (numeric-aware `=`/`≠`/`>`/`<`, plus `Is
Checked`/`Is Unchecked` checking for a case-insensitive `"yes"`/`"no"`;
a blank/unrecorded value never satisfies any operator) moved out of
`app/differential/engine.ts` — where it was a private, unexported
function — into its own module, unchanged. `engine.ts` now imports it
instead of defining it. It was never actually a differential-diagnosis
concept, just string/number comparison against an operator; leaving it
private to the differential engine would have meant either duplicating
it for Response Field visibility or having `app/maneuvers/` reach into
`app/differential/` for a utility function that has nothing to do with
diagnoses. One comparison engine, reused everywhere a recorded response
gets checked against an expected value (currently: Clinical Reasoning
row conditions, and now Response Field visibility).

**Data model — `app/maneuvers/knowledge.ts`.** New `DisplayOperator`
type (the six-value union above) and `DisplayCondition` type (`{
fieldId, operator, value }`), modeled directly on the existing
`RefractoryPeriodTag` pattern (a small tag object, or `null` meaning
"doesn't apply"). `ManeuverResponseField` gained `display:
DisplayCondition | null`. New `parseDisplayCondition`: returns `null`
(meaning always shown) unless Display When is exactly `"If"` *and* both
Display Field ID and Display Operator hold valid values — a
misconfigured `"If"` row (missing Field ID, or an Operator outside the
six known values) falls back to always-shown rather than hiding the
field with no way to reveal it.

**Runtime — `app/maneuvers/ManeuverCard.tsx`.** New `fieldIsVisible(field,
values)`: `true` when `field.display` is `null`, otherwise
`evaluateOperator(field.display.operator, values[field.display.fieldId],
field.display.value)`. Evaluated against the live `draftValues` object
(not just the last saved performance), so a follow-up field appears the
instant its trigger is answered — the same "results side updates live"
feel every other field on this card already has. Touch points:

- A new `visibleFields` (entry.fields filtered by `fieldIsVisible`
  against the live draft) replaces `entry.fields` everywhere the
  results-side field picker and its "‹ All fields" back button decide
  what to show/count. `entry.fields` itself (unfiltered) is kept for
  the outer "no response fields are defined for this maneuver yet"
  check — that's about whether the admin has defined *any* fields at
  all, not about current visibility — and a new, distinct message
  ("Every response field on this maneuver is conditional, and none of
  their trigger fields have been answered yet") covers the edge case
  where fields exist but all are currently hidden.
- `openEditor` now auto-selects straight into the single-field editor
  (skipping the picker) based on how many fields are visible given the
  performance's *saved* values at the moment the card is opened, not
  the maneuver's raw field count — so a maneuver with two fields, one
  of them conditional and not yet triggered, still opens straight to
  the one visible field instead of an unnecessary one-item picker.
- The currently-open field's editor can go stale if editing an earlier
  field's answer causes it to stop satisfying its own Display
  condition (e.g. the clinician backs out a "Yes" the follow-up
  depended on while the follow-up is open). Handled as a derived
  render-time value, not a `useEffect` + `setSelectedFieldId(null)` —
  the lint config here (`react-hooks/set-state-in-effect`) flagged the
  effect-based version as exactly the "calling setState synchronously
  within an effect" anti-pattern it exists to catch, so `selectedField`
  now falls back to `null` (showing the picker again) directly during
  render whenever the raw selected field is no longer visible, with no
  effect involved. `selectedFieldId` itself is left untouched when this
  happens — picking a field again (or the same field becoming visible
  again) is what moves it forward, not a background reset.
- `summarizePerformance`/`draftFieldPreview` (the front-face Findings
  history and the picker's per-field value preview) were deliberately
  left iterating `entry.fields`, not `visibleFields` — a field that was
  answered while visible and then hidden by a later answer still shows
  in the recorded history, since that reflects what was actually
  entered, not what's currently reachable. Visibility isn't tracked
  per-performance-snapshot; only whether a value is present is.

**Confirmed before building, not assumed:** `required` on a Response
Field turned out to be purely cosmetic already (only renders a `*` next
to the prompt in `ManeuverCard.tsx`; nothing blocks saving or reporting
on it) — so a hidden required field needed no special handling, since
nothing enforces required-ness either way today.

**Accepted, flagged gaps for this first pass:**

- No cycle/self-reference prevention. Nothing stops an admin from
  picking a Display Field that comes later in Order than the field
  being configured, or the field's own ID. Not a crash risk —
  `evaluateOperator` returns `false` against a blank/unrecorded value,
  so a self-referencing field just never becomes visible rather than
  looping — but it is a confusing dead-end if it happens by mistake.
  Real prevention would need either a lower-Order-only filter on the
  Display Field lookup or admin-side validation; left for later if it
  turns out to matter in practice.
- No AND/OR grouping — one condition per field, unlike Clinical
  Reasoning's `ruleGroupId`. Matches what was explicitly agreed to
  before building this: single-condition is enough for a first pass.
- The admin grid doesn't disable Display Field/Display Operator/Display
  Value when Display When is `Always` — they're just silently ignored
  at runtime. A `disabledUnless: { column, equals }` column-definition
  option (a value-conditional sibling to the existing
  `disabledWhenFilled`) would tighten this later without much
  restructuring.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean
(the first ESLint pass caught the `useEffect`/`setState` issue above,
fixed by switching to the derived-render-time approach before this
final clean run — see "Runtime" above).

<!-- ADMIN-TABLE-STICKY-HEADER-2026-08-10 -->
## Fix: Admin Spreadsheet's Column-Header Row Wasn't Actually Sticky (fixed 2026-08-10)

Murph asked to freeze the admin site's row-label/description header so
it stays visible while scrolling a long list of rows.

**Root cause.** `.adminTableHeader` (each column's label + "How the
application uses this" description, rendered as a `<button>` grid item
inside `.adminSpreadsheet`) already had `position: sticky; top: 0;
z-index: 3` — someone had clearly already tried to build this. It just
never worked, for a subtle reason: its nearest ancestor with non-`visible`
overflow — the element `position: sticky` resolves its stickiness
against — is `.adminTableViewport` (`overflow: auto`), and
`.adminTableViewport` had no height constraint of its own (no `height`,
`max-height`, or flex sizing — just `width: 100%; overflow: auto;`
sitting in ordinary block flow). Per CSS Overflow spec, any element
with non-`visible` overflow on either axis still *establishes* a
scroll container regardless of whether it ever actually has enough
content to overflow. `.adminTableViewport`'s box always grew to
exactly fit its content (however many hundreds of rows), so its own
`scrollHeight` never exceeded its `clientHeight` — it never scrolled
internally at all. The visible "scrolling through a long list" Murph
described was really the whole page (document) scrolling past a very
tall, never-scrolling `.adminTableViewport`. A sticky element only
sticks within its own scroll container's scrollport; since that
container's internal scroll range was always zero, `.adminTableHeader`
had nothing to stick against and just scrolled away with everything
else. (`.adminWorkspace`, an ancestor further out, also has `overflow:
hidden` for its rounded corners — but `.adminTableViewport` is the
*nearer* non-visible-overflow ancestor, so it's the one that mattered
here.)

Two structurally different fixes were possible: strip
`.adminTableViewport`'s overflow entirely and let stickiness resolve
against the true document scroll (the same pattern the main clinical
GUI's own `.topbar` already uses successfully) — but that sheet also
needs `overflow-x: auto` for horizontal scrolling on sheets with many
columns (`.adminSpreadsheet { min-width: max-content }` deliberately
overflows it wide), and CSS Overflow's per-spec `overflow-x`/`overflow-y`
coupling means setting one axis to non-`visible` forces the other to
behave as `auto` too — so there's no way to keep horizontal scroll
without also keeping (and needing to fix) vertical scroll on the same
element. So the real fix had to be the other option: give
`.adminTableViewport` an actual height constraint so it becomes a
genuinely-scrolling region, the way it always should have been.

**Fix — `app/globals.css`.** `.adminShell` (the page root, shared by
both `app/admin/AdminClient.tsx` and `app/knowledge/KnowledgeClient.tsx`
— they render the identical shell/workspace/viewport structure) changed
from `min-height: 100vh` (ordinary page flow, page scrolls) to a fixed
`height: 100vh` flex column — a deliberate, called-out exception to
every other top-level shell in this app, which all use the ordinary
min-height-plus-page-scroll pattern. `.adminTopbar`, `.adminTabs`
(top-level section tabs), `.adminSubnav` (the maneuver-sheet subnav),
`.adminSheetHeading` (sheet title + description), and `.adminToolbar`
all got `flex: none` — fixed-height, non-shrinking flex items.
`.adminWorkspace` (the rounded-corner card wrapping all of the above
plus the grid) became a flex column itself, `flex: 1; min-height: 0` —
`min-height: 0` overrides flexbox's default `min-height: auto` on flex
items, which otherwise refuses to shrink an item below its content's
natural height, defeating the entire point. Finally
`.adminTableViewport` itself got `flex: 1; min-height: 240px` — the
240px is a floor, not the typical case; on an ordinary viewport this
fills essentially all remaining space below the now-fixed chrome above
it, and the floor only matters on a pathologically short viewport,
where the tradeoff becomes "the page overflows 100vh a little" instead
of "the grid gets squeezed to nothing." With `.adminTableViewport` now
a real scrolling region, `.adminTableHeader`'s pre-existing `position:
sticky; top: 0` finally has something genuine to stick against —
nothing about `.adminTableHeader` itself needed to change.

**Side effect, not just the ask:** because everything above the grid
is now a fixed, non-scrolling flex item rather than ordinary page
content, the maneuver subnav, sheet title/description, and Add
Row/Save/Download toolbar are now *also* permanently visible while
scrolling a long list of rows — not just the column-header row Murph
named. Called out here as a deliberate, reasonable side effect of the
fix rather than scope creep: there was no way to make only the header
row stick without making its containing scroll region real, and once
that region is real, everything outside it stops scrolling too.

**Also applies to the public knowledge viewer.** `app/knowledge/
KnowledgeClient.tsx` renders the exact same `.adminShell` /
`.adminWorkspace` / `SpreadsheetTable` structure as the editable admin
site, so this fix (being pure CSS on shared class names, no JSX
touched in either file) fixes the identical problem there too, for
free.

**Not verified visually in this session** — this changes the admin
shell's fundamental sizing model (fixed-viewport-height flex column
instead of ordinary page scroll), which is a bigger structural change
than this project's usual CSS fixes; confirmed correct by tracing the
CSS Overflow spec's scroll-container and sticky-positioning rules
against the actual JSX/CSS structure (`.adminTableHeader`'s existing
sticky rule, `.adminTableViewport`'s overflow, the full ancestor
chain's overflow/height properties), not by loading the page. Worth a
quick look next time Murph is in the admin site, especially on a short
browser window (the 240px-floor edge case above).

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean (CSS
itself isn't type/lint-checked — this confirms no incidental JS/TS
breakage; no `.ts`/`.tsx` files were touched by this fix at all).

<!-- ADMIN-OPERATOR-YES-NO-ALIASES-2026-08-10 -->
## "Yes Selected"/"No Selected" Operator Options (implemented 2026-08-10)

When `RESPONSE-FIELD-CONDITIONAL-DISPLAY-2026-08-10` shipped, Display
Operator (and Clinical Reasoning's existing Operator column, which it
deliberately mirrors) offered only `Is Checked`/`Is Unchecked` for a
Yes/No-style comparison — reasoned at the time that since Checkbox and
Yes/No Buttons both store their answer as the literal string `"Yes"`
or `"No"`, one pair of operator labels could honestly serve both field
types. Murph pushed back: an admin configuring a condition against a
Yes/No Buttons field shouldn't have to read "Is Checked" and mentally
translate it — the field doesn't render as a checkbox at all, and the
label should match what the clinician actually sees and clicks in the
GUI. Also asked that this apply everywhere a column does the same kind
of comparison, not just Display Operator.

**Not a new comparison — an alias.** `"Yes Selected"`/`"No Selected"`
were added as additional operator options, not replacements, and
`evaluateOperator` (`app/shared/operatorEvaluation.ts`) treats them as
exact aliases of `"Is Checked"`/`"Is Unchecked"` (`case "Is Checked":
case "Yes Selected": return actual.toLowerCase() === "yes";` and the
mirror for `No`/Unchecked) — same underlying check against the field's
actual recorded response, confirmed correct the first time this came
up by reading `ManeuverCard.tsx`'s `FieldControl`: Checkbox writes
`"Yes"`/`"No"` on toggle, Yes/No Buttons writes `"Yes"`/`"No"` on
click and stays blank (`""`) until clicked once — the same recorded
value shape either way, just a different starting/blank state, which
`evaluateOperator` already handled correctly for both (a blank actual
value never satisfies any operator, checked or not). So "the yes/no
distinction should draw from the actual selection of the field as
entered in the GUI" was already true before this change; what was
missing was purely the admin-facing label matching that GUI.

**Applied to both columns that do this kind of comparison —**
Response Fields' Display Operator (`app/admin/model.ts`,
`maneuverResponseFields.displayOperator`) and Clinical Reasoning's
Operator (`app/admin/model.ts`, `clinicalReasoning.operator`) both
gained the two new options, each column's `modelUse` text updated to
note the two pairs compare identically. `app/maneuvers/knowledge.ts`'s
`DisplayOperator` type/`DISPLAY_OPERATORS` list grew to match.
Clinical Reasoning's own `ReasoningRow.operator` field
(`app/differential/engine.ts`) is typed as plain `string`, not a
union, and was never validated against a fixed operator list at parse
time — it passes whatever the admin picked straight through to
`evaluateOperator`, so no code change was needed there beyond the new
cases in `evaluateOperator` itself.

**Deliberately not touched: Response Fields' Available Terms column.**
Checked whether it's "a column that works the same way" before
changing it — it isn't. `availableTerms` (`ManeuverResponseField
.availableTerms`, parsed from the sheet's Available Terms column) is
descriptive metadata about which operators a Clinical Reasoning row
*should* use against a given field; nothing in the app currently reads
it to filter or enforce anything at runtime (confirmed by grep — its
only two references are its type declaration and its own parsing).
Its own option vocabulary is also narrower and different in kind
(`n/a`, `=`, `>`, `<` — no checked/unchecked concept at all). Left
alone; it's a pre-existing, already-noted-elsewhere gap (see the
"Still open" bullet on Response Options' `storedValue`), not something
this change touches.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- ADMIN-STICKY-HEADER-SPECIFICITY-FIX-2026-08-10 -->
## Fix: The Real Reason the Admin Header Still Wasn't Sticky (fixed 2026-08-10)

`ADMIN-TABLE-STICKY-HEADER-2026-08-10` (earlier the same day) gave
`.adminTableViewport` a genuine scrolling height, which was real and
necessary — but Murph reported the header was still disappearing on
scroll, "the only thing on the page are the rows below the Title row."
Screenshots settled it: scrolling the grid correctly kept the topbar,
tabs, maneuver subnav, sheet heading, and toolbar fixed in place (that
part of the first fix worked), but the spreadsheet's own column-header
row — "the Title row" — vanished the instant the page scrolled at all,
rather than sticking to the top of the grid the way it was supposed
to.

**Root cause: a completely different bug from the first fix, hiding
behind the same symptom.** `app/globals.css` had two rules for the
same element:

```css
.adminTableHeader {
  position: sticky;
  top: 0;
  z-index: 3;
  /* ... */
}

button.adminTableHeader {
  position: relative;
  cursor: pointer;
}
```

Every real header cell in `SpreadsheetTable.tsx` renders as
`<button className="adminTableHeader">` (or `"adminTableHeader
isSorted"`) — so `button.adminTableHeader` (specificity: one element
type + one class) matches every one of them, and beats the base
`.adminTableHeader` rule (specificity: one class) in the cascade
regardless of source order. Its `position: relative` was silently
overriding the base rule's `position: sticky` for every actual header
cell, the entire time — meaning the header was never actually
`position: sticky` in the browser's computed style, no matter how the
scroll container around it was fixed. It just scrolled away like
ordinary in-flow content, because — as far as layout was concerned —
that's exactly what it was.

(One header cell was *not* affected: the small lock-column spacer
renders as `<div className="adminTableHeader adminLockHeader">`, not a
`<button>`, so `button.adminTableHeader` never matched it and it
stayed genuinely sticky the whole time. Too narrow — 54px — for either
of us to have noticed it behaving differently from the rest of the
row.)

**Why `position: relative` was there at all.** Each header button
contains `.adminColumnResizeHandle`, a `position: absolute` drag
handle for resizing the column — absolutely-positioned elements need a
positioned ancestor to anchor against, and `button.adminTableHeader`'s
`position: relative` was providing that. This wasn't a mistake when it
was written; it just predates the base rule gaining `position: sticky`
at some point, and nobody revisited whether `relative` was still
needed once `sticky` — which is *also* a "positioned" value per the
CSS spec, and establishes exactly the same kind of containing block —
made it redundant.

**Fix.** Removed `position: relative` from `button.adminTableHeader`,
leaving only `cursor: pointer`. The base rule's `position: sticky`
now applies uncontested to every header button, and the resize
handle's positioning is unaffected — `sticky` satisfies the same
containing-block requirement `relative` did.

**Process note, for next time this kind of thing comes up:** the first
sticky-header fix was verified by tracing CSS Overflow spec rules
against the file's structure, not by loading the page — and that
verification genuinely was correct as far as it went, but a second,
unrelated bug (ordinary selector specificity, nothing to do with
scroll containers at all) was sitting right next to it, and pure
cascade-tracing missed it on the first pass because `button
.adminTableHeader` is easy to skim past as "just a cursor style
tweak." Two rounds of screenshots (top-of-page, then actually
scrolled) were what surfaced it. Worth remembering that a layout bug
report can have more than one independent cause even when the first
one found is real and worth fixing.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean (CSS
only; no `.ts`/`.tsx` touched). Not re-verified visually in this
session either — same caveat as the first fix — but this one is a
narrow, single-property removal with a clear, traceable mechanism
(cascade specificity), rather than a structural layout change, so
confidence is higher than the first pass.

<!-- ADMIN-COLUMN-GUIDE-SHORTEN-2026-08-10 -->
## Admin Column Guide Text Shortened (implemented 2026-08-10)

Once `ADMIN-STICKY-HEADER-SPECIFICITY-FIX-2026-08-10` made the
spreadsheet's column-header row genuinely stay on screen while
scrolling, Murph pointed out the flip side: the "How the application
uses this" description under every column label — some of them
several sentences long — now permanently occupies vertical page space
instead of scrolling away with the rest of the row. Requested: shorten
them, across every sheet, not just the ones added this session.

**Rewrite.** Every `modelUse` string in `app/admin/model.ts` (all
eight sheets — Intervals, Clinical States, Diagnoses, Maneuver
Definitions, Response Fields, Response Options, Clinical Reasoning,
References) was rewritten to be as short as the underlying rule
allows — usually one clause, rarely more than one sentence — while
keeping every load-bearing detail a column's description existed to
convey: what auto-populates a column and from where, when a column is
disabled or ignored, which columns a lookup is narrowed by, and how
the Yes/No-style operator aliases work. Nothing about the columns
themselves (`key`, `width`, `options`, `lookup`, `filterBy`, and so
on) changed — this was copy-only.

**CSS: the header's height floor no longer assumes long copy.**
`.adminTableHeader`'s `min-height` is only a floor (the header still
grows taller than it if a column's description genuinely needs more
room), but it had been sized at 150px around the old, much longer
text — so even a column whose new description is one short line was
still forced to reserve the old amount of vertical space. There are
two `.adminTableHeader` rule blocks in `globals.css` ("Administration
column guidance v1" at 112px, and "Administration visible column
guidance v2" at 150px, both same specificity, source order decides —
v2 wins and is the one that actually renders; v1 is left alone as
already-dead code, matching this file's existing precedent for
superseded blocks). Dropped v2's floor from 150px to 92px, and did the
same to `.adminDeleteHeader` (same block) and `.adminLockHeader`
(the lock-column spacer's own rule, "Row locking v1" section) so every
cell in the header row still lines up at the same height — they'd
been kept in sync with the old 150px value for the same reason.

**Not done:** re-measuring what floor value is actually optimal against
the real rendered page — 92px was sized by estimating line count from
the new description lengths at the existing 48ch wrap width, not by
loading the admin site and looking. If a description still feels
cramped or a lot of empty space remains under a short one, the floor
or the `max-width: 48ch` wrap width on `.adminColumnGuide p` are the
two knobs to revisit.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- ANSWER-YESNO-INLINE-2026-08-10 -->
## Yes/No Buttons Fields Answer Inline in the Field Picker (implemented 2026-08-10)

Every response field on a maneuver's results side is listed as a
single-line row in `.maneuverFieldPicker` — the "landing page" of
possible findings — and clicking a row expands it into
`.maneuverFieldEditor`, a dedicated view showing that one field's
label and entry control. That's a reasonable amount of ceremony for a
number field, a dropdown, or a Refractory Period triplet, but for a
Yes/No Buttons field the entry control *is* two buttons — Murph asked
for those to render right next to the prompt text in the picker row
itself, not gated behind navigating into the single-field editor
("not on another card flip").

**Change (`app/maneuvers/ManeuverCard.tsx`).** In the
`visibleFields.map` that builds `.maneuverFieldPicker`, a field whose
`inputType` is `"Yes/No Buttons"` (case-insensitive, matching every
other `inputType` check in this file) now renders as a plain `<div>`
row containing the prompt label and the real `FieldControl` for that
field (the same component the single-field editor uses), instead of
the `<button>` row that navigates via `setSelectedFieldId`. Every
other input type is unaffected — still a clickable row into
`.maneuverFieldEditor`. The row is marked `.hasValue` (same class the
button rows use) once the field has any recorded answer, for the same
green-tinted "answered" affordance.

**Why a `<div>`, and why it stops its own click from bubbling.** The
row now contains real `<button>` children (the Yes/No buttons
themselves) — a `<button>` can't nest inside another `<button>`, so
the row can't be a button anymore the way every other picker row still
is. That mattered for one other reason too: the maneuver card's back
face has a "click anywhere to leave results" convenience handler
(`handleFaceClick`) that ignores clicks landing inside a `button`,
`input`, `select`, `textarea`, `a`, or `label` — which is exactly why
the old all-button picker rows were safe to click anywhere on. A plain
`<div>` isn't in that list, so clicking the row's padding or the label
text (not literally one of the two Yes/No buttons) would have fallen
through and closed the results side. Fixed by calling
`event.stopPropagation()` on the row's own `onClick`, so a stray click
inside the row does nothing instead of exiting.

**Not affected, on purpose.** A maneuver with exactly one visible
field already skips the picker entirely (`openEditor`'s
`initiallyVisible.length === 1` auto-select) and lands straight on
`.maneuverFieldEditor`, which already renders the label next to its
control with no extra navigation step — that path already matched
what Murph asked for and needed no change.

**CSS (`app/globals.css`).** New `.maneuverFieldPickerItemYesNo`
modifier on `.maneuverFieldPickerItem`: `cursor: default` (the row
itself isn't clickable anymore), the label set to grow/wrap instead of
truncating with an ellipsis (no more preview text or chevron sharing
the row to size against), and the Yes/No button group narrowed to a
fixed width with a slightly shorter button height so it reads as one
row rather than stretching to the card's full width the way it does in
the standalone editor.

**Not done:** not visually verified against the running app — sizing
(the 132px button-group width, 28px button height) was chosen to look
proportionate against the existing picker row height, not measured
against a live render. If a Yes/No row looks cramped or oversized next
to the plain-text rows above/below it, `.maneuverFieldPickerItemYesNo`
in `globals.css` is where to adjust it.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- TAG-DEDUP-REMOVE-CARD-TOP-PILLS-2026-08-10 -->
## Removed the Duplicate Clinical State Tag Row From Maneuver Cards (implemented 2026-08-10)

Murph pointed out the Pre/Post-ABL · Iso-On/Off Clinical State tag was
being shown twice on a maneuver card's front face: once as a compact
row of tag-only pills top-right, next to the maneuver name
(`.maneuverPerformedHistory`, "performed 3 times, here's when"), and
again on every row of `.maneuverCardFindings` below, where each tag is
paired with that state's actual recorded result. Request: stop placing
the pills top-right; the findings list is the one place tags should be
used to differentiate results.

**Change (`app/maneuvers/ManeuverCard.tsx`).** Deleted the
`.maneuverPerformedHistory` block entirely from `.maneuverCardTop` —
the empty-state ("Not yet performed") and per-state tag-pill map it
used to render. `.maneuverCardTop` now holds only the maneuver name
`<h3>`. No behavior lost: the findings list already has its own
empty-state message ("No findings recorded yet — use Enter below.")
for the zero-performances case, and every performed state's tag is
still shown — just once, next to its value, instead of twice.

**CSS (`app/globals.css`).** Removed the now-dead
`.maneuverPerformedHistory`, `.maneuverPerformedHistoryEmpty`, and
`.maneuverHistoryTag.isActiveState` rules (matching this file's
precedent of deleting rules once their class no longer renders,
rather than leaving them as unreachable dead weight). `.maneuverCardTop`
dropped `justify-content: space-between`, which existed only to push
the now-gone pill row to the opposite end from the title. Updated the
shared `.stateTagPill` doc comment (it enumerated every call site) to
drop the removed one and note where it used to be.

**Not touched:** `.maneuverFindingRow`/`.maneuverFindingTag` and the
active-state highlighting on the findings list — already the
"summary side" tagging Murph wants kept, unchanged by this removal.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- CASE-STRUCTURE-CARD-FULL-NAME-2026-08-10 -->
## Case Structure Card Title: Full Name Instead of Abbreviated Name (implemented 2026-08-10)

The Case Structure rail card's title (`.clinicalStateCardRhythm`) has
shown Rhythm abbreviated since `CASE-STRUCTURE-CARD-REWORK-2026-08-08`
— `abbreviateClinicalStateLabel()` matched the state's Rhythm value
against the Clinical States knowledge-base sheet's Full Name column
and, on a match, substituted that row's Abbreviated Name ("Normal
Sinus Rhythm" → "NSR"). Murph asked for the Full Name column instead.

**Why this was a smaller change than it might look.** A Clinical
State's `context.rhythm` (`app/clinical/model.ts`'s `rhythmOptions`)
is itself already full-name text ("Normal Sinus Rhythm", "Tachycardia",
etc.) — it's the *input* `abbreviateClinicalStateLabel` matched against
the knowledge base's Full Name column, not something separately
abbreviated from. So showing the Full Name doesn't require a KB lookup
at all; it just means displaying the value already on the Clinical
State, unmodified, the way the card did before
`CASE-STRUCTURE-CARD-REWORK-2026-08-08` introduced the abbreviation.

**Change (`app/page.tsx`).** The card's title span now renders
`clinicalState.context.rhythm` directly. Removed
`abbreviateClinicalStateLabel()` entirely — this was its only call
site — and the now-pointless `title={clinicalState.context.rhythm}`
tooltip on the span, since the visible text and the tooltip text would
now always be identical; `.clinicalStateCardRhythm` wraps rather than
truncates (`overflow-wrap`/`word-break`), so there was never a
truncation case for a tooltip to cover anyway.

**Not touched:** the Ablation-phase title branch (`{modality}
Ablation`) and the Clinical State tag pill (Pre-ABL/Post-ABL ·
Iso-On/Off) below the title — neither one went through
`abbreviateClinicalStateLabel`, so neither changes here.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- ADMIN-SHEET-HEADING-DEDUP-2026-08-10 -->
## Admin/Knowledge Sheet Heading: Drop the Restated Sheet Name (implemented 2026-08-10)

Murph: "there is a lot of redundancy in stating what the pages are.
please use only the selectable menus to express what each spreadsheet
is. you can keep the only line of further explanation that is
currently there." `.adminSheetHeading` — the block sitting between the
tabs/subnav and the toolbar on both `/admin` and the read-only
`/knowledge` viewer (they share this exact shell) — was stating the
active sheet's identity three times over for a top-level sheet: once
as the selected `AdminTabs` button, once as an eyebrow line
("Knowledge-base sheet"), and once again as an `<h2>{activeDefinition
.label}</h2>`. For a Maneuvers sub-sheet it was worse — a fourth
repeat, since `ManeuverWorkspace`'s subnav buttons already render both
the sheet's name (`<strong>`) and its description (`<span>`) for every
sheet, selected or not.

**Change (`app/admin/AdminClient.tsx`, `app/knowledge/KnowledgeClient
.tsx` — identical edit, since they share the same JSX shape here).**
Removed the eyebrow (`"Maneuver workbook"`/`"Knowledge-base sheet"`)
and the `<h2>{activeDefinition.label}</h2>` from `.adminSheetHeading`.
What remains is exactly the one line Murph said to keep: the
description paragraph, still switching between `activeManeuverDescription`
and `activeDefinition.description` the same way it always did. Sheet
identity is now expressed exactly once — by whichever menu button is
currently `.isActive` (`AdminTabs`, or `ManeuverWorkspace`'s subnav
when on the Maneuvers tab) — never restated in the body below it.

**CSS (`app/globals.css`).** Removed the now-dead `.adminSheetHeading
h2` rule. `.adminSheetHeading p`'s `margin-top: 0` (there to close the
gap under the now-removed `<h2>`) became `margin: 0` — with the `<h2>`
gone the paragraph is the div's only child, so there's no longer a
gap-to-a-sibling to manage on either side, and zeroing both sides
avoids the browser's default paragraph bottom margin stacking with
`.adminSheetHeading`'s own `margin-bottom: 14px` before the toolbar (a
minor incidental fix noticed while already editing this rule, not
something separately reported).

**Not touched:** the Maneuvers subnav's own name+description pairing
(`ManeuverWorkspace.tsx`) — that's one of the "selectable menus"
Murph's request explicitly wants doing this job, so it's untouched by
design, not an oversight.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.

<!-- ADMIN-TOPBAR-SINGLE-LINE-2026-08-11 -->
## Admin Topbar: One Header Line, Explanatory Sentence Removed (implemented 2026-08-11)

Murph: remove "Edit the clinical content and transparent reasoning
used by the application." from the admin site, and bring "Diagnostic
Pacing" and "Knowledge-Base Administration" onto one single header
line. Both applied to `/admin`'s topbar (`app/admin/AdminClient.tsx`)
only — the read-only `/knowledge` viewer's near-identical topbar
("Knowledge Base" / "Read-only view of the clinical content and
transparent reasoning used by the application.") wasn't mentioned and
is untouched.

**Before:** three stacked lines — a small uppercase "Diagnostic
Pacing" eyebrow `<p>`, an `<h1>Knowledge-Base Administration</h1>`
below it, then the explanatory sentence as a second `<p>` below that.

**After.** The explanatory sentence is deleted outright, not
relocated anywhere. "Diagnostic Pacing" and "Knowledge-Base
Administration" are now one `<h1>`, with "Diagnostic Pacing" as an
inline `<span className="adminTopbarEyebrow">` inside it — same small
muted/uppercase treatment as before, just inline rather than its own
block above, so the two pieces are one line by construction (not
merely styled to look adjacent). New CSS: `.adminTopbar h1` (the
heading's own size/weight — previously undefined, since the removed
`.adminEyebrow` class had no dedicated rule anywhere in the file
either, so both lines had been relying on Tailwind's preflight
heading/margin reset plus whatever inherited from `body`, not an
explicit style) and `.adminTopbarEyebrow` (the inline prefix).

**Not touched:** `.adminEyebrow` itself is still used elsewhere (the
`.adminBrand`/login-card patterns, and — per
`ADMIN-SHEET-HEADING-DEDUP-2026-08-10` earlier the same stretch — it
no longer appears in `.adminSheetHeading` either, but that removal was
separate and unrelated to this one). `.adminBrand`/`.adminBrand h1`
remain unreferenced dead CSS, same as before this change — not
addressed here since cleaning up unrelated dead code wasn't part of
this request.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean. Not
visually verified against the running app — the `.adminTopbar h1`/
`.adminTopbarEyebrow` sizing was chosen to read naturally as an eyebrow-
prefixed heading, not measured against a live render.

<!-- MANEUVER-CARD-FIELDS-INLINE-2026-08-11 -->
## Maneuver Card Results: Field Picker Removed, All Fields Shown Directly (implemented 2026-08-11)

Murph: "I'd like to try going back to having the response fields
available immediately following the field prompts, no flip to select
the data then enter it." Clarified via AskUserQuestion which
navigation layer this meant: the maneuver card has two — the 3D flip
from the front tile to a dedicated results face (unchanged, kept), and
a picker-list-then-single-field-editor step *within* that results
face (removed). Murph picked "just the picker step."

**Context — why the picker existed at all.** `MANEUVER-CARD-REDESIGN-2026-08-05`
introduced a field-picker "landing page": every response field as a
one-line clickable row, expanding into a single-field editor
(`.maneuverFieldEditor`) on click, one field visible at a time. The
reasoning at the time: a maneuver like Ventricular Extrastimulus can
carry up to 8 distinct Refractory Period findings, and rendering 8
sets of number boxes simultaneously was judged a "sea of fields."
`ANSWER-YESNO-INLINE-2026-08-10` (the prior session) had already
started walking this back for one input type — a Yes/No Buttons field
answered directly in its picker row instead of navigating away. This
change generalizes that to every field, for every maneuver, and
removes the picker entirely rather than special-casing one input type
at a time.

**Change (`app/maneuvers/ManeuverCard.tsx`).** Removed `selectedFieldId`
state and its derived `rawSelectedField`/`selectedField` values, the
now-pointless single-field-auto-select branch in `openEditor()`
(previously: skip the picker if a maneuver has exactly one visible
field), and `draftFieldPreview()` (existed only to show a value
preview on an unopened picker row — nothing to preview once the real
control is always on screen). The results face's field area is now
one `.maneuverFieldList` div, `visibleFields.map(renderFieldControl)`
— every field's label/control pair rendered together, unconditionally,
whether there's 1 field or 8. `renderFieldControl` itself (the
RP-triplet-vs-plain-field branch) is unchanged; it was already
building exactly this label+control unit, previously just for
whichever one field was selected.

**Click-anywhere-to-leave, revisited.** The results face still has a
"click the background to save and flip back to front" convenience
(`handleFaceClick`/`leaveResults`) for clicks that don't land on a
real `button`/`input`/`select`/`textarea`/`a`/`label`. With one field
on screen at a time this was a small, contained risk; with every
field's controls stacked at once there's substantially more empty
space between rows for a stray click to fall into. `.maneuverFieldList`
now calls `event.stopPropagation()` on its own `onClick`, so nothing
inside the field area triggers this exit — same pattern
`ANSWER-YESNO-INLINE-2026-08-10` already used for its inline Yes/No
row, just scoped to the whole list instead of one row. Clicking the
header or the space around the field list (when there are zero fields,
or every field is currently hidden by its Display condition) still
leaves results, as before.

**CSS (`app/globals.css`).** Removed the now-dead `.maneuverFieldPicker`,
`.maneuverFieldPickerItem` (+ `:hover`/`.hasValue`),
`.maneuverFieldPickerLabel` (+ `.hasValue` variant),
`.maneuverFieldPickerPreview`, `.maneuverFieldPickerChevron`,
`.maneuverFieldPickerItemYesNo` (+ its two descendant overrides),
`.maneuverFieldEditor`, and `.maneuverFieldEditorBack` (+ `:hover`)
rules. `.maneuverFieldList` keeps its existing `flex: 1`/`overflow-y:
auto` scrolling behavior unchanged — a maneuver with many fields now
degrades to an internal scroll rather than growing the card, the same
"contain it, don't hide it" answer to the original "sea of fields"
concern, just via scroll instead of navigation. `.maneuverField`,
`.maneuverFieldYesNo`/`.maneuverFieldYesNoButton`,
`.maneuverFieldRefractoryGroup*`, and every other per-field-type
control style are untouched — they were already sized for exactly this
"label above, control below, full row width" presentation (that's what
the single-field editor rendered too), so they needed no changes to
work repeated multiple times in a stacked list.

**Not done:** not visually verified against the running app — whether
several fields stacked (especially a maneuver with multiple Refractory
Period triplets) reads as comfortably dense or cluttered wasn't judged
against a live render, only against the existing per-field CSS's
sizing.

Verification: `npx tsc --noEmit` and `npx eslint app/` both clean.
