#!/bin/bash
# commit.sh — deterministic commit for QDA porting
# Usage: .claude/commit.sh "<ISO-8601-timestamp>" "<commit-message>"
# Hardcodes author. No Co-Authored-By ever.

set -euo pipefail

TIMESTAMP="$1"
MESSAGE="$2"

AUTHOR_NAME="Marlon Lemes"
AUTHOR_EMAIL="mrlnlms@users.noreply.github.com"

git add -A

GIT_AUTHOR_NAME="$AUTHOR_NAME" \
GIT_AUTHOR_EMAIL="$AUTHOR_EMAIL" \
GIT_COMMITTER_NAME="$AUTHOR_NAME" \
GIT_COMMITTER_EMAIL="$AUTHOR_EMAIL" \
GIT_AUTHOR_DATE="$TIMESTAMP" \
GIT_COMMITTER_DATE="$TIMESTAMP" \
git commit -m "$MESSAGE"
