# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

DEFAULT_ATTACHMENT_MIME_TYPE = "application/octet-stream"

# Keep in sync with packages/constants/src/file.ts DANGEROUS_EXTENSIONS.
DANGEROUS_ATTACHMENT_EXTENSIONS = frozenset(
    {
        "exe",
        "bat",
        "cmd",
        "sh",
        "php",
        "asp",
        "aspx",
        "jsp",
        "cgi",
        "dll",
        "vbs",
        "jar",
        "ps1",
    }
)

DANGEROUS_ATTACHMENT_MIME_TYPES = frozenset(
    {
        "application/java-archive",
        "application/vnd.microsoft.portable-executable",
        "application/x-bat",
        "application/x-csh",
        "application/x-dosexec",
        "application/x-executable",
        "application/x-httpd-php",
        "application/x-ms-dos-executable",
        "application/x-msdos-program",
        "application/x-msdownload",
        "application/x-php",
        "application/x-sh",
    }
)


def resolve_attachment_mime_type(file_type):
    """Return a usable Content-Type for uploads, including CAD files with no MIME."""
    if not file_type or not isinstance(file_type, str):
        return DEFAULT_ATTACHMENT_MIME_TYPE
    normalized = file_type.strip()
    return normalized or DEFAULT_ATTACHMENT_MIME_TYPE


def has_dangerous_attachment_extension(name):
    if not name or not isinstance(name, str):
        return False

    parts = [part.lower() for part in name.split(".") if part]
    if len(parts) < 2:
        return False

    if parts[-1] in DANGEROUS_ATTACHMENT_EXTENSIONS:
        return True

    # Block file.exe.step style double extensions.
    if len(parts) >= 3 and parts[-2] in DANGEROUS_ATTACHMENT_EXTENSIONS:
        return True

    return False


def is_allowed_attachment(name=None, file_type=None):
    """Allow any work-item attachment except executable/script types."""
    mime_type = resolve_attachment_mime_type(file_type).lower()
    if mime_type in DANGEROUS_ATTACHMENT_MIME_TYPES:
        return False
    if has_dangerous_attachment_extension(name):
        return False
    return True
