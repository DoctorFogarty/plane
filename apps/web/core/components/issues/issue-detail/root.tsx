/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { EUserPermissions, EUserPermissionsLevel } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { EIssuesStoreType } from "@plane/types";
import emptyIssue from "@/app/assets/empty-state/issue.svg?url";
import { EmptyState } from "@/components/common/empty-state";
import { useAppTheme } from "@/hooks/store/use-app-theme";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssues } from "@/hooks/store/use-issues";
import { useUserPermissions } from "@/hooks/store/user";
import { useAppRouter } from "@/hooks/use-app-router";
import { createIssueOperations } from "../issue-operations";
import { IssuePeekOverview } from "../peek-overview";
import { WorkItemPropertyEditor } from "../work-item-property-editor";
import { IssueMainContent } from "./main-content";

export type { TIssueOperations } from "../issue-operations";

export type TIssueDetailRoot = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  is_archived?: boolean;
};

export const IssueDetailRoot = observer(function IssueDetailRoot(props: TIssueDetailRoot) {
  const { t } = useTranslation();
  const { workspaceSlug, projectId, issueId, is_archived = false } = props;
  // router
  const router = useAppRouter();
  // hooks
  const {
    issue: { getIssueById },
    fetchIssue,
    updateIssue,
    removeIssue,
    archiveIssue,
    addCycleToIssue,
    addIssueToCycle,
    removeIssueFromCycle,
    changeModulesInIssue,
    removeIssueFromModule,
  } = useIssueDetail();
  const {
    issues: { removeIssue: removeArchivedIssue },
  } = useIssues(EIssuesStoreType.ARCHIVED);
  const { allowPermissions } = useUserPermissions();
  const { issueDetailSidebarCollapsed } = useAppTheme();

  const issueOperations = useMemo(
    () =>
      createIssueOperations({
        t,
        fetchIssue,
        updateIssue,
        removeIssue: is_archived ? removeArchivedIssue : removeIssue,
        archiveIssue,
        addCycleToIssue,
        addIssueToCycle,
        removeIssueFromCycle,
        removeIssueFromModule,
        changeModulesInIssue,
      }),
    [
      addCycleToIssue,
      addIssueToCycle,
      archiveIssue,
      changeModulesInIssue,
      fetchIssue,
      is_archived,
      removeArchivedIssue,
      removeIssue,
      removeIssueFromCycle,
      removeIssueFromModule,
      t,
      updateIssue,
    ]
  );

  // issue details
  const issue = getIssueById(issueId);
  // checking if issue is editable, based on user role
  const isEditable = allowPermissions(
    [EUserPermissions.ADMIN, EUserPermissions.MEMBER],
    EUserPermissionsLevel.PROJECT,
    workspaceSlug,
    projectId
  );

  return (
    <>
      {!issue ? (
        <EmptyState
          image={emptyIssue}
          title={t("issue.empty_state.issue_detail.title")}
          description={t("issue.empty_state.issue_detail.description")}
          primaryButton={{
            text: t("issue.empty_state.issue_detail.primary_button.text"),
            onClick: () => router.push(`/${workspaceSlug}/projects/${projectId}/issues`),
          }}
        />
      ) : (
        <div className="flex h-full w-full overflow-hidden">
          <div className="h-full w-full space-y-6 overflow-y-auto px-9 py-5">
            <IssueMainContent
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              isEditable={isEditable}
              isArchived={is_archived}
            />
          </div>
          <div
            className="fixed right-0 z-[5] h-full w-full min-w-[300px] border-l border-subtle bg-surface-1 sm:w-1/2 md:relative md:w-1/4 lg:min-w-80 xl:min-w-96"
            style={issueDetailSidebarCollapsed ? { right: `-${window?.innerWidth || 0}px` } : {}}
          >
            <WorkItemPropertyEditor
              workspaceSlug={workspaceSlug}
              projectId={projectId}
              issueId={issueId}
              issueOperations={issueOperations}
              disabled={is_archived || !isEditable}
              variant="detail"
            />
          </div>
        </div>
      )}

      {/* peek overview */}
      <IssuePeekOverview />
    </>
  );
});
