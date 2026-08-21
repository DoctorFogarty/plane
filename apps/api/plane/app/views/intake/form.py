# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from django.db import IntegrityError
from rest_framework import status
from rest_framework.response import Response

from plane.app.permissions import ROLE, allow_permission
from plane.app.serializers import IntakeFormSerializer
from plane.app.views.base import BaseViewSet
from plane.db.models import Intake, IntakeForm, Project
from plane.db.models.intake import IntakeFormAccess, get_intake_form_anchor
from plane.utils.intake_form import validate_intake_form_fields, validate_issue_type_for_project


def _ensure_intake_enabled(project):
    if not project.intake_view:
        project.intake_view = True
        project.save(update_fields=["intake_view", "updated_at"])
    intake = Intake.objects.filter(project=project, is_default=True).first()
    if not intake:
        Intake.objects.create(name=f"{project.name} Intake", project=project, is_default=True)
    return project


def _validated_form_payload(request, project, instance=None):
    name = request.data.get("name", getattr(instance, "name", None))
    if not name or not str(name).strip():
        raise ValueError("Form title is required")

    access = request.data.get("access", getattr(instance, "access", IntakeFormAccess.PUBLIC))
    if access not in IntakeFormAccess.values:
        raise ValueError("Invalid access value")

    types_enabled = bool(project.is_issue_type_enabled)
    if "issue_type_id" in request.data:
        issue_type_id = request.data.get("issue_type_id")
    else:
        issue_type_id = getattr(instance, "issue_type_id", None)
    parsed_type = validate_issue_type_for_project(
        project_id=project.id,
        issue_type_id=issue_type_id,
        types_enabled=types_enabled,
    )

    if "fields" in request.data:
        fields = request.data.get("fields")
    elif instance is not None:
        fields = instance.fields
    else:
        fields = None
    normalized_fields = validate_intake_form_fields(
        fields,
        project_id=project.id,
        issue_type_id=parsed_type,
        types_enabled=types_enabled,
    )

    payload = {
        "name": str(name).strip(),
        "description": request.data.get("description", getattr(instance, "description", "") or ""),
        "access": access,
        "fields": normalized_fields,
        "issue_type_id": parsed_type,
    }
    if "is_enabled" in request.data:
        payload["is_enabled"] = bool(request.data.get("is_enabled"))
    elif instance is None:
        payload["is_enabled"] = True
    if "success_message" in request.data:
        payload["success_message"] = request.data.get("success_message") or ""
    elif instance is None:
        payload["success_message"] = "Thank you. Your request has been submitted."
    if "logo_props" in request.data and isinstance(request.data.get("logo_props"), dict):
        payload["logo_props"] = request.data.get("logo_props")
    return payload


class IntakeFormViewSet(BaseViewSet):
    serializer_class = IntakeFormSerializer
    model = IntakeForm

    def get_queryset(self):
        return (
            super()
            .get_queryset()
            .filter(
                workspace__slug=self.kwargs.get("slug"),
                project_id=self.kwargs.get("project_id"),
            )
            .select_related("issue_type", "project")
            .order_by("-created_at")
        )

    @allow_permission([ROLE.ADMIN])
    def list(self, request, slug, project_id):
        serializer = IntakeFormSerializer(self.get_queryset(), many=True)
        return Response(serializer.data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def retrieve(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        return Response(IntakeFormSerializer(form).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def create(self, request, slug, project_id):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        if not project:
            return Response({"error": "Project not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            payload = _validated_form_payload(request, project)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        _ensure_intake_enabled(project)
        try:
            form = IntakeForm.objects.create(project_id=project.id, **payload)
        except IntegrityError:
            return Response({"error": "A form with this name already exists"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(IntakeFormSerializer(form).data, status=status.HTTP_201_CREATED)

    @allow_permission([ROLE.ADMIN])
    def partial_update(self, request, slug, project_id, pk):
        project = Project.objects.filter(pk=project_id, workspace__slug=slug).first()
        form = self.get_queryset().filter(pk=pk).first()
        if not project or not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        try:
            payload = _validated_form_payload(request, project, instance=form)
        except ValueError as exc:
            return Response({"error": str(exc)}, status=status.HTTP_400_BAD_REQUEST)
        for key, value in payload.items():
            setattr(form, key, value)
        try:
            form.save()
        except IntegrityError:
            return Response({"error": "A form with this name already exists"}, status=status.HTTP_400_BAD_REQUEST)
        return Response(IntakeFormSerializer(form).data, status=status.HTTP_200_OK)

    @allow_permission([ROLE.ADMIN])
    def destroy(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        form.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    @allow_permission([ROLE.ADMIN])
    def regenerate_anchor(self, request, slug, project_id, pk):
        form = self.get_queryset().filter(pk=pk).first()
        if not form:
            return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)
        form.anchor = get_intake_form_anchor()
        form.save(update_fields=["anchor", "updated_at"])
        return Response(IntakeFormSerializer(form).data, status=status.HTTP_200_OK)
