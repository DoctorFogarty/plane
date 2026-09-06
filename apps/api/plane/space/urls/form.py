# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.urls import path

from plane.space.views import (
    IntakeFormAttachmentEndpoint,
    IntakeFormPublicEndpoint,
    IntakeFormSubmitEndpoint,
)

urlpatterns = [
    path(
        "forms/<str:anchor>/",
        IntakeFormPublicEndpoint.as_view(),
        name="intake-form-public",
    ),
    path(
        "forms/<str:anchor>/submissions/",
        IntakeFormSubmitEndpoint.as_view(),
        name="intake-form-submit",
    ),
    path(
        "forms/<str:anchor>/attachments/",
        IntakeFormAttachmentEndpoint.as_view(),
        name="intake-form-attachment-upload",
    ),
    path(
        "forms/<str:anchor>/attachments/<uuid:pk>/",
        IntakeFormAttachmentEndpoint.as_view(),
        name="intake-form-attachment-detail",
    ),
]
