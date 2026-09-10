/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
// plane imports
import { EUserPermissionsLevel } from "@plane/constants";
import type { EUserPermissions } from "@plane/constants";
import type { EUserProjectRoles, IPartialProject } from "@plane/types";
import type { TNavigationItem } from "@/components/navigation/navigation-item";
import { getProjectFeatureNavigation } from "@/plane-web/components/projects/navigation/helper";

type UseNavigationItemsProps = {
  workspaceSlug: string;
  projectId: string;
  project?: IPartialProject;
  allowPermissions: (
    access: EUserPermissions[] | EUserProjectRoles[],
    level: EUserPermissionsLevel,
    workspaceSlug: string,
    projectId: string
  ) => boolean;
};

const FALLBACK_PROJECT_FLAGS = {
  cycle_view: true,
  module_view: true,
  issue_views_view: true,
  page_view: true,
  inbox_view: true,
};

export const useNavigationItems = ({
  workspaceSlug,
  projectId,
  project,
  allowPermissions,
}: UseNavigationItemsProps): TNavigationItem[] => {
  const navigationItems = useMemo(() => {
    const navItems = getProjectFeatureNavigation(workspaceSlug, projectId, project ?? FALLBACK_PROJECT_FLAGS);

    const filteredItems = navItems.filter((item) => {
      if (!item.shouldRender) return false;
      return allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project?.id ?? projectId);
    });

    return filteredItems.toSorted((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [workspaceSlug, projectId, project, allowPermissions]);

  return navigationItems;
};
