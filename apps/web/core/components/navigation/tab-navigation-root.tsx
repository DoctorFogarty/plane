/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
import React, { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useParams, useLocation, Link, useNavigate } from "react-router";
import { EUserPermissionsLevel, EUserPermissions, getIssueLayoutPathSlug } from "@plane/constants";
import { TabNavigationList, TabNavigationItem } from "@plane/propel/tab-navigation";
import { EIssuesStoreType } from "@plane/types";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import { useUserPermissions } from "@/hooks/store/user";
// plane web imports
import { useNavigationItems } from "@/plane-web/components/navigations";
// local imports
import { DuplicateProjectModal } from "../project/duplicate-project-modal";
import { LeaveProjectModal } from "../project/leave-project-modal";
import { PublishProjectModal } from "../project/publish-project/modal";
import type { TNavigationItem } from "./navigation-item";
import { ProjectActionsMenu } from "./project-actions-menu";
import { ProjectHeader } from "./project-header";
import { TabNavigationItemContent } from "./tab-navigation-item-content";
import { TabNavigationOverflowMenu } from "./tab-navigation-overflow-menu";
import { getTabUrl, resolveDefaultTabKey } from "./tab-navigation-utils";
import { TabNavigationVisibleItem } from "./tab-navigation-visible-item";
import { useActiveTab } from "./use-active-tab";
import { useProjectActions } from "./use-project-actions";
import { useResponsiveTabLayout } from "./use-responsive-tab-layout";
import { useTabPreferences } from "./use-tab-preferences";

export type { TNavigationItem } from "./navigation-item";

type TTabNavigationRootProps = {
  workspaceSlug: string;
  projectId: string;
};

export const TabNavigationRoot = observer(function TabNavigationRoot(props: TTabNavigationRootProps) {
  const [duplicateProjectModalOpen, setDuplicateProjectModalOpen] = useState(false);
  const { workspaceSlug, projectId } = props;
  const { workItem: workItemIdentifierFromRoute } = useParams();
  const location = useLocation();
  const pathname = location.pathname;
  const navigate = useNavigate();

  // Store hooks
  const { getPartialProjectById } = useProject();
  const { allowPermissions } = useUserPermissions();
  const {
    issue: { getIssueIdByIdentifier, getIssueById },
  } = useIssueDetail();
  const { issuesFilter } = useIssues(EIssuesStoreType.PROJECT);

  // Tab preferences hook
  const { tabPreferences, handleToggleDefaultTab, handleHideTab, handleShowTab } = useTabPreferences(
    workspaceSlug,
    projectId
  );

  // Derived values
  const workItemId = workItemIdentifierFromRoute
    ? getIssueIdByIdentifier(workItemIdentifierFromRoute?.toString())
    : undefined;
  const workItem = workItemId ? getIssueById(workItemId) : undefined;
  const project = getPartialProjectById(projectId);
  const storedLayout = projectId ? issuesFilter?.getIssueFilters(projectId)?.displayFilters?.layout : undefined;
  const workItemLayoutNavKey = getIssueLayoutPathSlug(storedLayout);

  // Navigation items hook
  const navigationItems = useNavigationItems({
    workspaceSlug,
    projectId,
    project,
    allowPermissions,
  });

  // Active tab hook
  const { isActive, activeItem } = useActiveTab({
    navigationItems,
    pathname,
    workItemId,
    workItem,
    projectId,
    workItemLayoutNavKey,
  });

  // Project actions hook
  const {
    publishModalOpen,
    leaveProjectModalOpen,
    handleLeaveProject,
    handleCopyText,
    handlePublishModal,
    handleLeaveProjectModal,
  } = useProjectActions({
    workspaceSlug,
    projectId,
    activeItem,
  });

  // Filter and sort navigation items
  const allNavigationItems = navigationItems
    .filter((item) => item.shouldRender)
    .toSorted((a, b) => a.sortOrder - b.sortOrder);

  // Split items into two categories:
  // 1. visibleNavigationItems: Items NOT user-hidden (may still overflow due to space)
  // 2. hiddenNavigationItems: Items user explicitly hid (always in overflow with "Show" icon)
  const visibleNavigationItems = allNavigationItems.filter((item) => !tabPreferences.hiddenTabs.includes(item.key));
  const hiddenNavigationItems = allNavigationItems.filter((item) => tabPreferences.hiddenTabs.includes(item.key));

  // Responsive tab layout hook
  const { visibleItems, overflowItems, hasOverflow, itemRefs, containerRef } = useResponsiveTabLayout({
    visibleNavigationItems,
    hiddenNavigationItems,
    isActive,
  });

  // Redirect to default tab when navigating to project root
  useEffect(() => {
    const projectRootPath = `/${workspaceSlug}/projects/${projectId}`;
    const isProjectRoot = pathname === projectRootPath || pathname === `${projectRootPath}/`;

    if (isProjectRoot && allNavigationItems.length > 0) {
      const availableTabKeys = allNavigationItems.map((item) => item.key);
      const resolvedTabKey = resolveDefaultTabKey(tabPreferences.defaultTab, availableTabKeys);
      navigate(getTabUrl(workspaceSlug, projectId, resolvedTabKey), { replace: true });
    }
  }, [pathname, workspaceSlug, projectId, tabPreferences.defaultTab, allNavigationItems, navigate]);

  if (allNavigationItems.length === 0) return null;

  // Permission checks
  const isAdmin = allowPermissions(
    [EUserPermissions.ADMIN],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug.toString(),
    project?.id
  );

  const isAuthorized = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug.toString(),
    project?.id
  );

  return (
    <>
      <PublishProjectModal isOpen={publishModalOpen} projectId={projectId} onClose={() => handlePublishModal(false)} />
      {project ? (
        <LeaveProjectModal
          project={project}
          isOpen={leaveProjectModalOpen}
          onClose={() => handleLeaveProjectModal(false)}
        />
      ) : null}
      {project ? (
        <DuplicateProjectModal
          isOpen={duplicateProjectModalOpen}
          project={project}
          workspaceSlug={workspaceSlug}
          onClose={() => setDuplicateProjectModalOpen(false)}
        />
      ) : null}

      {/* container for the tab navigation */}
      <div className="flex size-full items-center gap-3 overflow-hidden">
        <div className="flex shrink-0 items-center gap-2">
          <ProjectHeader workspaceSlug={workspaceSlug} projectId={projectId} />
          {project ? (
            <div className="shrink-0">
              <ProjectActionsMenu
                workspaceSlug={workspaceSlug}
                project={project}
                isAdmin={isAdmin}
                isAuthorized={isAuthorized}
                onCopyText={handleCopyText}
                onLeaveProject={handleLeaveProject}
                onPublishModal={() => handlePublishModal(true)}
                onDuplicateProject={() => setDuplicateProjectModalOpen(true)}
              />
            </div>
          ) : null}
        </div>

        <div className="h-5 w-1 shrink-0 border-l border-subtle" />

        <div ref={containerRef} className="flex h-full min-w-0 flex-1 items-center overflow-hidden">
          <TabNavigationList className="h-full">
            {/* Render visible tab items */}
            {visibleItems.map((item) => {
              const itemIsActive = isActive(item);
              const originalIndex = allNavigationItems.indexOf(item);

              return (
                <TabNavigationVisibleItem
                  key={item.key}
                  item={item}
                  isActive={itemIsActive}
                  tabPreferences={tabPreferences}
                  onToggleDefault={handleToggleDefaultTab}
                  onHide={handleHideTab}
                  itemRef={(el) => {
                    itemRefs.current[originalIndex] = el;
                  }}
                />
              );
            })}

            {/* Render overflow menu if needed */}
            {hasOverflow ? (
              <TabNavigationOverflowMenu
                overflowItems={overflowItems}
                isActive={isActive}
                tabPreferences={tabPreferences}
                onToggleDefault={handleToggleDefaultTab}
                onShow={handleShowTab}
              />
            ) : null}
          </TabNavigationList>

          {hasOverflow ? (
            <div className="pointer-events-none absolute -z-10 opacity-0">
              {visibleNavigationItems.map((item) => {
                const itemIsActive = isActive(item);
                const originalIndex = allNavigationItems.indexOf(item);
                return (
                  <div
                    key={`measure-hidden-${item.key}`}
                    ref={(el) => {
                      itemRefs.current[originalIndex] = el;
                    }}
                    className="inline-block"
                  >
                    <Link to={item.href}>
                      <TabNavigationItem isActive={itemIsActive}>
                        <TabNavigationItemContent item={item} />
                      </TabNavigationItem>
                    </Link>
                  </div>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </>
  );
});
