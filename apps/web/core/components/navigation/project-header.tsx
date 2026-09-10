/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { startTransition, useCallback, useMemo } from "react";
import { observer } from "mobx-react";
// plane imports
import { ProjectIcon } from "@plane/propel/icons";
import type { ICustomSearchSelectOption } from "@plane/types";
import { CustomSearchSelect } from "@plane/ui";
// hooks
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import { SwitcherLabel } from "../common/switcher-label";
import { ProjectHeaderButton } from "./project-header-button";
import { usePrefetchProject } from "./use-prefetch-project";
import { useProjectSwitchHref } from "./use-project-switch-href";

type TProjectHeaderProps = {
  workspaceSlug: string;
  projectId: string;
};

export const ProjectHeader = observer(function ProjectHeader(props: TProjectHeaderProps) {
  const { workspaceSlug, projectId } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const getProjectHref = useProjectSwitchHref(workspaceSlug);
  const prefetchProject = usePrefetchProject(workspaceSlug);

  const currentProjectDetails = getPartialProjectById(projectId);

  // Memoize switcher options to prevent recalculation on every render
  const switcherOptions = useMemo<ICustomSearchSelectOption[]>(
    () =>
      joinedProjectIds
        .map((id): ICustomSearchSelectOption | null => {
          const project = getPartialProjectById(id);
          if (!project) return null;

          return {
            value: id,
            query: project.name,
            content: (
              <SwitcherLabel
                name={project.name}
                logo_props={project.logo_props}
                LabelIcon={ProjectIcon}
                type="material"
              />
            ),
          };
        })
        .filter((option): option is ICustomSearchSelectOption => option !== null),
    [joinedProjectIds, getPartialProjectById]
  );

  // Memoize onChange handler
  const handleProjectChange = useCallback(
    (value: string) => {
      if (value === currentProjectDetails?.id) return;
      prefetchProject(value);
      startTransition(() => {
        router.push(getProjectHref(value));
      });
    },
    [currentProjectDetails?.id, getProjectHref, prefetchProject, router]
  );

  // Early return if no project details
  if (!currentProjectDetails) return null;

  return (
    <CustomSearchSelect
      options={switcherOptions}
      value={currentProjectDetails.id}
      onChange={handleProjectChange}
      customButton={currentProjectDetails ? <ProjectHeaderButton project={currentProjectDetails} /> : null}
      className="h-full rounded"
      customButtonClassName="group flex items-center gap-0.5 rounded-sm hover:bg-surface-2 outline-none cursor-pointer h-full"
    />
  );
});
