# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import pytest

from plane.utils.attachment import (
    DEFAULT_ATTACHMENT_MIME_TYPE,
    is_allowed_attachment,
    resolve_attachment_mime_type,
)


@pytest.mark.unit
class TestResolveAttachmentMimeType:
    def test_defaults_empty_and_unknown_values(self):
        assert resolve_attachment_mime_type(None) == DEFAULT_ATTACHMENT_MIME_TYPE
        assert resolve_attachment_mime_type(False) == DEFAULT_ATTACHMENT_MIME_TYPE
        assert resolve_attachment_mime_type("") == DEFAULT_ATTACHMENT_MIME_TYPE
        assert resolve_attachment_mime_type("   ") == DEFAULT_ATTACHMENT_MIME_TYPE

    def test_keeps_cad_and_browser_types(self):
        assert resolve_attachment_mime_type("application/step") == "application/step"
        assert resolve_attachment_mime_type("image/vnd.dxf") == "image/vnd.dxf"
        assert resolve_attachment_mime_type(" text/plain ") == "text/plain"


@pytest.mark.unit
class TestIsAllowedAttachment:
    @pytest.mark.parametrize(
        ("name", "file_type"),
        [
            ("bracket.step", ""),
            ("bracket.STEP", "application/step"),
            ("housing.stp", "model/step"),
            ("toolpath.tap", ""),
            ("toolpath.TAP", "text/plain"),
            ("plate.dxf", "image/vnd.dxf"),
            ("plate.DXF", "application/dxf"),
            ("assembly.sldprt", "application/octet-stream"),
            ("layout.dwg", "image/vnd.dwg"),
            ("surface.iges", ""),
        ],
    )
    def test_allows_engineering_documents(self, name, file_type):
        assert is_allowed_attachment(name=name, file_type=file_type) is True

    def test_rejects_executables_even_with_generic_type(self):
        assert is_allowed_attachment(name="payload.exe", file_type="application/octet-stream") is False
        assert is_allowed_attachment(name="payload.exe", file_type="application/x-msdownload") is False
        assert is_allowed_attachment(name="notes.txt", file_type="application/x-msdownload") is False
        assert is_allowed_attachment(name="payload.exe.step", file_type="application/step") is False
