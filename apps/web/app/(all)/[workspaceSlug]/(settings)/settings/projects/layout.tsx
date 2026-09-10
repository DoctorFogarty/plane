/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Navigate, Outlet } from "react-router";
// hooks
import { useProject } from "@/hooks/store/use-project";
// types
import type { Route } from "./+types/layout";

function ProjectSettingsLayout({ params }: Route.ComponentProps) {
  const { workspaceSlug, projectId } = params;
  const { joinedProjectIds } = useProject();

  if (!projectId && joinedProjectIds.length > 0) {
    return <Navigate to={`/${workspaceSlug}/settings/projects/${joinedProjectIds[0]}`} replace />;
  }

  return <Outlet />;
}

export default observer(ProjectSettingsLayout);
