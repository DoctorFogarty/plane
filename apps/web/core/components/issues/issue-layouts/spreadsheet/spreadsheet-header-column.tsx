/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useRef } from "react";
//types
import { observer } from "mobx-react";
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  TIssueDisplayPropertyKey,
  TSpreadsheetColumnKey,
} from "@plane/types";
import { isCustomPropertyColumnKey, parseCustomPropertyColumnKey } from "@plane/utils";
//components
import { shouldRenderColumn } from "@/helpers/issue-filter.helper";
import { SpreadsheetCustomPropertyHeader } from "@/plane-web/components/issues/issue-layouts/spreadsheet-custom-property-header";
import { WithDisplayPropertiesHOC } from "../properties/with-display-properties-HOC";
import { HeaderColumn } from "./columns/header-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  property: TSpreadsheetColumnKey;
  isEstimateEnabled: boolean;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  isEpic?: boolean;
}
export const SpreadsheetHeaderColumn = observer(function SpreadsheetHeaderColumn(props: Props) {
  const { displayProperties, displayFilters, property, handleDisplayFilterUpdate, isEpic = false } = props;

  //hooks
  const tableHeaderCellRef = useRef<HTMLTableCellElement | null>(null);

  if (isCustomPropertyColumnKey(property)) {
    const propertyId = parseCustomPropertyColumnKey(property);
    if (!propertyId) return null;
    return (
      <th
        className="h-11 min-w-36 items-center border border-t-0 border-b-0 border-subtle bg-layer-1 py-1 text-13 font-medium"
        ref={tableHeaderCellRef}
        tabIndex={0}
      >
        <SpreadsheetCustomPropertyHeader propertyId={propertyId} />
      </th>
    );
  }

  const systemProperty = property as TIssueDisplayPropertyKey;
  const shouldRenderProperty = shouldRenderColumn(systemProperty);

  return (
    <WithDisplayPropertiesHOC
      displayProperties={displayProperties}
      displayPropertyKey={systemProperty}
      shouldRenderProperty={() => shouldRenderProperty}
    >
      <th
        className="h-11 min-w-36 items-center border border-t-0 border-b-0 border-subtle bg-layer-1 py-1 text-13 font-medium"
        ref={tableHeaderCellRef}
        tabIndex={0}
      >
        <HeaderColumn
          displayFilters={displayFilters}
          handleDisplayFilterUpdate={handleDisplayFilterUpdate}
          property={systemProperty}
          onClose={() => {
            tableHeaderCellRef?.current?.focus();
          }}
          isEpic={isEpic}
        />
      </th>
    </WithDisplayPropertiesHOC>
  );
});
