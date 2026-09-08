# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import json
import uuid
from datetime import timedelta

from django.conf import settings
from django.core.serializers.json import DjangoJSONEncoder
from django.utils import timezone
from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.serializers import IssueCreateSerializer
from plane.authentication.rate_limit import IntakeFormSubmitThrottle, IntakeFormUploadThrottle
from plane.bgtasks.issue_activities_task import issue_activity
from plane.bgtasks.storage_metadata_task import get_asset_object_metadata
from plane.db.models import (
    FileAsset,
    Intake,
    IntakeForm,
    IntakeIssue,
    IssueProperty,
    Label,
    Project,
    State,
    StateGroup,
)
from plane.db.models.intake import IntakeFormAccess, SourceType
from plane.db.models.issue_property import IssuePropertyType
from plane.settings.storage import S3Storage
from plane.space.views.base import BaseAPIView
from plane.utils.content_validator import validate_html_content
from plane.utils.host import base_host
from plane.utils.intake_form import (
    INTAKE_FORM_PENDING_ATTACHMENT_HOURLY_LIMIT,
    MAX_INTAKE_FORM_ATTACHMENTS,
    PUBLIC_PROPERTY_TYPES,
    field_map,
    form_allows_attachments,
    is_valid_email,
    pending_form_attachments,
)
from plane.utils.issue_property import upsert_property_values
from plane.utils.attachment import is_allowed_attachment, resolve_attachment_mime_type
from plane.utils.path_validator import sanitize_filename


def _active_form(anchor):
    form = (
        IntakeForm.objects.select_related("project", "issue_type")
        .filter(anchor=anchor, is_enabled=True, deleted_at__isnull=True)
        .first()
    )
    if not form or not form.project or not form.project.intake_view:
        return None
    return form


def _public_not_found():
    return Response({"error": "Form not found"}, status=status.HTTP_404_NOT_FOUND)


def _build_public_schema(form: IntakeForm):
    project = form.project
    fields_config = form.fields or []
    property_ids = [item.get("property_id") for item in fields_config if item.get("source") == "property"]
    properties = {
        str(p.id): p
        for p in IssueProperty.objects.filter(
            project_id=project.id,
            id__in=property_ids,
            is_active=True,
        ).prefetch_related("options")
        if p.property_type in PUBLIC_PROPERTY_TYPES and p.property_type != IssuePropertyType.MEMBER
    }

    label_ids = []
    for item in fields_config:
        if item.get("key") == "labels":
            label_ids.extend(item.get("allowed_ids") or [])
    labels = []
    if label_ids:
        labels = [
            {"id": str(row["id"]), "name": row["name"], "color": row["color"]}
            for row in Label.objects.filter(project_id=project.id, id__in=label_ids).values("id", "name", "color")
        ]
    elif any(item.get("key") == "labels" for item in fields_config):
        labels = [
            {"id": str(row["id"]), "name": row["name"], "color": row["color"]}
            for row in Label.objects.filter(project_id=project.id).values("id", "name", "color")
        ]

    public_fields = []
    for item in fields_config:
        if item.get("source") == "system":
            public_item = {
                "key": item["key"],
                "source": "system",
                "required": bool(item.get("required")),
            }
            if item["key"] == "labels":
                allowed = item.get("allowed_ids") or []
                public_item["allowed_ids"] = [str(label["id"]) for label in labels] if not allowed else allowed
                public_item["labels"] = (
                    [label for label in labels if str(label["id"]) in set(public_item["allowed_ids"])]
                    if allowed
                    else labels
                )
            if item["key"] == "attachments":
                public_item["max_count"] = MAX_INTAKE_FORM_ATTACHMENTS
                public_item["max_size"] = settings.FILE_SIZE_LIMIT
            public_fields.append(public_item)
            continue
        property_obj = properties.get(item.get("property_id"))
        if property_obj is None:
            continue
        options = [
            {"id": str(option.id), "name": option.name}
            for option in property_obj.options.filter(is_active=True).order_by("sort_order")
        ]
        public_fields.append(
            {
                "key": str(property_obj.id),
                "source": "property",
                "property_id": str(property_obj.id),
                "required": bool(item.get("required") or property_obj.is_required),
                "name": property_obj.name,
                "description": property_obj.description,
                "property_type": property_obj.property_type,
                "settings": property_obj.settings or {},
                "options": options,
            }
        )

    return {
        "id": str(form.id),
        "name": form.name,
        "description": form.description,
        "access": form.access,
        "success_message": form.success_message,
        "logo_props": form.logo_props or {},
        "fields": public_fields,
        "project": {
            "name": project.name,
            "identifier": project.identifier,
            "logo_props": project.logo_props or {},
            "emoji": project.emoji,
            "icon_prop": project.icon_prop,
        },
        "issue_type": (
            {
                "id": str(form.issue_type_id),
                "name": form.issue_type.name,
                "logo_props": form.issue_type.logo_props or {},
            }
            if form.issue_type
            else None
        ),
    }


def _require_active_form(request, anchor):
    form = _active_form(anchor)
    if not form:
        return None, _public_not_found()
    if form.access == IntakeFormAccess.AUTHENTICATED and not request.user.is_authenticated:
        return None, Response({"error": "Authentication required"}, status=status.HTTP_401_UNAUTHORIZED)
    return form, None


def _pending_form_asset(form, pk):
    return FileAsset.objects.filter(
        pk=pk,
        project_id=form.project_id,
        workspace_id=form.project.workspace_id,
        entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
        entity_identifier=str(form.id),
        issue_id__isnull=True,
        is_deleted=False,
    ).first()


def _ensure_triage_state(project: Project):
    triage_state = State.triage_objects.filter(project_id=project.id, workspace_id=project.workspace_id).first()
    if triage_state:
        return triage_state
    return State.objects.create(
        name="Triage",
        group=StateGroup.TRIAGE.value,
        project_id=project.id,
        workspace_id=project.workspace_id,
        color="#4E5355",
        sequence=65000,
        default=False,
    )


class IntakeFormPublicEndpoint(BaseAPIView):
    permission_classes = [AllowAny]

    def get(self, request, anchor):
        form = _active_form(anchor)
        if not form:
            return _public_not_found()
        return Response(_build_public_schema(form), status=status.HTTP_200_OK)


class IntakeFormSubmitEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [IntakeFormSubmitThrottle]

    def post(self, request, anchor):
        form, error_response = _require_active_form(request, anchor)
        if error_response:
            return error_response

        honeypot = request.data.get("website") or request.data.get("hp")
        if honeypot:
            return Response(status=status.HTTP_204_NO_CONTENT)

        project = form.project
        schema = field_map(form.fields)
        if "name" not in schema:
            return Response({"error": "Form is misconfigured"}, status=status.HTTP_400_BAD_REQUEST)

        issue_payload = request.data.get("issue") or {}
        if not isinstance(issue_payload, dict):
            issue_payload = {}

        name = (issue_payload.get("name") or request.data.get("name") or "").strip()
        if schema["name"].get("required") and not name:
            return Response({"error": "Name is required"}, status=status.HTTP_400_BAD_REQUEST)

        errors = {}
        submitter_email = (request.data.get("submitter_email") or "").strip()
        submitter_name = (request.data.get("submitter_name") or "").strip()
        email_field = schema.get("submitter_email")
        if email_field:
            if email_field.get("required") and not submitter_email:
                errors["submitter_email"] = "Email is required"
            elif submitter_email and not is_valid_email(submitter_email):
                errors["submitter_email"] = "Enter a valid email"
        name_field = schema.get("submitter_name")
        if name_field and name_field.get("required") and not submitter_name:
            errors["submitter_name"] = "Name is required"

        description_html = issue_payload.get("description_html") or request.data.get("description_html") or "<p></p>"
        if schema.get("description", {}).get("required") and (not description_html or description_html == "<p></p>"):
            errors["description"] = "Description is required"
        _, _, sanitized_html = validate_html_content(description_html)
        safe_description_html = sanitized_html if sanitized_html is not None else "<p></p>"

        priority = issue_payload.get("priority", "none")
        if "priority" in schema:
            if priority not in ["low", "medium", "high", "urgent", "none"]:
                errors["priority"] = "Invalid priority"
        else:
            priority = "none"

        label_ids = []
        if "labels" in schema:
            requested_labels = issue_payload.get("label_ids") or request.data.get("label_ids") or []
            if not isinstance(requested_labels, list):
                requested_labels = []
            allowed = schema["labels"].get("allowed_ids") or []
            requested_str = [str(label_id) for label_id in requested_labels]
            if allowed:
                allowed_set = set(str(label_id) for label_id in allowed)
                label_ids = [label_id for label_id in requested_str if label_id in allowed_set]
            else:
                label_ids = list(
                    str(pk)
                    for pk in Label.objects.filter(project_id=project.id, id__in=requested_str).values_list(
                        "id", flat=True
                    )
                )
            if schema["labels"].get("required") and not label_ids:
                errors["labels"] = "Select at least one label"

        property_values = request.data.get("property_values") or {}
        if not isinstance(property_values, dict):
            property_values = {}
        allowed_property_ids = {
            item["property_id"] for item in (form.fields or []) if item.get("source") == "property" and item.get("property_id")
        }
        filtered_properties = {
            str(property_id): value
            for property_id, value in property_values.items()
            if str(property_id) in allowed_property_ids
        }
        for item in form.fields or []:
            if item.get("source") != "property":
                continue
            property_id = item.get("property_id")
            if item.get("required") and (
                property_id not in filtered_properties or filtered_properties.get(property_id) in (None, "", [])
            ):
                errors[property_id] = "This field is required"

        attachments_field = schema.get("attachments")
        attachment_queryset = FileAsset.objects.none()
        if attachments_field:
            attachment_queryset, requested_attachment_ids = pending_form_attachments(
                form=form,
                attachment_ids=request.data.get("attachment_ids") or [],
            )
            if len(requested_attachment_ids) > MAX_INTAKE_FORM_ATTACHMENTS:
                errors["attachments"] = "Too many attachments"
            elif attachment_queryset.count() != len(requested_attachment_ids):
                errors["attachments"] = "One or more attachments are invalid"
            elif attachments_field.get("required") and not requested_attachment_ids:
                errors["attachments"] = "Add at least one file"

        if errors:
            return Response({"error": "Validation failed", "errors": errors}, status=status.HTTP_400_BAD_REQUEST)

        triage_state = _ensure_triage_state(project)
        issue_data = {
            "name": name,
            "description_html": safe_description_html,
            "description_json": issue_payload.get("description_json") or {},
            "priority": priority,
            "state_id": str(triage_state.id),
        }
        if label_ids:
            issue_data["label_ids"] = label_ids
        if form.issue_type_id:
            issue_data["type_id"] = str(form.issue_type_id)

        serializer = IssueCreateSerializer(
            data=issue_data,
            context={
                "project_id": project.id,
                "workspace_id": project.workspace_id,
                "default_assignee_id": project.default_assignee_id,
                "allow_triage_state": True,
            },
        )
        if not serializer.is_valid():
            return Response(serializer.errors, status=status.HTTP_400_BAD_REQUEST)
        issue = serializer.save()

        actor_id = str(request.user.id) if request.user.is_authenticated else None
        if not request.user.is_authenticated:
            issue.created_by = None
            issue.updated_by = None
            issue.save(update_fields=["created_by", "updated_by"], disable_auto_set_user=True)

        if filtered_properties:
            _values, property_errors = upsert_property_values(
                issue=issue,
                project_id=project.id,
                workspace_id=project.workspace_id,
                property_values=filtered_properties,
                actor_id=actor_id,
                validate_required=False,
            )
            if property_errors:
                issue.delete(soft=False)
                return Response(
                    {"error": "Validation failed", "errors": property_errors},
                    status=status.HTTP_400_BAD_REQUEST,
                )

        intake = Intake.objects.filter(project_id=project.id, is_default=True).first()
        if not intake:
            intake = Intake.objects.create(name=f"{project.name} Intake", project=project, is_default=True)

        IntakeIssue.objects.create(
            intake_id=intake.id,
            project_id=project.id,
            issue=issue,
            source=SourceType.FORM,
            source_email=submitter_email or None,
            extra={"form_id": str(form.id), "submitter_name": submitter_name or None},
            created_by_id=actor_id,
        )

        if attachments_field:
            attachment_queryset.filter(issue_id__isnull=True).update(issue_id=issue.id)

        issue_activity.delay(
            type="issue.activity.created",
            requested_data=json.dumps({"issue": issue_data, "source": SourceType.FORM}, cls=DjangoJSONEncoder),
            actor_id=actor_id,
            issue_id=str(issue.id),
            project_id=str(project.id),
            current_instance=None,
            epoch=int(timezone.now().timestamp()),
            notification=True,
            origin=base_host(request=request, is_app=False),
        )

        return Response({"success": True}, status=status.HTTP_201_CREATED)


class IntakeFormAttachmentEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    throttle_classes = [IntakeFormUploadThrottle]

    def post(self, request, anchor):
        form, error_response = _require_active_form(request, anchor)
        if error_response:
            return error_response
        if not form_allows_attachments(form.fields):
            return Response({"error": "Attachments are not enabled on this form"}, status=status.HTTP_400_BAD_REQUEST)

        name = sanitize_filename(request.data.get("name")) or "unnamed"
        file_type = resolve_attachment_mime_type(request.data.get("type"))
        try:
            size = int(request.data.get("size", settings.FILE_SIZE_LIMIT))
        except (TypeError, ValueError):
            return Response({"error": "Invalid file size.", "status": False}, status=status.HTTP_400_BAD_REQUEST)

        if not is_allowed_attachment(name=name, file_type=file_type):
            return Response(
                {"error": "Invalid file type.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )
        if size < 1 or size > settings.FILE_SIZE_LIMIT:
            return Response(
                {"error": "Invalid file size.", "status": False},
                status=status.HTTP_400_BAD_REQUEST,
            )

        pending_count = FileAsset.objects.filter(
            project_id=form.project_id,
            workspace_id=form.project.workspace_id,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            entity_identifier=str(form.id),
            issue_id__isnull=True,
            is_deleted=False,
            created_at__gte=timezone.now() - timedelta(hours=1),
        ).count()
        if pending_count >= INTAKE_FORM_PENDING_ATTACHMENT_HOURLY_LIMIT:
            return Response(
                {"error": "Too many pending uploads. Try again later."},
                status=status.HTTP_429_TOO_MANY_REQUESTS,
            )

        size_limit = min(size, settings.FILE_SIZE_LIMIT)
        asset_key = f"{form.project.workspace_id}/{uuid.uuid4().hex}-{name}"
        created_by = request.user if request.user.is_authenticated else None
        asset = FileAsset.objects.create(
            attributes={"name": name, "type": file_type, "size": size_limit},
            asset=asset_key,
            size=size_limit,
            workspace_id=form.project.workspace_id,
            created_by=created_by,
            project_id=form.project_id,
            entity_type=FileAsset.EntityTypeContext.ISSUE_ATTACHMENT,
            entity_identifier=str(form.id),
        )

        storage = S3Storage(request=request)
        presigned_url = storage.generate_presigned_post(object_name=asset_key, file_type=file_type, file_size=size_limit)
        return Response(
            {
                "upload_data": presigned_url,
                "asset_id": str(asset.id),
                "asset_url": "",
            },
            status=status.HTTP_200_OK,
        )

    def patch(self, request, anchor, pk):
        form, error_response = _require_active_form(request, anchor)
        if error_response:
            return error_response
        if not form_allows_attachments(form.fields):
            return Response({"error": "Attachments are not enabled on this form"}, status=status.HTTP_400_BAD_REQUEST)

        asset = _pending_form_asset(form, pk)
        if not asset:
            return Response({"error": "Attachment not found"}, status=status.HTTP_404_NOT_FOUND)

        asset.is_uploaded = True
        if not asset.storage_metadata:
            get_asset_object_metadata.delay(str(asset.id))
        asset.save(update_fields=["is_uploaded", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)

    def delete(self, request, anchor, pk):
        form, error_response = _require_active_form(request, anchor)
        if error_response:
            return error_response
        if not form_allows_attachments(form.fields):
            return Response({"error": "Attachments are not enabled on this form"}, status=status.HTTP_400_BAD_REQUEST)

        asset = _pending_form_asset(form, pk)
        if not asset:
            return Response({"error": "Attachment not found"}, status=status.HTTP_404_NOT_FOUND)

        asset.is_deleted = True
        asset.deleted_at = timezone.now()
        asset.save(update_fields=["is_deleted", "deleted_at", "updated_at"])
        return Response(status=status.HTTP_204_NO_CONTENT)
