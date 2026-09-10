/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Logo } from "@plane/propel/emoji-icon-picker";
import { ProjectIcon } from "@plane/propel/icons";
// plane imports
import type { ICustomSearchSelectOption } from "@plane/types";
import { BreadcrumbNavigationSearchDropdown, Breadcrumbs } from "@plane/ui";
import { SwitcherLabel } from "@/components/common/switcher-label";
// hooks
import { useProjectSwitchHref } from "@/components/navigation/use-project-switch-href";
import { useProject } from "@/hooks/store/use-project";
import { useAppRouter } from "@/hooks/use-app-router";
import type { TProject } from "@plane/types";

type TProjectBreadcrumbProps = {
  workspaceSlug: string;
  projectId: string;
  handleOnClick?: () => void;
};

function renderProjectIcon(projectDetails: TProject) {
  return (
    <span className="grid size-4 flex-shrink-0 place-items-center">
      <Logo logo={projectDetails.logo_props} size={14} />
    </span>
  );
}

export const ProjectBreadcrumb = observer(function ProjectBreadcrumb(props: TProjectBreadcrumbProps) {
  const { workspaceSlug, projectId, handleOnClick } = props;
  // router
  const router = useAppRouter();
  // store hooks
  const { joinedProjectIds, getPartialProjectById } = useProject();
  const getProjectHref = useProjectSwitchHref(workspaceSlug);
  const currentProjectDetails = getPartialProjectById(projectId);

  if (!currentProjectDetails) return null;

  const switcherOptions = joinedProjectIds
    .map((joinedProjectId) => {
      const project = getPartialProjectById(joinedProjectId);
      return {
        value: joinedProjectId,
        query: project?.name,
        content: (
          <SwitcherLabel
            name={project?.name}
            logo_props={project?.logo_props}
            LabelIcon={ProjectIcon}
            type="material"
          />
        ),
      };
    })
    .filter((option) => option !== undefined) as ICustomSearchSelectOption[];

  return (
    <>
      <Breadcrumbs.Item
        component={
          <BreadcrumbNavigationSearchDropdown
            selectedItem={currentProjectDetails.id}
            navigationItems={switcherOptions}
            onChange={(value: string) => {
              router.push(getProjectHref(value));
            }}
            title={currentProjectDetails?.name}
            icon={renderProjectIcon(currentProjectDetails)}
            handleOnClick={() => {
              if (handleOnClick) handleOnClick();
              else router.push(getProjectHref(currentProjectDetails.id));
            }}
            shouldTruncate
          />
        }
        showSeparator={false}
      />
    </>
  );
});
