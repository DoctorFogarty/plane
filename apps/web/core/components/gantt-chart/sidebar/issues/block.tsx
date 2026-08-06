/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
// plane imports
import { ChevronRightIcon, PlusIcon } from "@plane/propel/icons";
import { Tooltip } from "@plane/propel/tooltip";
import type { IGanttBlock } from "@plane/types";
import { Row } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { MultipleSelectEntityAction } from "@/components/core/multiple-select";
import { IssueGanttSidebarBlock } from "@/components/issues/issue-layouts/gantt/blocks";
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useTimeLineChartStore } from "@/hooks/use-timeline-chart";
// local imports
import { BLOCK_HEIGHT, GANTT_SELECT_GROUP } from "../../constants";

type Props = {
  block: IGanttBlock;
  enableSelection: boolean;
  isDragging: boolean;
  selectionHelpers?: TSelectionHelper;
  isEpic?: boolean;
  nestingLevel?: number;
  subIssuesCount?: number;
  isExpanded?: boolean;
  onToggleExpand?: () => void;
  onAddChild?: () => void;
};

export const IssuesSidebarBlock = observer(function IssuesSidebarBlock(props: Props) {
  const {
    block,
    enableSelection,
    isDragging,
    selectionHelpers,
    isEpic = false,
    nestingLevel = 0,
    subIssuesCount = 0,
    isExpanded = false,
    onToggleExpand,
    onAddChild,
  } = props;
  // store hooks
  const { updateActiveBlockId, isBlockActive, getNumberOfDaysFromPosition } = useTimeLineChartStore();
  const { getIsIssuePeeked } = useIssueDetail();

  const isBlockComplete = !!block?.start_date && !!block?.target_date;
  const duration = isBlockComplete ? getNumberOfDaysFromPosition(block?.position?.width) : undefined;

  if (!block?.data) return null;

  const isIssueSelected = selectionHelpers?.getIsEntitySelected(block.id);
  const isIssueFocused = selectionHelpers?.getIsEntityActive(block.id);
  const isBlockHoveredOn = isBlockActive(block.id);

  return (
    <div
      className={cn("group/list-block", {
        "rounded-sm bg-layer-1": isDragging,
        "rounded-l-sm border border-r-0 border-accent-strong": getIsIssuePeeked(block.data.id),
        "border border-r-0 border-strong-1": isIssueFocused,
      })}
      onMouseEnter={() => updateActiveBlockId(block.id)}
      onMouseLeave={() => updateActiveBlockId(null)}
    >
      <Row
        className={cn(
          "group flex w-full items-center gap-2 bg-layer-transparent pr-4 hover:bg-layer-transparent-hover",
          {
            "bg-layer-transparent-hover": isBlockHoveredOn,
            "bg-accent-primary/5 hover:bg-accent-primary/10": isIssueSelected,
            "bg-accent-primary/10": isIssueSelected && isBlockHoveredOn,
          }
        )}
        style={{
          height: `${BLOCK_HEIGHT}px`,
        }}
      >
        {enableSelection && selectionHelpers && (
          <div className="absolute left-1 flex items-center gap-2">
            <MultipleSelectEntityAction
              className={cn(
                "pointer-events-none opacity-0 transition-opacity group-hover/list-block:pointer-events-auto group-hover/list-block:opacity-100",
                {
                  "pointer-events-auto opacity-100": isIssueSelected,
                }
              )}
              groupId={GANTT_SELECT_GROUP}
              id={block.id}
              selectionHelpers={selectionHelpers}
            />
          </div>
        )}
        <div
          className="flex h-full flex-grow items-center justify-between gap-2 truncate"
          style={nestingLevel > 0 ? { paddingLeft: `${nestingLevel * 12}px` } : undefined}
        >
          <div className="flex min-w-0 flex-grow items-center gap-1 truncate">
            <div className="grid size-4 flex-shrink-0 place-items-center">
              {subIssuesCount > 0 && (
                <button
                  type="button"
                  aria-label={isExpanded ? "Collapse sub-work items" : "Expand sub-work items"}
                  className="grid size-4 place-items-center rounded-xs text-placeholder hover:text-tertiary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onToggleExpand?.();
                  }}
                >
                  <ChevronRightIcon
                    className={cn("size-4", {
                      "rotate-90": isExpanded,
                    })}
                    strokeWidth={2.5}
                  />
                </button>
              )}
            </div>
            <div className="min-w-0 flex-grow truncate">
              <IssueGanttSidebarBlock issueId={block.data.id} isEpic={isEpic} />
            </div>
            {nestingLevel < 3 && (
              <Tooltip tooltipContent="Add child" position="top" renderByDefault={false}>
                <button
                  type="button"
                  aria-label="Add child"
                  className="hidden size-5 flex-shrink-0 place-items-center rounded-xs text-placeholder group-hover/list-block:grid hover:bg-layer-1 hover:text-tertiary"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAddChild?.();
                  }}
                >
                  <PlusIcon className="size-3.5" />
                </button>
              </Tooltip>
            )}
          </div>
          {duration && (
            <div className="flex-shrink-0 text-13 text-secondary">
              <span>
                {duration} day{duration > 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
      </Row>
    </div>
  );
});
