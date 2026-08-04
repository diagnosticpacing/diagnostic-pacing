# Diagnostic Pacing — Project Design

This document records committed architecture, workflow, and interface decisions.

<!-- STATUS-SUMMARY-2026-08-03 -->
## Status Summary (checkpoint as of 2026-08-03)

A fast-read reconciliation point, since this doc is the only durable memory
across sessions. Full reasoning for everything below lives in its own dated
section further down — this is an index, not a replacement.

**Live and implemented:**

- Clinical State measurement architecture for plain intervals (AA, VV,
  PR, and similar) — still direct-entry, unchanged. The original ERP
  card's rhythm-specific display rules are superseded — see
  `REFRACTORY-PERIODS-V2-2026-08-03` below.
- Refractory periods (FRP/ERP) are now maneuver results, not direct
  entry: recorded on the back of whichever maneuver produces them
  (tagged via Type/Direction/Structure on Maneuver Response Fields — one
  field IS the whole result, Functional a single value and Effective up
  to three), shown in a derived "Refractory Periods" panel under Intervals.
- Knowledge base schema v2, including Clinical States, Rule Group ID /
  Required Clinical State on Clinical Reasoning, and the three-value
  Differential Action (Supports/Excludes/Confirms). The Clinical States
  fixed vocabulary is NSR, Brady, Tachy, CRM Paced, Iso On, Iso Off,
  Adenosine — **Iso Washout was removed** from the original v2 list early
  in this stretch of work.
- Admin spreadsheet editor: cross-sheet reference links, live cascading
  lookup dropdowns (see the dedicated reference section below — this is
  the "how are the tailored column menus auto-populated" answer),
  auto-populated hidden ID columns, column sorting, resizable columns,
  required-field highlighting, and **per-row locking** with save-locks-
  everything semantics.
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
- The knowledge base save pipeline now self-heals from schema changes:
  `pruneUnknownColumns()` (`app/admin/model.ts`) strips any row key that
  isn't in the current schema before validating/storing, so removing a
  column (as happened when Refractory Period Component # was dropped)
  can never permanently block saving again — see the tail end of
  `REFRACTORY-PERIODS-V2-2026-08-03` below.
- Public read-only knowledge base viewer at `/knowledge` — no login,
  same live data and schema as the admin editor via a new `readOnly`
  mode on `SpreadsheetTable`/`Toolbar`, plus Excel download. Linked from
  a single working card in the About modal, which now also opens
  automatically on page load — see `PUBLIC-KNOWLEDGE-BASE-VIEWER-2026-08-04`.

**Still open / intentionally deferred:**

- Differential engine: Required Clinical State is not enforced yet (checked
  existentially across all recorded states); interval-to-measurement
  matching is a name heuristic, not a formal ID join.
- Maneuver relevance scoring still uses the documented fallback (count of
  a maneuver's own Relevant Diagnoses still active) rather than the fuller
  Clinical-Reasoning-weighted / value-of-information approach — needs more
  real reasoning-rule data before that's worth building.
- Two schema-v2 items flagged but never explicitly re-confirmed: the
  `enabled` Yes/No row-disable toggle, and `storedValue` on Response
  Options (Compared Value is currently free text with no controlled
  vocabulary to validate against it).
- The `INFRA-STATUS-2026-08-01` snapshot below (Blob revision number, row
  counts, the revision-index gap at 5/7) is now stale given the volume of
  saves since — treat it as historical, not current, until re-verified.

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
