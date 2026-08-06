/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { Layers } from "lucide-react";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions";

export type TIssueTypeActivity = { activityId: string; showIssue?: boolean; ends: "top" | "bottom" | undefined };

export const IssueTypeActivity = observer(function IssueTypeActivity(props: TIssueTypeActivity) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const activity = getActivityById(activityId);
  if (!activity) return <></>;

  return (
    <IssueActivityBlockComponent
      activityId={activityId}
      icon={<Layers className="text-custom-text-200 h-3.5 w-3.5" />}
      ends={ends}
    >
      <>
        updated the work item type to <span className="font-medium text-primary">{activity.new_value}</span>
        {activity.old_value ? (
          <>
            {" "}
            from <span className="font-medium text-primary">{activity.old_value}</span>
          </>
        ) : null}
        .
      </>
    </IssueActivityBlockComponent>
  );
});
