/* eslint-disable no-shadow, no-unused-expressions, promise/always-return, unicorn/no-array-sort */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import React, { useCallback, useMemo } from "react";
import { observer } from "mobx-react";
import Link from "next/link";
import { useParams, usePathname } from "next/navigation";
import {
  EUserPermissions,
  EUserPermissionsLevel,
  getIssueLayoutPathSlug,
  isIssueLayoutPathSlug,
} from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import type { EUserProjectRoles } from "@plane/types";
import { EIssuesStoreType } from "@plane/types";
// plane ui
// components
import { SidebarNavItem } from "@/components/sidebar/sidebar-navigation";
import { ProjectNavigationViews } from "@/components/workspace/sidebar/project-navigation-views";
import { isNavHrefActive } from "@/components/navigation/tab-navigation-utils";
// hooks
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
import { getProjectFeatureNavigation } from "@/plane-web/components/projects/navigation/helper";

export type TNavigationItem = {
  name: string;
  href: string;
  icon: React.ElementType;
  access: EUserPermissions[] | EUserProjectRoles[];
  shouldRender: boolean;
  sortOrder: number;
  i18n_key: string;
  key: string;
};

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
  const pathname = usePathname();
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

    return [...navItems].sort((a: TNavigationItem, b: TNavigationItem) => (a.sortOrder || 0) - (b.sortOrder || 0));
  }, [workspaceSlug, projectId, additionalNavigationItems, project]);

  const isActive = useCallback(
    (item: TNavigationItem) => {
      const workItemCondition = workItemId && workItem && !workItem?.is_epic && workItem?.project_id === projectId;
      const epicCondition = workItemId && workItem && workItem?.is_epic && workItem?.project_id === projectId;
      const isLayoutActiveForWorkItem =
        !!workItemCondition && isIssueLayoutPathSlug(item.key) && item.key === workItemLayoutNavKey;
      const isEpicActive = item.key === "epics" && epicCondition;
      if (item.key === "views") {
        return pathname === item.href || pathname === `${item.href}/`;
      }
      return isLayoutActiveForWorkItem || isEpicActive || isNavHrefActive(pathname, item.href);
    },
    [pathname, workItem, workItemId, projectId, workItemLayoutNavKey]
  );

  if (!project) return null;

  return (
    <>
      {navigationItemsMemo.map((item) => {
        if (!item.shouldRender) return;

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
          <Link key={item.key} href={item.href} onClick={handleProjectClick}>
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
