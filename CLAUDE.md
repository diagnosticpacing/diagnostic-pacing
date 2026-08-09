@AGENTS.md

# Project memory

Before doing substantive work on this project, read `docs/PROJECT_DESIGN.md`
in full. It is the durable, cross-session record of this project's
architecture, design decisions, and current status — a "Status Summary"
checkpoint at the top gives a fast-read index, with full reasoning for
each item in its own dated section further down. When you make a design,
architecture, or other notable change, add a dated section (following the
existing `<!-- ANCHOR-NAME-YYYY-MM-DD -->` / `## Title (implemented
YYYY-MM-DD)` convention already used throughout the file) and, if it's a
substantial addition, fold a short summary into the Status Summary index
too so it stays a reliable fast-read reconciliation point.

Also note: `git push` is blocked from this environment's sandbox (network
restrictions) — after committing, tell the user to run `git push origin
main` themselves.
