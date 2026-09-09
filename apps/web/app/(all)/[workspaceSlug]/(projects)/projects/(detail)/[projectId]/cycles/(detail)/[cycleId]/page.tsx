/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import useSWR from "swr";
import { EIssuesStoreType } from "@plane/types";
import { cn } from "@plane/utils";
import emptyCycle from "@/app/assets/empty-state/cycle.svg?url";
import { EmptyState } from "@/components/common/empty-state";
import { PageHead } from "@/components/core/page-title";
import useCyclesDetails from "@/components/cycles/active-cycle/use-cycles-details";
import { CycleDetailsSidebar } from "@/components/cycles/analytics-sidebar";
import { IssueCollectionLayoutRoot } from "@/components/issues/issue-layouts/issue-collection-layout-root";
import { useCycle } from "@/hooks/store/use-cycle";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import useLocalStorage from "@/hooks/use-local-storage";
import type { Route } from "./+types/page";

function CycleDetailPage({ params }: Route.ComponentProps) {
  const router = useAppRouter();
  const { workspaceSlug, projectId, cycleId } = params;
  const { fetchCycleDetails, getCycleById } = useCycle();
  const { getProjectById } = useProject();
  const { setValue, storedValue } = useLocalStorage("cycle_sidebar_collapsed", false);

  const { error } = useSWR(`CURRENT_CYCLE_DETAILS_${cycleId}`, () =>
    fetchCycleDetails(workspaceSlug, projectId, cycleId)
  );

  useCyclesDetails({
    workspaceSlug,
    projectId,
    cycleId,
  });

  const isSidebarCollapsed = storedValue === true;
  const cycle = getCycleById(cycleId);
  const project = getProjectById(projectId);
  const pageTitle = project?.name && cycle?.name ? `${project?.name} - ${cycle?.name}` : undefined;

  const toggleSidebar = () => setValue(!isSidebarCollapsed);

  return (
    <>
      <PageHead title={pageTitle} />
      {error ? (
        <EmptyState
          image={emptyCycle}
          title="Cycle does not exist"
          description="The cycle you are looking for does not exist or has been deleted."
          primaryButton={{
            text: "View other cycles",
            onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/cycles`),
          }}
        />
      ) : (
        <div className="flex h-full w-full">
          <div className="h-full w-full overflow-hidden">
            <IssueCollectionLayoutRoot storeType={EIssuesStoreType.CYCLE} />
          </div>
          {!isSidebarCollapsed && (
            <div
              className={cn(
                "vertical-scrollbar absolute right-0 z-13 flex scrollbar-sm h-full w-[21.5rem] flex-shrink-0 flex-col gap-3.5 overflow-y-auto border-l border-subtle bg-surface-1 px-4 shadow-raised-200 duration-300"
              )}
            >
              <CycleDetailsSidebar
                handleClose={toggleSidebar}
                cycleId={cycleId}
                projectId={projectId}
                workspaceSlug={workspaceSlug}
              />
            </div>
          )}
        </div>
      )}
    </>
  );
}

export default observer(CycleDetailPage);
