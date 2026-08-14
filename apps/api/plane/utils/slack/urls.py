# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from __future__ import annotations

import re
from urllib.parse import urlparse

from django.conf import settings

from plane.utils.github.identifier import parse_work_item_identifier
from plane.utils.url import is_valid_url

UPPERCASE_IDENTIFIER_RE = re.compile(r"\b([A-Z][A-Z0-9]*)-(\d+)\b")

WORK_ITEM_PATH_RE = re.compile(
    r"/(?P<slug>[^/]+)/(?:projects/)?(?:[^/]+/)?(?:issues|work-items)/(?P<issue_id>[0-9a-fA-F-]{36})"
)
IDENTIFIER_PATH_RE = re.compile(
    r"/(?P<slug>[^/]+)/.*?(?P<identifier>[A-Za-z][A-Za-z0-9]*-\d+)"
)


def public_origin() -> str:
    """Absolute site origin for Slack OAuth and user-facing links.

    Self-host often sets WEB_URL and leaves APP_BASE_URL empty. Slack rejects a
    relative redirect_uri such as `/api/hooks/slack/oauth/workspace`.
    """
    for value in (settings.APP_BASE_URL, settings.WEB_URL):
        if isinstance(value, str):
            origin = value.strip().rstrip("/")
            if origin.startswith(("http://", "https://")) and is_valid_url(origin):
                return origin
    return ""


def extract_uppercase_identifiers(text: str) -> list[str]:
    if not text:
        return []
    return [f"{m.group(1)}-{m.group(2)}" for m in UPPERCASE_IDENTIFIER_RE.finditer(text)]


def parse_plane_url(url: str) -> dict | None:
    if not url:
        return None
    path = urlparse(url).path or ""
    path_match = WORK_ITEM_PATH_RE.search(path)
    if path_match:
        return {"type": "issue", "slug": path_match.group("slug"), "issue_id": path_match.group("issue_id")}
    ident_match = IDENTIFIER_PATH_RE.search(path)
    if ident_match:
        parsed = parse_work_item_identifier(ident_match.group("identifier"))
        if parsed:
            return {
                "type": "issue_identifier",
                "slug": ident_match.group("slug"),
                "project_identifier": parsed[0],
                "sequence_id": parsed[1],
            }
    for entity in ("projects", "cycles", "modules", "pages", "intake"):
        m = re.search(rf"/(?P<slug>[^/]+)/.*?/{entity}/(?P<id>[0-9a-fA-F-]{{36}})", path)
        if m:
            kind = "intake" if entity == "intake" else entity[:-1]
            return {"type": kind, "slug": m.group("slug"), "id": m.group("id")}
    return None


def work_item_url(workspace_slug: str, project_identifier: str, sequence_id: int) -> str:
    return f"{public_origin()}/{workspace_slug}/browse/{project_identifier}-{sequence_id}/"
