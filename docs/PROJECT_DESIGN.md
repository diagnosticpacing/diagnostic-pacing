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
