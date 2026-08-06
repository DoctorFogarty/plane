# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

from rest_framework import status
from rest_framework.permissions import AllowAny
from rest_framework.response import Response

from plane.app.views.base import BaseAPIView
from plane.bgtasks.github_webhook_task import process_github_webhook
from plane.utils.github import GitHubAppClient, verify_github_webhook_signature


class GithubWebhookEndpoint(BaseAPIView):
    permission_classes = [AllowAny]
    authentication_classes = []

    def post(self, request):
        client = GitHubAppClient()
        secret = client.webhook_secret
        signature = request.headers.get("X-Hub-Signature-256")
        raw_body = request.body

        if not secret:
            return Response(
                {"error": "GitHub webhook secret is not configured"},
                status=status.HTTP_503_SERVICE_UNAVAILABLE,
            )
        if not verify_github_webhook_signature(raw_body, signature, secret):
            return Response({"error": "Invalid signature"}, status=status.HTTP_401_UNAUTHORIZED)

        event = request.headers.get("X-GitHub-Event", "")
        delivery_id = request.headers.get("X-GitHub-Delivery", "")
        payload = request.data

        process_github_webhook.delay(event=event, delivery_id=delivery_id, payload=payload)
        return Response({"ok": True}, status=status.HTTP_202_ACCEPTED)
