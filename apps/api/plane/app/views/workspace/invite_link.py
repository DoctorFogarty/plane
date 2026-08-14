# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

# Python imports
from datetime import datetime

import jwt

# Django imports
from django.conf import settings
from django.core.exceptions import ValidationError
from django.core.validators import validate_email
from django.utils import timezone

# Third party modules
from rest_framework import status
from rest_framework.permissions import AllowAny, IsAuthenticated
from rest_framework.response import Response

# Module imports
from plane.app.permissions import WorkSpaceAdminPermission
from plane.app.serializers import (
    WorkspaceInviteLinkSerializer,
    WorkspaceInviteLinkPublicSerializer,
    WorkSpaceMemberInviteSerializer,
)
from plane.app.views.base import BaseAPIView
from plane.bgtasks.event_tracking_task import track_event
from plane.db.models import (
    Workspace,
    WorkspaceInviteLink,
    WorkspaceMember,
    WorkspaceMemberInvite,
)
from plane.utils.analytics_events import USER_JOINED_WORKSPACE
from plane.utils.cache import invalidate_cache
from .. import BaseViewSet


ALLOWED_INVITE_LINK_ROLES = {5, 15}


class WorkspaceInviteLinkViewSet(BaseViewSet):
    """Admin endpoint for creating, listing, updating and revoking workspace invite links."""

    serializer_class = WorkspaceInviteLinkSerializer
    model = WorkspaceInviteLink
    permission_classes = [WorkSpaceAdminPermission]

    def get_queryset(self):
        return self.filter_queryset(
            super()
            .get_queryset()
            .filter(workspace__slug=self.kwargs.get("slug"))
            .select_related("workspace")
        )

    def list(self, request, slug):
        invite_link = self.get_queryset().first()
        if not invite_link:
            return Response([], status=status.HTTP_200_OK)
        serializer = WorkspaceInviteLinkSerializer(invite_link)
        return Response([serializer.data], status=status.HTTP_200_OK)

    def create(self, request, slug):
        workspace = Workspace.objects.get(slug=slug)
        role = int(request.data.get("role", 15))
        if role not in ALLOWED_INVITE_LINK_ROLES:
            return Response(
                {"error": "Invite link role must be Guest (5) or Member (15)"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        # Soft-delete any existing link so regenerate always yields a fresh anchor
        existing = WorkspaceInviteLink.objects.filter(workspace=workspace).first()
        if existing:
            existing.delete()

        invite_link = WorkspaceInviteLink.objects.create(
            workspace=workspace,
            role=role,
            is_active=True,
            created_by=request.user,
        )
        serializer = WorkspaceInviteLinkSerializer(invite_link)
        return Response(serializer.data, status=status.HTTP_201_CREATED)

    def partial_update(self, request, slug, pk):
        invite_link = WorkspaceInviteLink.objects.get(pk=pk, workspace__slug=slug)
        role = request.data.get("role")
        if role is not None:
            role = int(role)
            if role not in ALLOWED_INVITE_LINK_ROLES:
                return Response(
                    {"error": "Invite link role must be Guest (5) or Member (15)"},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            invite_link.role = role

        if "is_active" in request.data:
            invite_link.is_active = bool(request.data.get("is_active"))

        invite_link.save()
        serializer = WorkspaceInviteLinkSerializer(invite_link)
        return Response(serializer.data, status=status.HTTP_200_OK)

    def destroy(self, request, slug, pk):
        invite_link = WorkspaceInviteLink.objects.get(pk=pk, workspace__slug=slug)
        invite_link.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)


class WorkspaceInviteLinkPublicEndpoint(BaseAPIView):
    """Public metadata for a workspace invite link."""

    permission_classes = [AllowAny]

    def get(self, request, slug, code):
        invite_link = (
            WorkspaceInviteLink.objects.filter(
                workspace__slug=slug,
                anchor=code,
                is_active=True,
            )
            .select_related("workspace")
            .first()
        )
        if not invite_link:
            return Response(
                {"error": "Invite link not found"},
                status=status.HTTP_404_NOT_FOUND,
            )
        serializer = WorkspaceInviteLinkPublicSerializer(invite_link)
        return Response(serializer.data, status=status.HTTP_200_OK)

class WorkspaceInviteLinkClaimEndpoint(BaseAPIView):
    """Create a per-email WorkspaceMemberInvite from a shareable invite link."""

    permission_classes = [AllowAny]

    def post(self, request, slug, code):
        invite_link = (
            WorkspaceInviteLink.objects.filter(
                workspace__slug=slug,
                anchor=code,
                is_active=True,
            )
            .select_related("workspace")
            .first()
        )
        if not invite_link:
            return Response(
                {"error": "Invite link not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        email = (request.data.get("email") or "").strip().lower()
        if not email:
            return Response({"error": "Email is required"}, status=status.HTTP_400_BAD_REQUEST)

        try:
            validate_email(email)
        except ValidationError:
            return Response({"error": "Invalid email"}, status=status.HTTP_400_BAD_REQUEST)

        workspace = invite_link.workspace

        if WorkspaceMember.objects.filter(workspace=workspace, member__email__iexact=email, is_active=True).exists():
            return Response(
                {"error": "User is already a member of this workspace"},
                status=status.HTTP_400_BAD_REQUEST,
            )

        existing_invite = WorkspaceMemberInvite.objects.filter(workspace=workspace, email=email).first()
        if existing_invite:
            # Mark accepted so post-signup ``process_workspace_project_invitations`` joins the user
            if not existing_invite.accepted:
                existing_invite.accepted = True
                existing_invite.responded_at = timezone.now()
                existing_invite.role = invite_link.role
                existing_invite.save(update_fields=["accepted", "responded_at", "role", "updated_at"])
            serializer = WorkSpaceMemberInviteSerializer(existing_invite)
            return Response(serializer.data, status=status.HTTP_200_OK)

        workspace_invite = WorkspaceMemberInvite.objects.create(
            email=email,
            workspace=workspace,
            token=jwt.encode(
                {"email": email, "timestamp": datetime.now().timestamp()},
                settings.SECRET_KEY,
                algorithm="HS256",
            ),
            role=invite_link.role,
            accepted=True,
            responded_at=timezone.now(),
            created_by=invite_link.created_by,
        )
        serializer = WorkSpaceMemberInviteSerializer(workspace_invite)
        return Response(serializer.data, status=status.HTTP_201_CREATED)


class WorkspaceInviteLinkJoinEndpoint(BaseAPIView):
    """Authenticated join via a shareable workspace invite link."""

    permission_classes = [IsAuthenticated]

    @invalidate_cache(path="/api/workspaces/", user=False)
    @invalidate_cache(path="/api/users/me/workspaces/", multiple=True)
    @invalidate_cache(
        path="/api/workspaces/:slug/members/",
        user=False,
        multiple=True,
        url_params=True,
    )
    @invalidate_cache(path="/api/users/me/settings/", multiple=True)
    def post(self, request, slug, code):
        invite_link = (
            WorkspaceInviteLink.objects.filter(
                workspace__slug=slug,
                anchor=code,
                is_active=True,
            )
            .select_related("workspace")
            .first()
        )
        if not invite_link:
            return Response(
                {"error": "Invite link not found"},
                status=status.HTTP_404_NOT_FOUND,
            )

        workspace = invite_link.workspace
        user = request.user

        workspace_member = WorkspaceMember.objects.filter(workspace=workspace, member=user).first()
        if workspace_member is not None:
            if not workspace_member.is_active:
                workspace_member.is_active = True
                workspace_member.role = invite_link.role
                workspace_member.save()
            # Already a member — idempotent success
        else:
            WorkspaceMember.objects.create(
                workspace=workspace,
                member=user,
                role=invite_link.role,
                created_by=user,
            )

        user.last_workspace_id = workspace.id
        user.save()

        # Clear any pending email invite for this user in this workspace
        WorkspaceMemberInvite.objects.filter(workspace=workspace, email__iexact=user.email).delete()

        track_event.delay(
            user_id=user.id,
            event_name=USER_JOINED_WORKSPACE,
            slug=slug,
            event_properties={
                "user_id": user.id,
                "workspace_id": workspace.id,
                "workspace_slug": workspace.slug,
                "role": invite_link.role,
                "joined_at": str(timezone.now()),
                "join_method": "invite_link",
            },
        )

        return Response(
            {"message": "Successfully joined the workspace", "workspace_slug": workspace.slug},
            status=status.HTTP_200_OK,
        )
