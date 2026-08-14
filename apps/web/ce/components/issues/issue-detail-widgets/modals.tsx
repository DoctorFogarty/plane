/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { Suspense, lazy } from "react";
import { observer } from "mobx-react";
import type { TIssueServiceType, TWorkItemWidgets } from "@plane/types";
import {
  useDefaultGithubBranchName,
  useDefaultGithubPullRequestCopy,
} from "@/plane-web/hooks/use-default-github-branch-name";
import {
  EMPTY_GITHUB_BRANCHES,
  EMPTY_GITHUB_REPOSITORIES,
  useIssueGithubDevelopment,
} from "@/plane-web/hooks/use-issue-github-development";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";

const ConnectCodeModal = lazy(() =>
  import("./development/connect-code-modal").then((mod) => ({ default: mod.ConnectCodeModal }))
);

export type TWorkItemAdditionalWidgetModalsProps = {
  hideWidgets: TWorkItemWidgets[];
  issueServiceType: TIssueServiceType;
  projectId: string;
  workItemId: string;
  workspaceSlug: string;
};

export const WorkItemAdditionalWidgetModals = observer(function WorkItemAdditionalWidgetModals(
  props: TWorkItemAdditionalWidgetModalsProps
) {
  const { hideWidgets, issueServiceType, projectId, workItemId, workspaceSlug } = props;
  const { isOpen, mode, workItemId: modalWorkItemId } = connectCodeModalStore;

  const isModalForThisIssue = isOpen && modalWorkItemId === workItemId;
  const defaultBranchName = useDefaultGithubBranchName(issueServiceType, projectId, workItemId);
  const { title: defaultPrTitle, body: defaultPrBody } = useDefaultGithubPullRequestCopy(
    issueServiceType,
    projectId,
    workItemId,
    workspaceSlug
  );

  const { data, isLoading, error } = useIssueGithubDevelopment(
    workspaceSlug,
    projectId,
    workItemId,
    isModalForThisIssue
  );

  if (hideWidgets?.includes("development")) return null;

  return (
    <Suspense fallback={null}>
      <ConnectCodeModal
        isOpen={isModalForThisIssue}
        onClose={() => connectCodeModalStore.close()}
        mode={mode}
        onModeChange={(next) => connectCodeModalStore.setMode(next)}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={workItemId}
        repositories={data?.repositories ?? EMPTY_GITHUB_REPOSITORIES}
        isRepositoriesLoading={isLoading && !data}
        repositoriesError={Boolean(error)}
        defaultBranchName={defaultBranchName}
        linkedBranches={data?.branches ?? EMPTY_GITHUB_BRANCHES}
        defaultPrTitle={defaultPrTitle}
        defaultPrBody={defaultPrBody}
      />
    </Suspense>
  );
});
