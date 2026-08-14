# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

"""Regression tests for ProjectBulkAssetEndpoint cover attach on project create.

During project create the UI uploads a PROJECT_COVER asset before the project
exists (empty entity_identifier → null project_id), then POSTs bulk attach
with the new project id. A security fix that scoped the queryset to
project_id= broke that path (404 after a successful 201 create).
"""

import pytest
from rest_framework import status

from plane.db.models import FileAsset, Project, ProjectMember, Workspace, WorkspaceMember


@pytest.fixture
def project_bulk_context(db, create_user):
    workspace = Workspace.objects.create(name="Bulk Asset WS", slug="bulk-asset-ws", owner=create_user)
    WorkspaceMember.objects.create(workspace=workspace, member=create_user, role=20)
    project = Project.objects.create(
        name="New Project",
        identifier="NEWP",
        workspace=workspace,
        created_by=create_user,
    )
    ProjectMember.objects.create(project=project, member=create_user, role=20)
    return workspace, project


@pytest.mark.unit
class TestProjectBulkAssetCoverAttach:
    def bulk_url(self, slug, project_id):
        return f"/api/assets/v2/workspaces/{slug}/projects/{project_id}/{project_id}/bulk/"

    @pytest.mark.django_db
    def test_attach_unassigned_project_cover_succeeds(self, session_client, create_user, project_bulk_context):
        """Cover uploaded before project create (null project_id) can be attached."""
        workspace, project = project_bulk_context
        cover = FileAsset.objects.create(
            attributes={"name": "cover.jpg", "type": "image/jpeg", "size": 100},
            asset=f"{workspace.id}/cover.jpg",
            size=100,
            workspace=workspace,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.PROJECT_COVER,
            project_id=None,
            is_uploaded=True,
            storage_metadata={"size": 100},
        )

        response = session_client.post(
            self.bulk_url(workspace.slug, project.id),
            {"asset_ids": [str(cover.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_204_NO_CONTENT, f"Got {response.status_code}: {response.data!r}"
        cover.refresh_from_db()
        assert str(cover.project_id) == str(project.id)
        project.refresh_from_db()
        assert str(project.cover_image_asset_id) == str(cover.id)

    @pytest.mark.django_db
    def test_cross_project_issue_asset_still_rejected(self, session_client, create_user, project_bulk_context):
        """IDOR guard: issue assets from another project must not be attachable."""
        workspace, project = project_bulk_context
        other = Project.objects.create(
            name="Other",
            identifier="OTHR",
            workspace=workspace,
            created_by=create_user,
        )
        ProjectMember.objects.create(project=other, member=create_user, role=20)
        foreign_asset = FileAsset.objects.create(
            attributes={"name": "secret.pdf", "type": "application/pdf", "size": 10},
            asset=f"{workspace.id}/secret.pdf",
            size=10,
            workspace=workspace,
            created_by=create_user,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            project_id=other.id,
            is_uploaded=True,
            storage_metadata={"size": 10},
        )

        response = session_client.post(
            self.bulk_url(workspace.slug, project.id),
            {"asset_ids": [str(foreign_asset.id)]},
            format="json",
        )

        assert response.status_code == status.HTTP_404_NOT_FOUND
        foreign_asset.refresh_from_db()
        assert str(foreign_asset.project_id) == str(other.id)
