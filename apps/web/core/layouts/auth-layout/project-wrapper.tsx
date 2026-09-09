/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import { useLocation } from "react-router";
import useSWR from "swr";
// plane imports
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { GANTT_TIMELINE_TYPE } from "@plane/types";
// components
import { ProjectAccessRestriction } from "@/components/auth-screens/project/project-access-restriction";
import { LogoSpinner } from "@/components/common/logo-spinner";
import {
  PROJECT_DETAILS,
  PROJECT_ME_INFORMATION,
  PROJECT_LABELS,
  PROJECT_MEMBERS,
  PROJECT_MEMBER_PREFERENCES,
  PROJECT_STATES,
  PROJECT_ESTIMATES,
  PROJECT_ALL_CYCLES,
  PROJECT_MODULES,
  PROJECT_VIEWS,
  PROJECT_INTAKE_STATE,
} from "@plane/constants";
// hooks
import { useProjectEstimates } from "@/hooks/store/estimates";
import { useCycle } from "@/hooks/store/use-cycle";
import { useLabel } from "@/hooks/store/use-label";
import { useMember } from "@/hooks/store/use-member";
import { useModule } from "@/hooks/store/use-module";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { useProjectView } from "@/hooks/store/use-project-view";
import { useUser, useUserPermissions } from "@/hooks/store/user";
import { useTimeLineChart } from "@/hooks/use-timeline-chart";
import { runIdleTask } from "@/lib/idle-task";

interface IProjectAuthWrapper {
  workspaceSlug: string;
  projectId: string;
  children: ReactNode;
  isLoading?: boolean;
}

export const ProjectAuthWrapper = observer(function ProjectAuthWrapper(props: IProjectAuthWrapper) {
  const { workspaceSlug, projectId, children, isLoading: isParentLoading = false } = props;
  // states
  const [isJoiningProject, setIsJoiningProject] = useState(false);
  const [loadDeferredMeta, setLoadDeferredMeta] = useState(false);
  // store hooks
  const { fetchUserProjectInfo, allowPermissions, getProjectRoleByWorkspaceSlugAndProjectId } = useUserPermissions();
  const { fetchProjectDetails, getProjectById } = useProject();
  const { joinProject } = useUserPermissions();
  const { fetchAllCycles } = useCycle();
  const { fetchModulesSlim, fetchModules } = useModule();
  const { initGantt } = useTimeLineChart(GANTT_TIMELINE_TYPE.MODULE);
  const { pathname } = useLocation();
  const isTimelineRoute = pathname.includes("/timeline") || pathname.includes("/gantt");
  const { fetchViews } = useProjectView();
  const {
    project: { fetchProjectMembers, fetchProjectUserProperties },
  } = useMember();
  const { fetchProjectStates, fetchProjectIntakeState } = useProjectState();
  const { data: currentUserData } = useUser();
  const { fetchProjectLabels } = useLabel();
  const { getProjectEstimates } = useProjectEstimates();
  // derived values
  const hasPermissionToCurrentProject = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER, EUserPermissions.GUEST],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );
  const currentProjectRole = getProjectRoleByWorkspaceSlugAndProjectId(workspaceSlug, projectId);
  const hasResolvedProjectRole = currentProjectRole !== undefined && currentProjectRole !== null;
  const cachedProjectDetails = getProjectById(projectId);
  const isWorkspaceAdmin = allowPermissions([EUserPermissions.ADMIN], EUserPermissionsLevel.WORKSPACE, workspaceSlug);
  useEffect(() => {
    if (isTimelineRoute) initGantt();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isTimelineRoute]);

  useEffect(() => {
    const task = runIdleTask(() => setLoadDeferredMeta(true));
    return () => task.cancel();
  }, [projectId]);

  const swrImmutable = { revalidateIfStale: false, revalidateOnFocus: false };

  // fetching project details
  const { isLoading: isProjectDetailsLoading, error: projectDetailsError } = useSWR(
    PROJECT_DETAILS(workspaceSlug, projectId),
    () => fetchProjectDetails(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching user project member information
  useSWR(
    PROJECT_ME_INFORMATION(workspaceSlug, projectId),
    () => fetchUserProjectInfo(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project member preferences
  useSWR(
    currentUserData?.id ? PROJECT_MEMBER_PREFERENCES(projectId, currentProjectRole) : null,
    currentUserData?.id ? () => fetchProjectUserProperties(workspaceSlug, projectId) : null,
    swrImmutable
  );
  // fetching project labels
  useSWR(
    hasResolvedProjectRole ? PROJECT_LABELS(projectId, currentProjectRole) : null,
    () => fetchProjectLabels(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project members
  useSWR(
    hasResolvedProjectRole ? PROJECT_MEMBERS(projectId, currentProjectRole) : null,
    () => fetchProjectMembers(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project states
  useSWR(
    hasResolvedProjectRole ? PROJECT_STATES(projectId, currentProjectRole) : null,
    () => fetchProjectStates(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project intake state
  useSWR(
    loadDeferredMeta && hasResolvedProjectRole ? PROJECT_INTAKE_STATE(projectId, currentProjectRole) : null,
    () => fetchProjectIntakeState(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project estimates
  useSWR(
    loadDeferredMeta && hasResolvedProjectRole ? PROJECT_ESTIMATES(projectId, currentProjectRole) : null,
    () => getProjectEstimates(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project cycles
  useSWR(
    loadDeferredMeta && hasResolvedProjectRole ? PROJECT_ALL_CYCLES(projectId, currentProjectRole) : null,
    () => fetchAllCycles(workspaceSlug, projectId),
    swrImmutable
  );
  // fetching project modules
  useSWR(
    loadDeferredMeta && hasResolvedProjectRole ? PROJECT_MODULES(projectId, currentProjectRole) : null,
    async () => {
      await Promise.all([fetchModulesSlim(workspaceSlug, projectId), fetchModules(workspaceSlug, projectId)]);
    },
    swrImmutable
  );
  // fetching project views
  useSWR(
    loadDeferredMeta && hasResolvedProjectRole ? PROJECT_VIEWS(projectId, currentProjectRole) : null,
    () => fetchViews(workspaceSlug, projectId),
    swrImmutable
  );

  // handle join project
  const handleJoinProject = () => {
    setIsJoiningProject(true);
    joinProject(workspaceSlug, projectId).finally(() => setIsJoiningProject(false));
  };

  const isPermissionDenied = hasResolvedProjectRole && hasPermissionToCurrentProject === false;
  const isProjectLoading =
    (isParentLoading || (!cachedProjectDetails && !hasResolvedProjectRole && isProjectDetailsLoading)) &&
    !projectDetailsError;

  if (isProjectLoading) {
    return (
      <div className="grid h-full place-items-center">
        <LogoSpinner />
      </div>
    );
  }

  if (isPermissionDenied) {
    return (
      <ProjectAccessRestriction
        errorStatusCode={projectDetailsError?.status}
        isWorkspaceAdmin={isWorkspaceAdmin}
        handleJoinProject={handleJoinProject}
        isJoinButtonDisabled={isJoiningProject}
      />
    );
  }

  return <>{children}</>;
});
