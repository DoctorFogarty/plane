/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */
/* eslint-disable react/no-array-index-key */

import type { MutableRefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { observer } from "mobx-react";
// plane imports
import type {
  IIssueDisplayFilterOptions,
  IIssueDisplayProperties,
  TIssue,
  TIssueDisplayPropertyKey,
  TSpreadsheetColumnKey,
} from "@plane/types";
// components
import { SpreadsheetIssueRowLoader } from "@/components/ui/loader/layouts/spreadsheet-layout-loader";
// hooks
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useTableKeyboardNavigation } from "@/hooks/use-table-keyboard-navigation";
// local imports
import type { TRenderQuickActions } from "../list/list-view-types";
import { getDisplayPropertiesCount } from "../utils";
import { SpreadsheetIssueRow } from "./issue-row";
import { SpreadsheetHeader } from "./spreadsheet-header";

const SPREADSHEET_ROW_ESTIMATE_PX = 44;
const SPREADSHEET_VIRTUALIZE_AFTER = 30;

type Props = {
  displayProperties: IIssueDisplayProperties;
  displayFilters: IIssueDisplayFilterOptions;
  handleDisplayFilterUpdate: (data: Partial<IIssueDisplayFilterOptions>) => void;
  issueIds: string[];
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  canEditProperties: (projectId: string | undefined) => boolean;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  containerRef: MutableRefObject<HTMLTableElement | null>;
  canLoadMoreIssues: boolean;
  loadMoreIssues: () => void;
  spreadsheetColumnsList: TSpreadsheetColumnKey[];
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
};

export const SpreadsheetTable = observer(function SpreadsheetTable(props: Props) {
  const {
    displayProperties,
    displayFilters,
    handleDisplayFilterUpdate,
    issueIds,
    isEstimateEnabled,
    portalElement,
    quickActions,
    updateIssue,
    canEditProperties,
    canLoadMoreIssues,
    containerRef,
    loadMoreIssues,
    spreadsheetColumnsList,
    selectionHelpers,
    isEpic = false,
  } = props;

  // states
  const isScrolled = useRef(false);
  const [intersectionElement, setIntersectionElement] = useState<HTMLTableSectionElement | null>(null);

  const {
    issues: { getIssueLoader },
  } = useIssuesStore();

  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    const scrollLeft = containerRef.current.scrollLeft;

    const columnShadow = "8px 22px 22px 10px rgba(0, 0, 0, 0.05)"; // shadow for regular columns
    const headerShadow = "8px -22px 22px 10px rgba(0, 0, 0, 0.05)"; // shadow for headers

    //The shadow styles are added this way to avoid re-render of all the rows of table, which could be costly
    if (scrollLeft > 0 !== isScrolled.current) {
      const firstColumns = containerRef.current.querySelectorAll("table tr td:first-child, th:first-child");

      for (let i = 0; i < firstColumns.length; i++) {
        const shadow = i === 0 ? headerShadow : columnShadow;
        if (scrollLeft > 0) {
          (firstColumns[i] as HTMLElement).style.boxShadow = shadow;
        } else {
          (firstColumns[i] as HTMLElement).style.boxShadow = "none";
        }
      }
      isScrolled.current = scrollLeft > 0;
    }
  }, [containerRef]);

  useEffect(() => {
    const currentContainerRef = containerRef.current;

    if (currentContainerRef) currentContainerRef.addEventListener("scroll", handleScroll);

    return () => {
      if (currentContainerRef) currentContainerRef.removeEventListener("scroll", handleScroll);
    };
  }, [handleScroll, containerRef]);

  const isPaginating = !!getIssueLoader();

  useIntersectionObserver(containerRef, isPaginating ? null : intersectionElement, loadMoreIssues, `100% 0% 100% 0%`);

  const handleKeyBoardNavigation = useTableKeyboardNavigation();

  const ignoreFieldsForCounting: TIssueDisplayPropertyKey[] = ["key"];
  if (!isEstimateEnabled) ignoreFieldsForCounting.push("estimate");
  const displayPropertiesCount = getDisplayPropertiesCount(displayProperties, ignoreFieldsForCounting);
  const shouldVirtualize = issueIds.length > SPREADSHEET_VIRTUALIZE_AFTER;

  const virtualizer = useVirtualizer({
    count: issueIds.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => SPREADSHEET_ROW_ESTIMATE_PX,
    overscan: 12,
    enabled: shouldVirtualize,
  });

  const renderRow = (id: string, shouldRenderByDefault?: boolean) => (
    <SpreadsheetIssueRow
      key={id}
      issueId={id}
      displayProperties={displayProperties}
      quickActions={quickActions}
      canEditProperties={canEditProperties}
      nestingLevel={0}
      isEstimateEnabled={isEstimateEnabled}
      updateIssue={updateIssue}
      portalElement={portalElement}
      containerRef={containerRef}
      isScrolled={isScrolled}
      spreadsheetColumnsList={spreadsheetColumnsList}
      selectionHelpers={selectionHelpers}
      shouldRenderByDefault={shouldRenderByDefault}
      isEpic={isEpic}
    />
  );

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = shouldVirtualize && virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    shouldVirtualize && virtualItems.length > 0
      ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end
      : 0;

  return (
    <table className="w-full overflow-y-auto bg-surface-1" onKeyDown={handleKeyBoardNavigation}>
      <SpreadsheetHeader
        displayProperties={displayProperties}
        displayFilters={displayFilters}
        handleDisplayFilterUpdate={handleDisplayFilterUpdate}
        canEditProperties={canEditProperties}
        isEstimateEnabled={isEstimateEnabled}
        spreadsheetColumnsList={spreadsheetColumnsList}
        selectionHelpers={selectionHelpers}
        isEpic={isEpic}
      />
      {paddingTop > 0 && (
        <tbody>
          <tr>
            <td colSpan={100} style={{ height: paddingTop, padding: 0, border: 0 }} />
          </tr>
        </tbody>
      )}
      {shouldVirtualize ? (
        virtualItems.map((virtualRow) => (
          <tbody key={issueIds[virtualRow.index]} data-index={virtualRow.index} ref={virtualizer.measureElement}>
            {renderRow(issueIds[virtualRow.index], true)}
          </tbody>
        ))
      ) : (
        <tbody>{issueIds.map((id) => renderRow(id))}</tbody>
      )}
      {paddingBottom > 0 && (
        <tbody>
          <tr>
            <td colSpan={100} style={{ height: paddingBottom, padding: 0, border: 0 }} />
          </tr>
        </tbody>
      )}
      {canLoadMoreIssues && (
        <tfoot ref={setIntersectionElement}>
          {Array.from({ length: 3 }).map((_, index) => (
            <SpreadsheetIssueRowLoader key={index} columnCount={displayPropertiesCount} />
          ))}
        </tfoot>
      )}
    </table>
  );
});
