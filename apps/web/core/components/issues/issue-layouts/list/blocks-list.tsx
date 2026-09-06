/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { MutableRefObject } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
// components
import type { TIssue, IIssueDisplayProperties } from "@plane/types";
// hooks
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
// types
import { IssueBlockRoot } from "./block-root";
import type { TRenderQuickActions } from "./list-view-types";

const LIST_ROW_ESTIMATE_PX = 52;
const LIST_VIRTUALIZE_AFTER = 20;

interface Props {
  issueIds: string[] | undefined;
  groupId: string;
  canEditProperties: (projectId: string | undefined) => boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  quickActions: TRenderQuickActions;
  displayProperties: IIssueDisplayProperties | undefined;
  containerRef: MutableRefObject<HTMLDivElement | null>;
  isDragAllowed: boolean;
  canDropOverIssue: boolean;
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
}

export function IssueBlocksList(props: Props) {
  const {
    issueIds,
    groupId,
    updateIssue,
    quickActions,
    displayProperties,
    canEditProperties,
    containerRef,
    selectionHelpers,
    isDragAllowed,
    canDropOverIssue,
    isEpic = false,
  } = props;

  const ids: string[] = issueIds ?? [];
  const shouldVirtualize = ids.length > LIST_VIRTUALIZE_AFTER;

  const virtualizer = useVirtualizer({
    count: ids.length,
    getScrollElement: () => containerRef.current,
    estimateSize: () => LIST_ROW_ESTIMATE_PX,
    overscan: 10,
    enabled: shouldVirtualize,
  });

  if (ids.length === 0) {
    return <div className="relative h-full w-full" />;
  }

  const renderBlock = (issueId: string, index: number, shouldRenderByDefault?: boolean) => (
    <IssueBlockRoot
      key={issueId}
      issueId={issueId}
      updateIssue={updateIssue}
      quickActions={quickActions}
      canEditProperties={canEditProperties}
      displayProperties={displayProperties}
      containerRef={containerRef}
      selectionHelpers={selectionHelpers}
      groupId={groupId}
      isLastChild={index === ids.length - 1}
      isDragAllowed={isDragAllowed}
      canDropOverIssue={canDropOverIssue}
      shouldRenderByDefault={shouldRenderByDefault}
      isEpic={isEpic}
    />
  );

  if (!shouldVirtualize) {
    return <div className="relative h-full w-full">{ids.map((issueId, index) => renderBlock(issueId, index))}</div>;
  }

  const virtualItems = virtualizer.getVirtualItems();
  const paddingTop = virtualItems.length > 0 ? virtualItems[0].start : 0;
  const paddingBottom =
    virtualItems.length > 0 ? virtualizer.getTotalSize() - virtualItems[virtualItems.length - 1].end : 0;

  return (
    <div className="relative h-full w-full">
      {paddingTop > 0 && <div style={{ height: paddingTop }} />}
      {virtualItems.map((virtualRow) => {
        const issueId = ids[virtualRow.index];
        return (
          <div key={issueId} data-index={virtualRow.index} ref={virtualizer.measureElement}>
            {renderBlock(issueId, virtualRow.index, true)}
          </div>
        );
      })}
      {paddingBottom > 0 && <div style={{ height: paddingBottom }} />}
    </div>
  );
}
