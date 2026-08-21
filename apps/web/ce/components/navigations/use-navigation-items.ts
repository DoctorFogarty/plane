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
import type { TNavigationItem } from "@/components/navigation/tab-navigation-root";
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

export const useNavigationItems = ({
  workspaceSlug,
  projectId,
  project,
  allowPermissions,
}: UseNavigationItemsProps): TNavigationItem[] => {
  const navigationItems = useMemo(() => {
    if (!project) return [];

    const navItems = getProjectFeatureNavigation(workspaceSlug, projectId, project);

    const filteredItems = navItems.filter((item) => {
      if (!item.shouldRender) return false;
      return allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project.id ?? "");
    });

    return filteredItems.toSorted((a, b) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [workspaceSlug, projectId, project, allowPermissions]);

  return navigationItems;
};
