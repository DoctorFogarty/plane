/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { GitBranchPlus, GitPullRequest, Link2 } from "lucide-react";
import type { TIssueServiceType } from "@plane/types";
import { Collapsible, CollapsibleButton } from "@plane/ui";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueGithubDevelopment } from "@/plane-web/hooks/use-issue-github-development";
import { connectCodeModalStore } from "@/plane-web/store/connect-code-modal.store";
import { DevelopmentCollapsibleContent } from "./content";

type Props = {
  workspaceSlug: string;
  projectId: string;
  issueId: string;
  disabled?: boolean;
  issueServiceType: TIssueServiceType;
};

export const DevelopmentCollapsible = observer(function DevelopmentCollapsible(props: Props) {
  const { workspaceSlug, projectId, issueId, disabled = false, issueServiceType } = props;
  const { openWidgets, toggleOpenWidget } = useIssueDetail(issueServiceType);
  const isOpen = openWidgets.includes("development");

  const { data } = useIssueGithubDevelopment(workspaceSlug, projectId, issueId, isOpen);

  const branchCount = data?.branches?.length ?? 0;
  const prCount = data?.pull_requests?.length ?? 0;

  return (
    <Collapsible
      isOpen={isOpen}
      onToggle={() => toggleOpenWidget("development")}
      title={
        <CollapsibleButton
          isOpen={isOpen}
          title="Development"
          indicatorElement={
            <span className="flex items-center gap-1 text-14 !leading-3 text-tertiary">
              {branchCount > 0 || prCount > 0 ? (
                <>
                  {branchCount} branch{branchCount === 1 ? "" : "es"}
                  {prCount > 0 ? ` · ${prCount} PR${prCount === 1 ? "" : "s"}` : ""}
                </>
              ) : (
                "0"
              )}
            </span>
          }
          actionItemElement={
            !disabled ? (
              <span className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    connectCodeModalStore.open(issueId, "link_branch");
                  }}
                  title="Link branch or pull request"
                >
                  <Link2 className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    connectCodeModalStore.open(issueId, "create_branch");
                  }}
                  title="Create branch"
                >
                  <GitBranchPlus className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    connectCodeModalStore.open(issueId, "create_pull_request");
                  }}
                  title="Create pull request"
                >
                  <GitPullRequest className="h-4 w-4" />
                </button>
              </span>
            ) : undefined
          }
        />
      }
      buttonClassName="w-full"
    >
      <DevelopmentCollapsibleContent
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        issueId={issueId}
        disabled={disabled}
      />
    </Collapsible>
  );
});
