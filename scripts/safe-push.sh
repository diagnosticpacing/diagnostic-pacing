#!/usr/bin/env bash
# Confirms you're actually in the Diagnostic Pacing repo (right directory,
# right remote) before running `git push`. Run it from anywhere — it `cd`s
# to the project itself, so it doesn't matter where your shell happens to
# be when you launch it.
#
# Usage:
#   ./scripts/safe-push.sh          # push the current branch
#   ./scripts/safe-push.sh main     # push a specific branch

set -euo pipefail

PROJECT_DIR="$HOME/Development/diagnostic-pacing"
EXPECTED_REMOTE="diagnosticpacing/diagnostic-pacing"

echo "==> Checking project directory..."
if [ ! -d "$PROJECT_DIR" ]; then
  echo "Error: expected project directory not found at $PROJECT_DIR" >&2
  echo "If the repo lives somewhere else now, update PROJECT_DIR at the top of this script." >&2
  exit 1
fi

cd "$PROJECT_DIR"
echo "==> Now in: $(pwd)"

if [ ! -d ".git" ]; then
  echo "Error: $(pwd) is not a git repository." >&2
  exit 1
fi

REMOTE_URL=$(git remote get-url origin 2>/dev/null || echo "")
if [[ "$REMOTE_URL" != *"$EXPECTED_REMOTE"* ]]; then
  echo "Error: origin remote doesn't look like the Diagnostic Pacing repo." >&2
  echo "  Found:    ${REMOTE_URL:-<no origin remote>}" >&2
  echo "  Expected: something containing \"$EXPECTED_REMOTE\"" >&2
  exit 1
fi
echo "==> Remote confirmed: $REMOTE_URL"

BRANCH="${1:-$(git rev-parse --abbrev-ref HEAD)}"
CURRENT_BRANCH=$(git rev-parse --abbrev-ref HEAD)
if [ "$BRANCH" != "$CURRENT_BRANCH" ]; then
  echo "Error: you asked to push '$BRANCH' but you're currently on '$CURRENT_BRANCH'." >&2
  echo "Check out '$BRANCH' first, or run this script without an argument to push the current branch." >&2
  exit 1
fi
if [ "$CURRENT_BRANCH" != "main" ]; then
  echo "Warning: you're on branch '$CURRENT_BRANCH', not 'main'."
fi
echo "==> Branch: $CURRENT_BRANCH"

echo
echo "==> git status:"
git status --short --branch
echo

read -r -p "Push $CURRENT_BRANCH to origin now? [y/N] " CONFIRM
case "$CONFIRM" in
  [yY][eE][sS]|[yY])
    git push origin "$CURRENT_BRANCH"
    ;;
  *)
    echo "Push cancelled."
    exit 0
    ;;
esac
