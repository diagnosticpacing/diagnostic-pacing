# Diagnostic Pacing — Project Design

This document records committed architecture, workflow, and interface decisions.

<!-- ERP-CLINICAL-STATE-DESIGN-V1 -->
## Clinical State Measurement Architecture

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
## Infrastructure Status (as of 2026-08-01)

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
## Knowledge Base Rules Engine (design in progress, not yet built)

The differential-diagnosis calculator and rules engine do not exist yet —
`app/page.tsx` still renders hardcoded demo diagnoses and maneuvers. Design
direction agreed so far:

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
  Clinical Reasoning condition can be scoped to.
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
  UI (`SpreadsheetTable.tsx`) currently uses this to render real
  dropdowns for fixed-option columns and to highlight required-but-blank
  cells in red. Cross-sheet lookups (e.g. "Maneuver Considered" picking a
  name and auto-filling the hidden Maneuver ID column) and multi-select
  controls are captured in the schema (`lookup`, `multiSelect`) but not
  yet rendered as real dropdowns — those columns are still typed as
  comma-separated free text until that UI is built.
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
## Differential Diagnosis Hierarchy (decided, not yet built)

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
## Maneuver Suggestion & Card UI (decided, not yet built)

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
