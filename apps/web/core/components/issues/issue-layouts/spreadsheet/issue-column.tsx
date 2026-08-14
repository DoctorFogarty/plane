/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
import { observer } from "mobx-react";
// types
import type { IIssueDisplayProperties, TIssue, TIssueDisplayPropertyKey, TSpreadsheetColumnKey } from "@plane/types";
import { isCustomPropertyColumnKey, parseCustomPropertyColumnKey } from "@plane/utils";
// components
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { SpreadsheetCustomPropertyColumn } from "@/plane-web/components/issues/issue-layouts/spreadsheet-custom-property-column";
import { SPREADSHEET_COLUMNS } from "@/plane-web/components/issues/issue-layouts/utils";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";

type Props = {
  displayProperties: IIssueDisplayProperties;
  issueDetail: TIssue;
  disableUserActions: boolean;
  property: TSpreadsheetColumnKey;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  isEstimateEnabled: boolean;
};

export const IssueColumn = observer(function IssueColumn(props: Props) {
  const { displayProperties, issueDetail, disableUserActions, property, updateIssue } = props;
  const tableCellRef = useRef<HTMLTableCellElement | null>(null);

  if (isCustomPropertyColumnKey(property)) {
    const propertyId = parseCustomPropertyColumnKey(property);
    if (!propertyId) return null;
    return (
      <td
        tabIndex={0}
        className="h-11 min-w-36 border-r-[1px] border-subtle text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
        ref={tableCellRef}
      >
        <SpreadsheetCustomPropertyColumn
          issue={issueDetail}
          propertyId={propertyId}
          disabled={disableUserActions}
          onClose={() => tableCellRef?.current?.focus()}
        />
      </td>
    );
  }

  const systemProperty = property as TIssueDisplayPropertyKey;
  const shouldRenderProperty = shouldRenderColumn(systemProperty);
  const Column = SPREADSHEET_COLUMNS[systemProperty];

  if (!Column) return null;

  const handleUpdateIssue = async (issue: TIssue, data: Partial<TIssue>) => {
    if (updateIssue) await updateIssue(issue.project_id, issue.id, data);
  };

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={systemProperty}
      shouldRenderProperty={() => shouldRenderProperty}
    >
      <td
        tabIndex={0}
        className="h-11 min-w-36 border-r-[1px] border-subtle text-13 after:absolute after:bottom-[-1px] after:w-full after:border after:border-subtle"
        ref={tableCellRef}
      >
        <Column
          issue={issueDetail}
          onChange={handleUpdateIssue}
          disabled={disableUserActions}
          onClose={() => tableCellRef?.current?.focus()}
        />
      </td>
    </WithDisplayPropertiesHOC>
  );
});
