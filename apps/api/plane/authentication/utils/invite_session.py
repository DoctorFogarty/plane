# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.


def store_user_timezone_session(request):
    """Persist browser timezone across OAuth redirects for new-account signup."""
    user_timezone = request.GET.get("user_timezone")
    if not user_timezone:
        return
    value = str(user_timezone).strip()[:255]
    if value:
        request.session["user_timezone"] = value


def store_workspace_invite_session(request):
    """Persist shareable invite-link context across OAuth redirects."""
    invite_code = request.GET.get("invite_code")
    workspace_slug = request.GET.get("workspace_slug")
    if invite_code:
        request.session["invite_code"] = str(invite_code)
    if workspace_slug:
        request.session["workspace_slug"] = str(workspace_slug)
    store_user_timezone_session(request)
