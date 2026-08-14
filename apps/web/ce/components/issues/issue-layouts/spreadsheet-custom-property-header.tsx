/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Row } from "@plane/ui";
import { useIssueType } from "@/hooks/store/use-issue-type";

type Props = {
  propertyId: string;
};

export const SpreadsheetCustomPropertyHeader = observer(function SpreadsheetCustomPropertyHeader(props: Props) {
  const { propertyId } = props;
  const { projectId } = useParams();
  const issueTypeStore = useIssueType();

  const property =
    typeof projectId === "string"
      ? issueTypeStore.getProjectPropertyById(projectId, propertyId)
      : issueTypeStore.getPropertyById(propertyId);
  const propertyName = property?.is_active ? property.name : "Custom property";

  return (
    <Row className="flex w-full items-center justify-between gap-1.5 py-2 text-13 text-secondary">
      <div className="truncate">{propertyName}</div>
    </Row>
  );
});
