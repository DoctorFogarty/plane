/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import { Link, useParams, useLocation } from "react-router";
import { EUserPermissionsLevel, getIssueLayoutPathSlug } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { ProjectNavigationViews } from "@/components/workspace/sidebar/project-navigation-views";
import type { TNavigationItem } from "@/components/navigation/navigation-item";
import { isNavigationItemActive } from "@/components/navigation/tab-navigation-utils";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { getProjectFeatureNavigation } from "@/plane-web/components/projects/navigation/helper";

export type { TNavigationItem };

type TProjectItemsProps = {
  workspaceSlug: string;
  projectId: string;
  additionalNavigationItems?: (workspaceSlug: string, projectId: string) => TNavigationItem[];
};

export const ProjectNavigation = observer(function ProjectNavigation(props: TProjectItemsProps) {
  const { workspaceSlug, projectId, additionalNavigationItems } = props;
  const { workItem: workItemIdentifierFromRoute } = useParams();
  // store hooks
  const { t } = useTranslation();
  const { isExtendedProjectSidebarOpened, toggleExtendedProjectSidebar, toggleSidebar } = useAppTheme();
  const { getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const {
    issue: { getIssueIdByIdentifier, getIssueById },
  } = useIssueDetail();
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);
  // pathname
  const pathname = useLocation().pathname;
  // derived values
  const workItemId = workItemIdentifierFromRoute
    ? getIssueIdByIdentifier(workItemIdentifierFromRoute?.toString())
    : undefined;
  const workItem = workItemId ? getIssueById(workItemId) : undefined;
  const project = getPartialProjectById(projectId);
  const storedLayout = projectId ? issuesFilter?.getIssueFilters(projectId)?.displayFilters?.layout : undefined;
  const workItemLayoutNavKey = getIssueLayoutPathSlug(storedLayout);
  // handlers
  const handleProjectClick = () => {
    if (window.innerWidth < 768) {
      toggleSidebar();
    }
    // close the extended sidebar if it is open
    if (isExtendedProjectSidebarOpened) {
      toggleExtendedProjectSidebar(false);
    }
  };

  // memoized navigation items and adding additional navigation items
  const navigationItemsMemo = useMemo(() => {
    if (!project) return [];

    const navItems = getProjectFeatureNavigation(workspaceSlug, projectId, project);

    if (additionalNavigationItems) {
      navItems.push(...additionalNavigationItems(workspaceSlug, projectId));
    }

    return navItems.toSorted((a: TNavigationItem, b: TNavigationItem) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [workspaceSlug, projectId, additionalNavigationItems, project]);

  const isActive = useCallback(
    (item: TNavigationItem) =>
      isNavigationItemActive({
        item,
        pathname,
        projectId,
        workItemId,
        workItem,
        workItemLayoutNavKey,
      }),
    [pathname, projectId, workItem, workItemId, workItemLayoutNavKey]
  );

  if (!project) return null;

  return (
    <>
      {navigationItemsMemo.map((item) => {
        if (!item.shouldRender) return null;

        const hasAccess = allowPermissions(item.access, EUserPermissionsLevel.PROJECT, workspaceSlug, project.id);
        if (!hasAccess) return null;

        const shouldShowCount = item.key === "intake" && (project.intake_count ?? 0) > 0;

        if (item.key === "views") {
          return (
            <ProjectNavigationViews
              key={item.key}
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              onNavigate={handleProjectClick}
            />
          );
        }

        return (
          <Link key={item.key} to={item.href} onClick={handleProjectClick}>
            <SidebarNavItem isActive={!!isActive(item)}>
              <div className="flex w-full items-center justify-between gap-1.5 py-[1px]">
                <div className="flex items-center gap-1.5">
                  <item.icon
                    className={`size-4 flex-shrink-0 ${item.name === "Intake" ? "stroke-1" : "stroke-[1.5]"}`}
                  />
                  <span className="text-11 font-medium">{t(item.i18n_key)}</span>
                </div>
                {shouldShowCount ? (
                  <span className="text-11 font-medium text-tertiary">{project.intake_count}</span>
                ) : null}
              </div>
            </SidebarNavItem>
          </Link>
        );
      })}
    </>
  );
});
