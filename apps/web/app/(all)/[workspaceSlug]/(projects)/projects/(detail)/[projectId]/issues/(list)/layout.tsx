/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Outlet } from "react-router";
import { EIssuesStoreType } from "@plane/types";
import { AppHeader } from "@/components/core/app-header";
import { ContentWrapper } from "@/components/core/content-wrapper";
import { IssueCollectionLayoutRoot } from "@/components/issues/issue-layouts/issue-collection-layout-root";
import { ProjectIssuesHeader } from "./header";
import { ProjectIssuesMobileHeader } from "./mobile-header";

export default function ProjectIssuesLayout() {
  return (
    <>
      <AppHeader header={<ProjectIssuesHeader />} mobileHeader={<ProjectIssuesMobileHeader />} />
      <ContentWrapper>
        <div className="h-full w-full">
          <IssueCollectionLayoutRoot storeType={EIssuesStoreType.PROJECT} />
        </div>
        <Outlet />
      </ContentWrapper>
    </>
  );
}
