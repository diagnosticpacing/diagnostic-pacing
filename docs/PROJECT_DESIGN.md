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
- **Response Fields**: Associated Maneuver ID — first-tier pick
  (populated from Maneuver Definitions). Unscoped by design.
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

**Known limitation carried over from before this change:** the
differential diagnosis list this scores against is still the static
demo array on the page (not yet computed from Clinical Reasoning
rules), so relevance ordering is only as good as that placeholder data
for now. Building the real differential engine off Clinical Reasoning
rows is the natural next step, and would make both this ordering and
the differential diagnosis rail itself live.

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
  The underlying `SheetId` key (`clinicalTerms`), column key (`termId`),
  and ID prefix (`TID-`) were deliberately left unchanged, since
  production Blob data already exists under those keys — renaming them
  would have required a migration path for no real benefit, since only
  the label was described as "more accurate," not the internal
  identifiers.
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
  mirror the interval's Name rather than its `TID-` code — unlike
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
