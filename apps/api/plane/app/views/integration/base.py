# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import uuid

from django.contrib.auth.hashers import make_password
from django.db import transaction
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers.integration import (
    GithubRepositorySyncSerializer,
    IntegrationSerializer,
    WorkspaceIntegrationSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.db.models import (
    APIToken,
    GithubRepository,
    GithubRepositorySync,
    Integration,
    Project,
    User,
    Workspace,
    WorkspaceIntegration,
    WorkspaceMember,
)
from plane.utils.github import GitHubAPIError, GitHubAppClient
from plane.app.views.integration.slack import ensure_slack_integration


def ensure_github_integration() -> Integration:
    integration, _ = Integration.objects.get_or_create(
        provider="github",
        defaults={
            "title": "GitHub",
            "author": "Plane",
            "avatar_url": "",
            "description": {"content": "Connect GitHub repositories to Plane projects."},
            "verified": True,
            "network": 2,
        },
    )
    return integration


class IntegrationListEndpoint(BaseAPIView):
    def get(self, request):
        ensure_github_integration()
        ensure_slack_integration()
        integrations = Integration.objects.filter(verified=True).order_by("title")
        serializer = IntegrationSerializer(integrations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)


class WorkspaceIntegrationEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug):
        integrations = WorkspaceIntegration.objects.filter(workspace__slug=slug).select_related("integration")
        serializer = WorkspaceIntegrationSerializer(integrations, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def post(self, request, slug, provider):
        if provider == "slack":
            ensure_slack_integration()
            workspace = Workspace.objects.filter(slug=slug).first()
            if not workspace:
                return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)
            existing = WorkspaceIntegration.objects.filter(workspace=workspace, integration__provider="slack").first()
            if existing:
                serializer = WorkspaceIntegrationSerializer(existing)
                return Response(serializer.data, status=status.HTTP_200_OK)
            return Response(
                {"error": "Complete Slack OAuth from workspace settings to connect Slack"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        if provider != "github":
            return Response({"error": "Unsupported provider"}, status=status.HTTP_400_BAD_REQUEST)

        installation_id = request.data.get("installation_id")
        if not installation_id:
            return Response({"error": "installation_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = Workspace.objects.filter(slug=slug).first()
        if not workspace:
            return Response({"error": "Workspace not found"}, status=status.HTTP_404_NOT_FOUND)

        integration = ensure_github_integration()
        existing = WorkspaceIntegration.objects.filter(workspace=workspace, integration=integration).first()

        client = GitHubAppClient()
        if not client.is_configured:
            return Response(
                {"error": "GitHub App is not configured"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        try:
            installation = client.get_installation(installation_id)
        except GitHubAPIError as exc:
            return Response(
                {"error": str(exc), "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )
        except Exception as exc:
            return Response(
                {
                    "error": (
                        "Could not authenticate the GitHub App. Check App ID and private key in "
                        "God Mode → Authentication → GitHub."
                    ),
                    "detail": str(exc),
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        account = installation.get("account") or {}
        config = {
            "installation_id": str(installation_id),
            "account_login": account.get("login"),
            "account_id": account.get("id"),
            "account_type": account.get("type"),
            "target_type": installation.get("target_type"),
        }

        # Idempotent reinstall / setup_action=update: refresh config and succeed
        if existing:
            existing.config = {**(existing.config or {}), **config}
            existing.metadata = {**(existing.metadata or {}), "installation": installation}
            existing.save(update_fields=["config", "metadata", "updated_at"])
            serializer = WorkspaceIntegrationSerializer(existing)
            return Response(serializer.data, status=status.HTTP_200_OK)

        with transaction.atomic():
            # Clear soft-deleted prior installs so unique_together can accept a new row
            for stale in WorkspaceIntegration.all_objects.filter(
                workspace=workspace, integration=integration, deleted_at__isnull=False
            ):
                stale.delete(soft=False)

            bot_user = User.objects.create(
                email=f"github-bot-{workspace.id}-{uuid.uuid4().hex[:8]}@plane.so",
                username=f"github-bot-{uuid.uuid4().hex[:12]}",
                display_name="GitHub",
                first_name="GitHub",
                is_bot=True,
                is_password_autoset=True,
                password=make_password(uuid.uuid4().hex),
            )
            api_token = APIToken.objects.create(
                user=bot_user,
                user_type=1,
                workspace=workspace,
                label="GitHub Integration",
                is_service=True,
            )
            WorkspaceMember.objects.get_or_create(
                workspace=workspace,
                member=bot_user,
                defaults={"role": ROLE.MEMBER.value, "is_active": True},
            )
            workspace_integration = WorkspaceIntegration.objects.create(
                workspace=workspace,
                integration=integration,
                actor=bot_user,
                api_token=api_token,
                config=config,
                metadata={"installation": installation},
            )

        serializer = WorkspaceIntegrationSerializer(workspace_integration)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceIntegrationDeleteEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN], level="WORKSPACE")
    def delete(self, request, slug, pk):
        workspace_integration = WorkspaceIntegration.objects.filter(workspace__slug=slug, pk=pk).first()
        if not workspace_integration:
            return Response({"error": "Workspace integration not found"}, status=status.HTTP_404_NOT_FOUND)

        actor = workspace_integration.actor
        api_token = workspace_integration.api_token
        workspace_integration.delete()
        if api_token:
            api_token.delete()
        if actor and actor.is_bot:
            WorkspaceMember.objects.filter(member=actor).delete()
            actor.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class GithubRepositoryListEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="WORKSPACE")
    def get(self, request, slug, workspace_integration_id):
        workspace_integration = WorkspaceIntegration.objects.filter(
            workspace__slug=slug, pk=workspace_integration_id, integration__provider="github"
        ).first()
        if not workspace_integration:
            return Response({"error": "GitHub is not connected"}, status=status.HTTP_404_NOT_FOUND)

        installation_id = (workspace_integration.config or {}).get("installation_id")
        if not installation_id:
            return Response({"error": "GitHub installation id missing"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            page = int(request.GET.get("page", 1))
        except (TypeError, ValueError):
            return Response({"error": "page must be a positive integer"}, status=status.HTTP_400_BAD_REQUEST)
        if page < 1:
            return Response({"error": "page must be a positive integer"}, status=status.HTTP_400_BAD_REQUEST)

        client = GitHubAppClient(installation_id=installation_id)
        try:
            data = client.list_repositories(page=page, per_page=30)
        except GitHubAPIError as exc:
            return Response(
                {"error": str(exc), "detail": exc.response},
                status=status.HTTP_400_BAD_REQUEST,
            )

        return Response(
            {
                "total_count": data.get("total_count", 0),
                "repositories": data.get("repositories", []),
            },
            status=status.HTTP_200_OK,
        )


class GithubRepositorySyncEndpoint(BaseAPIView):
    @allow_permission(allowed_roles=[ROLE.ADMIN, ROLE.MEMBER], level="PROJECT")
    def get(self, request, slug, project_id, workspace_integration_id):
        syncs = GithubRepositorySync.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            workspace_integration_id=workspace_integration_id,
        ).select_related("repository")
        serializer = GithubRepositorySyncSerializer(syncs, many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def post(self, request, slug, project_id, workspace_integration_id):
        workspace_integration = WorkspaceIntegration.objects.filter(
            workspace__slug=slug, pk=workspace_integration_id, integration__provider="github"
        ).first()
        if not workspace_integration:
            return Response({"error": "GitHub is not connected"}, status=status.HTTP_404_NOT_FOUND)

        project = Project.objects.filter(workspace__slug=slug, pk=project_id).first()
        if not project:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)

        installation_id = (workspace_integration.config or {}).get("installation_id")
        if not installation_id:
            return Response({"error": "GitHub installation id missing"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            repository_id = int(request.data.get("repository_id"))
        except (TypeError, ValueError):
            return Response(
                {"error": "repository_id must be a positive integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if repository_id < 1:
            return Response(
                {"error": "repository_id must be a positive integer"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        client = GitHubAppClient(installation_id=installation_id)
        try:
            repository_data = client.get_repository_by_id(repository_id)
        except GitHubAPIError as exc:
            return Response(
                {
                    "error": "Repository is not accessible to this GitHub App installation",
                    "detail": exc.response,
                },
                status=status.HTTP_400_BAD_REQUEST,
            )

        if not isinstance(repository_data, dict):
            return Response(
                {"error": "GitHub returned invalid repository metadata"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        owner = (repository_data.get("owner") or {}).get("login")
        name = repository_data.get("name")
        html_url = repository_data.get("html_url")
        try:
            canonical_repository_id = int(repository_data.get("id"))
        except (TypeError, ValueError):
            canonical_repository_id = None
        if canonical_repository_id != repository_id or not owner or not name:
            return Response(
                {"error": "GitHub returned invalid repository metadata"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        repository_config = {
            "default_branch": repository_data.get("default_branch") or "",
            "full_name": repository_data.get("full_name") or f"{owner}/{name}",
            "private": bool(repository_data.get("private")),
        }

        with transaction.atomic():
            project = Project.objects.select_for_update().filter(pk=project.pk).first()
            if not project:
                return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
            current_sync = GithubRepositorySync.objects.filter(project=project).select_related("repository").first()

            if current_sync and current_sync.repository.repository_id == repository_id:
                repository = current_sync.repository
                repository.name = name
                repository.owner = owner
                repository.url = html_url or f"https://github.com/{owner}/{name}"
                repository.config = repository_config
                repository.save(update_fields=["name", "owner", "url", "config", "updated_at"])

                current_sync.actor = workspace_integration.actor
                current_sync.workspace_integration = workspace_integration
                current_sync.credentials = {"installation_id": str(installation_id)}
                current_sync.save(
                    update_fields=[
                        "actor",
                        "workspace_integration",
                        "credentials",
                        "updated_at",
                    ]
                )
                serializer = GithubRepositorySyncSerializer(current_sync)
                return Response(serializer.data, status=status.HTTP_200_OK)

            GithubRepositorySync.objects.filter(project=project).delete()
            repository = GithubRepository.objects.create(
                project=project,
                name=name,
                owner=owner,
                repository_id=repository_id,
                url=html_url or f"https://github.com/{owner}/{name}",
                config=repository_config,
            )
            sync = GithubRepositorySync.objects.create(
                project=project,
                repository=repository,
                actor=workspace_integration.actor,
                workspace_integration=workspace_integration,
                credentials={"installation_id": str(installation_id)},
            )

        serializer = GithubRepositorySyncSerializer(sync)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    @allow_permission(allowed_roles=[ROLE.ADMIN], level="PROJECT")
    def delete(self, request, slug, project_id, workspace_integration_id, pk=None):
        qs = GithubRepositorySync.objects.filter(
            workspace__slug=slug,
            project_id=project_id,
            workspace_integration_id=workspace_integration_id,
        )
        if pk:
            qs = qs.filter(pk=pk)
        deleted = qs.delete()
        if not deleted:
            return Response({"error": "Repository sync not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(status=status.HTTP_204_NO_CONTENT)
