/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { IIssueDisplayProperties, TIssue } from "@plane/types";
import { Tooltip } from "@plane/propel/tooltip";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useMember } from "@/hooks/store/use-member";
import { formatIssuePropertyDisplayValue } from "@/plane-web/components/issues/issue-properties/format-property-value";

export type TWorkItemLayoutAdditionalProperties = {
  displayProperties: IIssueDisplayProperties;
  issue: TIssue;
};

export const WorkItemLayoutAdditionalProperties = observer(function WorkItemLayoutAdditionalProperties(
  props: TWorkItemLayoutAdditionalProperties
) {
  const { issue } = props;
  const issueTypeStore = useIssueType();
  const { getUserDetails } = useMember();

  if (!issue.project_id || !issueTypeStore.isIssueTypeEnabled(issue.project_id)) return null;

  const typeId = issue.type_id || issueTypeStore.getDefaultIssueTypeId(issue.project_id);
  if (!typeId) return null;

  const properties = issueTypeStore.getActivePropertiesForType(typeId).slice(0, 3);
  if (!properties.length) return null;

  const values = issueTypeStore.getPropertyValues(issue.id);

  return (
    <div className="flex flex-wrap items-center gap-1">
      {properties.map((property) => {
        const value = values[property.id];
        if (value === null || value === undefined || value === "") return null;
        const display = formatIssuePropertyDisplayValue(property, value, getUserDetails);
        if (!display) return null;
        return (
          <Tooltip key={property.id} tooltipHeading={property.name} tooltipContent={display}>
            <span className="flex h-5 flex-shrink-0 items-center justify-center overflow-hidden rounded-sm border-[0.5px] border-strong px-2.5 py-1 text-caption-sm-regular text-secondary">
              {display}
            </span>
          </Tooltip>
        );
      })}
    </div>
  );
});
