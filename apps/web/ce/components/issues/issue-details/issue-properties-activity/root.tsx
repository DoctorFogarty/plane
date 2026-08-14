/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { ListChecks } from "lucide-react";
import type { TIssueProperty } from "@plane/types";
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useMember } from "@/hooks/store/use-member";
import { IssueActivityBlockComponent } from "@/components/issues/issue-detail/issue-activity/activity/actions";
import { formatIssuePropertyDisplayValue } from "@/plane-web/components/issues/issue-properties/format-property-value";

type TIssueAdditionalPropertiesActivity = {
  activityId: string;
  ends: "top" | "bottom" | undefined;
};

export const IssueAdditionalPropertiesActivity = observer(function IssueAdditionalPropertiesActivity(
  props: TIssueAdditionalPropertiesActivity
) {
  const { activityId, ends } = props;
  const {
    activity: { getActivityById },
  } = useIssueDetail();
  const issueTypeStore = useIssueType();
  const { getUserDetails } = useMember();
  const activity = getActivityById(activityId);
  if (!activity) return <></>;

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
        updated <span className="font-medium text-primary">{activity.field}</span>
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
