/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useLocation } from "react-router";
import { ISSUE_LAYOUT_MAP, getIssueLayoutFromPathSlug, getIssueLayoutSlugFromPathname } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EIssueLayoutTypes } from "@plane/types";
import { PageHead } from "@/components/core/page-title";
import { useProject } from "@/hooks/store/use-project";
import type { Route } from "./+types/page";

function ProjectIssuesPage({ params }: Route.ComponentProps) {
  const { projectId } = params;
  const { pathname } = useLocation();
  const { t } = useTranslation();
  const { getProjectById } = useProject();

  const project = getProjectById(projectId);
  const layout = getIssueLayoutFromPathSlug(getIssueLayoutSlugFromPathname(pathname)) ?? EIssueLayoutTypes.LIST;
  const pageTitle = project?.name ? `${project.name} - ${t(ISSUE_LAYOUT_MAP[layout].i18n_label)}` : undefined;

  return <PageHead title={pageTitle} />;
}

export default observer(ProjectIssuesPage);
