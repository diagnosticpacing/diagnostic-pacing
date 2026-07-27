# Diagnostic Pacing Benchmark

Benchmark: knowledge-workbook-xlsx-export-v1
Date: 2026-07-27

## Stable behavior

- Knowledge-base administration saves through the backend revision system.
- Download action is labeled "Download Workbook".
- Download produces one complete Excel .xlsx workbook.
- Workbook includes:
  - Workbook Info
  - Clinical Terms
  - Diagnoses
  - Maneuver Definitions
  - Response Fields
  - Response Options
  - Clinical Reasoning
  - References
- Empty sheets retain their column headers.
- Export filename includes the saved revision and export date.
- Workbook download is blocked when there are unsaved changes.
- The prior broken references to setStatusMessage and revisionMetadata are removed.
- Existing save behavior remains unchanged.

## Architecture

- Canonical runtime representation remains the JSON knowledge workbook.
- Excel is the portable export/interchange format.
- The XLSX exporter is isolated in app/admin/workbookExport.ts.
- Backend revisions remain the source of audit history.

## Validation

This benchmark script runs:
- npm run lint
- npm run build
