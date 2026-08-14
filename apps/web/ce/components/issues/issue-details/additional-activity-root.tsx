/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { GitBranch, GitPullRequest, ListChecks } from "lucide-react";
import type { TIssueProperty } from "@plane/types";
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useMember } from "@/hooks/store/use-member";
import { formatIssuePropertyDisplayValue } from "@/plane-web/components/issues/issue-properties/format-property-value";

export type TAdditionalActivityRoot = {
  activityId: string;
  showIssue?: boolean;
  ends: "top" | "bottom" | undefined;
  field: string | undefined;
};

export const AdditionalActivityRoot = observer(function AdditionalActivityRoot(props: TAdditionalActivityRoot) {
  const { activityId, ends, field } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const issueTypeStore = useIssueType();
  const { getUserDetails } = useMember();
  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  if (field === "github_branch") {
    return (
      <IssueActivityBlockComponent
        activityId={activityId}
        icon={<GitBranch className="text-custom-text-200 h-3.5 w-3.5" />}
        ends={ends}
      >
        <>
          {activity.verb === "deleted" ? "unlinked GitHub branch" : "linked GitHub branch"}{" "}
          <span className="font-medium text-primary">{activity.new_value || activity.old_value}</span>.
        </>
      </IssueActivityBlockComponent>
    );
  }

  if (field === "github_pull_request") {
    return (
      <IssueActivityBlockComponent
        activityId={activityId}
        icon={<GitPullRequest className="text-custom-text-200 h-3.5 w-3.5" />}
        ends={ends}
      >
        <>
          {activity.verb === "deleted" ? "unlinked GitHub pull request" : "linked GitHub pull request"}{" "}
          <span className="font-medium text-primary">{activity.new_value || activity.old_value}</span>.
        </>
      </IssueActivityBlockComponent>
    );
  }

  const property: TIssueProperty | undefined = issueTypeStore.getProjectPropertyById(
    activity.project,
    activity.new_identifier
  );

  const rawValue = activity.new_value;
  const displayValue =
    property && rawValue != null && rawValue !== ""
      ? formatIssuePropertyDisplayValue(property, rawValue, getUserDetails) || rawValue
      : rawValue;

  return (
    <IssueActivityBlockComponent
      activityId={activityId}
      icon={<ListChecks className="text-custom-text-200 h-3.5 w-3.5" />}
      ends={ends}
    >
      <>
        updated <span className="font-medium text-primary">{field || activity.field}</span>
        {displayValue != null && displayValue !== "" ? (
          <>
            {" "}
            to <span className="font-medium text-primary">{displayValue}</span>
          </>
        ) : (
          " (cleared)"
        )}
        .
      </>
    </IssueActivityBlockComponent>
  );
});
