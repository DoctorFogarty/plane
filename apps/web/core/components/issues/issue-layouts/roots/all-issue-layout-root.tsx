/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useLayoutEffect, useMemo } from "react";
import { observer } from "mobx-react";
import { useParams, useSearchParams } from "next/navigation";
import useSWR from "swr";
import { GLOBAL_VIEW_TRACKER_ELEMENTS, ISSUE_DISPLAY_FILTERS_BY_PAGE } from "@plane/constants";
import { EmptyStateDetailed } from "@plane/propel/empty-state";
import { EIssueLayoutTypes, EIssuesStoreType, STATIC_VIEW_TYPES } from "@plane/types";
import { ActiveLoader } from "@/components/issues/issue-layouts/issue-layout-HOC";
import { IssueLayoutShell } from "@/components/issues/issue-layouts/issue-layout-shell";
import { WorkspaceActiveLayout } from "@/components/views/helper";
import { useGlobalView } from "@/hooks/store/use-global-view";
import { useIssues } from "@/hooks/store/use-issues";
import { useAppRouter } from "@/hooks/use-app-router";
import { useWorkspaceIssueProperties } from "@/hooks/use-workspace-issue-properties";

type Props = {
  isDefaultView: boolean;
  isLoading?: boolean;
  toggleLoading: (value: boolean) => void;
};

export const AllIssueLayoutRoot = observer(function AllIssueLayoutRoot(props: Props) {
  const { isDefaultView, isLoading = false, toggleLoading } = props;
  const router = useAppRouter();
  const { workspaceSlug: routerWorkspaceSlug, globalViewId: routerGlobalViewId } = useParams();
  const workspaceSlug = routerWorkspaceSlug ? routerWorkspaceSlug.toString() : undefined;
  const globalViewId = routerGlobalViewId ? routerGlobalViewId.toString() : undefined;
  const searchParams = useSearchParams();
  const {
    issuesFilter: { filters, fetchFilters, hydrateFilters, updateFilterExpression },
    issues: { groupedIssueIds, fetchIssues, fetchNextIssues },
  } = useIssues(EIssuesStoreType.GLOBAL);
  const { fetchAllGlobalViews, getViewDetailsById } = useGlobalView();
  const viewDetails = globalViewId ? getViewDetailsById(globalViewId) : undefined;
  const workItemFilters = globalViewId ? filters?.[globalViewId] : undefined;

  useLayoutEffect(() => {
    if (workspaceSlug && globalViewId) {
      hydrateFilters(workspaceSlug, globalViewId);
    }
  }, [globalViewId, hydrateFilters, workspaceSlug]);

  const activeLayout: EIssueLayoutTypes | undefined = workItemFilters?.displayFilters?.layout;
  const initialWorkItemFilters = useMemo(() => {
    if (!globalViewId) return undefined;
    const isStaticView = STATIC_VIEW_TYPES.includes(globalViewId);
    const hasViewDetails = Boolean(viewDetails);
    if (!isStaticView && !hasViewDetails) return undefined;
    return {
      displayFilters: workItemFilters?.displayFilters,
      displayProperties: workItemFilters?.displayProperties,
      kanbanFilters: workItemFilters?.kanbanFilters,
      richFilters: viewDetails?.rich_filters ?? {},
    };
  }, [globalViewId, viewDetails, workItemFilters]);

  useWorkspaceIssueProperties(workspaceSlug);

  const routeFilters: { [key: string]: string } = {};
  searchParams.forEach((value: string, key: string) => {
    routeFilters[key] = value;
  });

  const fetchNextPages = useCallback(() => {
    if (workspaceSlug && globalViewId) fetchNextIssues(workspaceSlug, globalViewId);
  }, [fetchNextIssues, workspaceSlug, globalViewId]);

  const { isLoading: globalViewsLoading } = useSWR(
    workspaceSlug ? `WORKSPACE_GLOBAL_VIEWS_${workspaceSlug}` : null,
    async () => {
      if (workspaceSlug) {
        await fetchAllGlobalViews(workspaceSlug);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  const { isLoading: issuesLoading } = useSWR(
    workspaceSlug && globalViewId ? `WORKSPACE_GLOBAL_VIEW_ISSUES_${workspaceSlug}_${globalViewId}` : null,
    async () => {
      if (workspaceSlug && globalViewId) {
        toggleLoading(true);
        await fetchFilters(workspaceSlug, globalViewId);
        await fetchIssues(workspaceSlug, globalViewId, groupedIssueIds ? "mutation" : "init-loader", {
          canGroup: false,
          perPageCount: 100,
        });
        toggleLoading(false);
      }
    },
    { revalidateIfStale: false, revalidateOnFocus: false }
  );

  if (!isLoading && !globalViewsLoading && !issuesLoading && !viewDetails && !isDefaultView) {
    return (
      <EmptyStateDetailed
        title="View does not exist"
        description="The view you are looking for does not exist or you don't have permission to view it."
        assetKey="view"
        actions={[
          {
            label: "Go to All work items",
            onClick: () => router.push(`/${workspaceSlug}/workspace-views/all-issues`),
            variant: "primary",
          },
        ]}
      />
    );
  }

  if (!workspaceSlug || !globalViewId || !initialWorkItemFilters) {
    return <ActiveLoader layout={activeLayout ?? EIssueLayoutTypes.SPREADSHEET} />;
  }

  return (
    <IssueLayoutShell
      storeType={EIssuesStoreType.GLOBAL}
      workspaceSlug={workspaceSlug}
      entityId={globalViewId}
      activeLayout={activeLayout}
      workItemFilters={initialWorkItemFilters}
      filtersToShowByLayout={ISSUE_DISPLAY_FILTERS_BY_PAGE.my_issues.filters}
      updateFilters={updateFilterExpression.bind(updateFilterExpression, workspaceSlug, globalViewId)}
      filterScope="workspace"
      enableSaveView
      enableUpdateView
      saveViewLabel="Save as"
      trackerSaveView={GLOBAL_VIEW_TRACKER_ELEMENTS.HEADER_SAVE_VIEW_BUTTON}
      contentClassName="h-full overflow-hidden bg-surface-1"
      content={
        <WorkspaceActiveLayout
          activeLayout={activeLayout}
          isDefaultView={isDefaultView}
          isLoading={isLoading}
          toggleLoading={toggleLoading}
          workspaceSlug={workspaceSlug}
          globalViewId={globalViewId}
          routeFilters={routeFilters}
          fetchNextPages={fetchNextPages}
          globalViewsLoading={globalViewsLoading}
          issuesLoading={issuesLoading}
        />
      }
    />
  );
});
