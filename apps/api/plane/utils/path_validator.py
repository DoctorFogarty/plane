# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Django imports
from django.utils.http import url_has_allowed_host_and_scheme
from django.conf import settings

# Python imports
import os
from urllib.parse import urlparse


def sanitize_filename(filename):
    """
    Sanitize a filename to prevent path traversal attacks.

    Strips directory components, path traversal sequences, and null bytes
    from user-supplied filenames used in upload paths and S3 object keys.

    Returns None for empty/missing input so callers can still validate
    that a filename was provided.
    """
    if not filename or not isinstance(filename, str):
        return None

    # Strip null bytes
    filename = filename.replace("\x00", "")

    # Normalize backslashes so os.path.basename handles Windows-style paths on POSIX
    filename = filename.replace("\\", "/")

    # Take only the basename to remove any directory components
    filename = os.path.basename(filename)

    # Remove any remaining path traversal sequences
    filename = filename.replace("..", "")

    # Strip whitespace before removing leading dots so " .env" is caught
    filename = filename.strip()

    # Remove leading dots (hidden files)
    filename = filename.lstrip(".")

    # Strip any remaining whitespace
    filename = filename.strip()

    if not filename:
        return None

    return filename


def _contains_suspicious_patterns(path: str) -> bool:
    """
    Check for suspicious patterns that might indicate malicious intent.

    Args:
        path (str): The path to check

    Returns:
        bool: True if suspicious patterns found, False otherwise
    """
    suspicious_patterns = [
        r"javascript:",  # JavaScript injection
        r"data:",  # Data URLs
        r"vbscript:",  # VBScript injection
        r"file:",  # File protocol
        r"ftp:",  # FTP protocol
        r"%2e%2e",  # URL encoded path traversal
        r"%2f%2f",  # URL encoded double slash
        r"%5c%5c",  # URL encoded backslashes
        r"<script",  # Script tags
        r"<iframe",  # Iframe tags
        r"<object",  # Object tags
        r"<embed",  # Embed tags
        r"<form",  # Form tags
        r"onload=",  # Event handlers
        r"onerror=",  # Event handlers
        r"onclick=",  # Event handlers
    ]

    path_lower = path.lower()
    for pattern in suspicious_patterns:
        if pattern in path_lower:
            return True

    return False


def get_allowed_hosts() -> list[str]:
    """Get the allowed hosts from the settings."""
    allowed_hosts = []
    # Include every configured base URL; WEB_URL and APP_BASE_URL may differ
    # (e.g. WEB_URL points at the API host, APP_BASE_URL at the web app), and
    # both need to be allowed for redirects to either origin to pass safety checks.
    for setting in (settings.WEB_URL, settings.APP_BASE_URL, settings.ADMIN_BASE_URL, settings.SPACE_BASE_URL):
        if setting:
            host = urlparse(setting).netloc
            if host and host not in allowed_hosts:
                allowed_hosts.append(host)
    return allowed_hosts


def validate_next_path(next_path: str) -> str:
    """Validates that next_path is a safe relative path for redirection.

    Query strings are preserved so invite links like
    ``/workspace-join/?slug=…&code=…`` survive auth redirects.
    """
    # Browsers interpret backslashes as forward slashes. Remove all backslashes.
    if not next_path or not isinstance(next_path, str):
        return ""

    # Limit input length to prevent DoS attacks
    if len(next_path) > 500:
        return ""

    next_path = next_path.replace("\\", "")
    parsed_url = urlparse(next_path)

    # Block absolute URLs or anything with scheme/netloc — keep only path (+ query)
    path = parsed_url.path
    query = parsed_url.query

    if parsed_url.scheme or parsed_url.netloc:
        # Absolute URL: use path/query only
        pass
    elif not path and next_path.startswith("/"):
        # urlparse can leave path empty for odd inputs; fall back to raw path segment
        path = next_path.split("?", 1)[0]

    # Must start with a forward slash and not be empty
    if not path or not path.startswith("/"):
        return ""

    # Prevent path traversal
    if ".." in path or (query and ".." in query):
        return ""

    # Additional security checks on path and query
    candidate = f"{path}?{query}" if query else path
    if _contains_suspicious_patterns(candidate):
        return ""

    return candidate


def get_safe_redirect_url(base_url: str, next_path: str = "", params: dict = {}) -> str:
    """
    Safely construct a redirect URL with validated next_path.

    Args:
        base_url (str): The base URL to redirect to
        next_path (str): The next path to append
        params (dict): The parameters to append
    Returns:
        str: The safe redirect URL
    """
    from urllib.parse import urlencode

    # Validate the next path
    validated_path = validate_next_path(next_path)

    # Add the next path to the parameters
    base_url = base_url.rstrip("/")

    # Prepare the query parameters — always encode so `?` / `&` in next_path
    # are not interpreted as top-level query separators.
    redirect_params = {}
    if validated_path:
        redirect_params["next_path"] = validated_path
    if params:
        redirect_params.update(params)

    if redirect_params:
        url = f"{base_url}/?{urlencode(redirect_params)}"
    else:
        url = base_url

    # Check if the URL is allowed
    if url_has_allowed_host_and_scheme(url, allowed_hosts=get_allowed_hosts()):
        return url

    # Return the base URL if the URL is not allowed
    fallback_params = {k: v for k, v in redirect_params.items() if k != "next_path"}
    return base_url + (f"/?{urlencode(fallback_params)}" if fallback_params else "")
