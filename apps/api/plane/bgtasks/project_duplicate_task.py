# Copyright (c) 2023-present Plane Software, Inc. and contributors
# SPDX-License-Identifier: AGPL-3.0-only
# See the LICENSE file for details.

import logging

from celery import shared_task

from plane.utils.project_duplicate import duplicate_project_setup

logger = logging.getLogger("plane.worker")


@shared_task
def project_duplicate_task(
    source_project_id: str,
    workspace_slug: str,
    name: str,
    identifier: str,
    actor_id: str,
) -> str:
    """
    Celery entrypoint for setup-only project duplication.

    Returns the new project id as a string.
    """
    project = duplicate_project_setup(
        source_project_id=source_project_id,
        workspace_slug=workspace_slug,
        name=name,
        identifier=identifier,
        actor_id=actor_id,
    )
    logger.info(
        "project_duplicate_task completed source=%s target=%s",
        source_project_id,
        project.id,
    )
    return str(project.id)
