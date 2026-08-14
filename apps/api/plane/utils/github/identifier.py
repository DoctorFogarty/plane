# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import re
from typing import Optional, Tuple

# Matches PROJ-123 style identifiers in branch names / PR titles.
WORK_ITEM_IDENTIFIER_RE = re.compile(r"\b([A-Za-z][A-Za-z0-9]*)-(\d+)\b")


def extract_work_item_identifier(text: str) -> Optional[str]:
    """Return the first work-item identifier found in text, uppercased (e.g. PROJ-123)."""
    if not text:
        return None
    match = WORK_ITEM_IDENTIFIER_RE.search(text)
    if not match:
        return None
    return f"{match.group(1).upper()}-{match.group(2)}"


def parse_work_item_identifier(identifier: str) -> Optional[Tuple[str, int]]:
    """Parse IDENTIFIER-SEQUENCE into (project_identifier, sequence_id)."""
    if not identifier:
        return None
    match = WORK_ITEM_IDENTIFIER_RE.fullmatch(identifier.strip())
    if not match:
        return None
    return match.group(1).upper(), int(match.group(2))


def build_branch_name(project_identifier: str, sequence_id: int, title: str, max_length: int = 80) -> str:
    """Build a default branch name: {IDENTIFIER}-{sequence}-{slug}."""
    slug = re.sub(r"[^a-z0-9]+", "-", (title or "").lower()).strip("-")
    base = f"{project_identifier.upper()}-{sequence_id}"
    if not slug:
        return base[:max_length]
    name = f"{base}-{slug}"
    return name[:max_length].rstrip("-")


def build_work_item_identifier(project_identifier: str, sequence_id: int) -> str:
    """Return IDENTIFIER-SEQUENCE (e.g. PROJ-12)."""
    return f"{(project_identifier or '').upper()}-{sequence_id}"


def build_pull_request_title(project_identifier: str, sequence_id: int, title: str) -> str:
    """Default PR title: `{IDENTIFIER}-{sequence} {issue name}`."""
    identifier = build_work_item_identifier(project_identifier, sequence_id)
    name = (title or "").strip()
    if not name:
        return identifier
    return f"{identifier} {name}"


def build_pull_request_body(project_identifier: str, sequence_id: int, work_item_url: str) -> str:
    """Default PR body: identifier plus the Plane work-item URL."""
    identifier = build_work_item_identifier(project_identifier, sequence_id)
    url = (work_item_url or "").strip()
    if not url:
        return identifier
    return f"{identifier}\n\n{url}"
