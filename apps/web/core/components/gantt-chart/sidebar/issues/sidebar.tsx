/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { RefObject } from "react";
import { useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
// ui
import { GANTT_TIMELINE_TYPE, EIssueServiceType, EIssuesStoreType } from "@plane/types";
import type { IBlockUpdateData, TIssue } from "@plane/types";
import { Loader } from "@plane/ui";
// components
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { canNestUnder } from "@/components/issues/issue-layouts/hierarchy.helpers";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { GanttLayoutListItemLoader } from "@/components/ui/loader/layouts/gantt-layout-loader";
//hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useProject } from "@/hooks/store/use-project";
import { useIntersectionObserver } from "@/hooks/use-intersection-observer";
import { useIssuesStore } from "@/hooks/use-issue-layout-store";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { useIssuesActions } from "@/hooks/use-issues-actions";
// local imports
import { useTimeLineChart } from "../../../../hooks/use-timeline-chart";
import { GanttDnDHOC } from "../gantt-dnd-HOC";
import { handleOrderChange } from "../utils";
import { IssuesSidebarBlock } from "./block";

type Props = {
  blockUpdateHandler: (block: any, payload: IBlockUpdateData) => void;
  canLoadMoreBlocks?: boolean;
  loadMoreBlocks?: () => void;
  ganttContainerRef: RefObject<HTMLDivElement>;
  blockIds: string[];
  enableReorder: boolean;
  enableSelection: boolean;
  showAllBlocks?: boolean;
  selectionHelpers?: TSelectionHelper;
  isEpic?: boolean;
  expandedIds: Set<string>;
  nestingLevels: Record<string, number>;
  onToggleExpand: (blockId: string) => void;
};

export const IssueGanttSidebar = observer(function IssueGanttSidebar(props: Props) {
  const {
    blockUpdateHandler,
    blockIds,
    enableReorder,
    enableSelection,
    loadMoreBlocks,
    canLoadMoreBlocks,
    ganttContainerRef,
    showAllBlocks = false,
    selectionHelpers,
    isEpic = false,
    expandedIds,
    nestingLevels,
    onToggleExpand,
  } = props;

  const { workspaceSlug } = useParams();
  const { getBlockById } = useTimeLineChart(GANTT_TIMELINE_TYPE.ISSUE);
  const {
    issues: { getIssueLoader },
  } = useIssuesStore();
  const { subIssues: subIssuesStore, issue: issueStore } = useIssueDetail(EIssueServiceType.ISSUES);
  const { updateIssue } = useIssuesActions(EIssuesStoreType.PROJECT);
  const { getProjectById } = useProject();
  const { isIssueTypeEnabled } = useIssueType();

  const [intersectionElement, setIntersectionElement] = useState<HTMLDivElement | null>(null);
  const [createChildParentId, setCreateChildParentId] = useState<string | null>(null);

  const isPaginating = !!getIssueLoader();

  useIntersectionObserver(
    ganttContainerRef,
    isPaginating ? null : intersectionElement,
    loadMoreBlocks,
    "100% 0% 100% 0%"
  );

  const handleOnDrop = (
    draggingBlockId: string | undefined,
    droppedBlockId: string | undefined,
    dropAtEndOfList: boolean,
    makeChild?: boolean
  ) => {
    if (makeChild && draggingBlockId && droppedBlockId) {
      const parent = issueStore.getIssueById(droppedBlockId);
      const child = issueStore.getIssueById(draggingBlockId);
      const projectId = child?.project_id;
      if (!projectId || !workspaceSlug) return;
      const projectDetails = getProjectById(projectId);
      const typesEnabled = isIssueTypeEnabled(projectId) || Boolean(projectDetails?.is_issue_type_enabled);
      if (!canNestUnder(parent, child, { typesEnabled })) return;
      const oldParentId = child?.parent_id ?? null;
      void (async () => {
        await updateIssue?.(projectId, draggingBlockId, { parent_id: droppedBlockId });
        if (oldParentId) {
          await subIssuesStore.fetchSubIssues(workspaceSlug.toString(), projectId, oldParentId);
        }
        await subIssuesStore.fetchSubIssues(workspaceSlug.toString(), projectId, droppedBlockId);
        if (!expandedIds.has(droppedBlockId)) onToggleExpand(droppedBlockId);
      })();
      return;
    }
    handleOrderChange(draggingBlockId, droppedBlockId, dropAtEndOfList, blockIds, getBlockById, blockUpdateHandler);
  };

  const createChildIssue = createChildParentId ? issueStore.getIssueById(createChildParentId) : undefined;

  // Allow nest drag even when reorder (manual sort) is disabled
  const isNestDragEnabled = true;

  return (
    <div>
      <CreateUpdateIssueModal
        isOpen={!!createChildParentId}
        onClose={() => setCreateChildParentId(null)}
        data={{
          parent_id: createChildParentId ?? undefined,
          project_id: createChildIssue?.project_id,
        }}
        onSubmit={async () => {
          if (workspaceSlug && createChildIssue?.project_id && createChildParentId) {
            await subIssuesStore.fetchSubIssues(
              workspaceSlug.toString(),
              createChildIssue.project_id,
              createChildParentId
            );
            if (!expandedIds.has(createChildParentId)) onToggleExpand(createChildParentId);
          }
        }}
        storeType={EIssuesStoreType.PROJECT}
      />
      {blockIds ? (
        <>
          {blockIds.map((blockId, index) => {
            const block = getBlockById(blockId);
            const isBlockVisibleOnSidebar = block?.start_date && block?.target_date;
            const nestingLevel = nestingLevels[blockId] ?? 0;

            // hide the block if it doesn't have start and target dates and showAllBlocks is false
            if (!block || (!showAllBlocks && !isBlockVisibleOnSidebar)) return;

            const issue = issueStore.getIssueById(blockId) as TIssue | undefined;
            const subIssuesCount = issue?.sub_issues_count ?? 0;

            return (
              <RenderIfVisible
                key={block.id}
                root={ganttContainerRef}
                horizontalOffset={100}
                verticalOffset={200}
                shouldRecordHeights={false}
                placeholderChildren={<GanttLayoutListItemLoader />}
              >
                <GanttDnDHOC
                  id={block.id}
                  isLastChild={index === blockIds.length - 1}
                  isDragEnabled={enableReorder || isNestDragEnabled}
                  enableReorderOnly={enableReorder}
                  onDrop={handleOnDrop}
                >
                  {(isDragging: boolean) => (
                    <IssuesSidebarBlock
                      block={block}
                      enableSelection={enableSelection}
                      isDragging={isDragging}
                      selectionHelpers={selectionHelpers}
                      isEpic={isEpic}
                      nestingLevel={nestingLevel}
                      subIssuesCount={subIssuesCount}
                      isExpanded={expandedIds.has(blockId)}
                      onToggleExpand={() => onToggleExpand(blockId)}
                      onAddChild={() => setCreateChildParentId(blockId)}
                    />
                  )}
                </GanttDnDHOC>
              </RenderIfVisible>
            );
          })}
          {canLoadMoreBlocks && (
            <div ref={setIntersectionElement} className="p-2">
              <div className="flex h-10 w-full animate-pulse items-center justify-between gap-1.5 rounded-sm bg-layer-1 px-4 py-1.5 md:h-8 md:px-1" />
            </div>
          )}
        </>
      ) : (
        <Loader className="space-y-3 pr-2">
          <Loader.Item height="34px" />
          <Loader.Item height="34px" />
          <Loader.Item height="34px" />
          <Loader.Item height="34px" />
        </Loader>
      )}
    </div>
  );
});
