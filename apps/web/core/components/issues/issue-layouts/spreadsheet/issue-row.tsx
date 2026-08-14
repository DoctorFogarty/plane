/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { Dispatch, MouseEvent, MutableRefObject, SetStateAction } from "react";
import { useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachInstruction, extractInstruction } from "@atlaskit/pragmatic-drag-and-drop-hitbox/tree-item";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { MoreHorizontal } from "lucide-react";
import { SPREADSHEET_SELECT_GROUP } from "@plane/constants";
// plane helpers
import { useOutsideClickDetector } from "@plane/hooks";
import { ChevronRightIcon, PlusIcon } from "@plane/propel/icons";
// types
import { Tooltip } from "@plane/propel/tooltip";
import type { IIssueDisplayProperties, TIssue, TSpreadsheetColumnKey } from "@plane/types";
import { EIssueServiceType, EIssuesStoreType } from "@plane/types";
// ui
import { ControlLink, Row } from "@plane/ui";
import { cn, generateWorkItemLink } from "@plane/utils";
// components
import { MultipleSelectEntityAction } from "@/components/core/multiple-select";
import RenderIfVisible from "@/components/core/render-if-visible-HOC";
import { CreateUpdateIssueModal } from "@/components/issues/issue-modal/modal";
import { canNestUnder } from "@/components/issues/issue-layouts/hierarchy.helpers";
// helper
// hooks
import { useIssueDetail } from "@/hooks/store/use-issue-detail";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useIssueById } from "@/hooks/store/use-issues";
import { useProject } from "@/hooks/store/use-project";
import useIssuePeekOverviewRedirection from "@/hooks/use-issue-peek-overview-redirection";
import type { TSelectionHelper } from "@/hooks/use-multiple-select";
import { usePlatformOS } from "@/hooks/use-platform-os";
import { useIssuesActions } from "@/hooks/use-issues-actions";
// plane web components
import { IssueIdentifier } from "@/plane-web/components/issues/issue-details/issue-identifier";
// local components
import type { TRenderQuickActions } from "../list/list-view-types";
import { isIssueNew } from "../utils";
import { IssueColumn } from "./issue-column";

interface Props {
  displayProperties: IIssueDisplayProperties;
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  nestingLevel: number;
  issueId: string;
  isScrolled: MutableRefObject<boolean>;
  containerRef: MutableRefObject<HTMLTableElement | null>;
  spreadsheetColumnsList: TSpreadsheetColumnKey[];
  spacingLeft?: number;
  selectionHelpers: TSelectionHelper;
  shouldRenderByDefault?: boolean;
  isEpic?: boolean;
}

export const SpreadsheetIssueRow = observer(function SpreadsheetIssueRow(props: Props) {
  const {
    displayProperties,
    issueId,
    isEstimateEnabled,
    nestingLevel,
    portalElement,
    updateIssue,
    quickActions,
    canEditProperties,
    isScrolled,
    containerRef,
    spreadsheetColumnsList,
    spacingLeft = 6,
    selectionHelpers,
    shouldRenderByDefault,
    isEpic = false,
  } = props;
  // states
  const [isExpanded, setExpanded] = useState<boolean>(false);
  // store hooks
  const { subIssues: subIssuesStore } = useIssueDetail(EIssueServiceType.ISSUES);
  const issue = useIssueById(issueId);
  const subIssues = subIssuesStore.subIssuesByIssueId(issueId);
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issueId);
  const isIssueActive = selectionHelpers.getIsEntityActive(issueId);

  if (!issue) return null;

  return (
    <>
      {/* first column/ issue name and key column */}
      <RenderIfVisible
        as="tr"
        root={containerRef}
        placeholderChildren={
          <td
            colSpan={100}
            className="border-[0.5px] border-transparent border-b-subtle-1"
            style={{ height: "calc(2.75rem - 1px)" }}
          />
        }
        classNames={cn("bg-surface-1 transition-[background-color]", {
          "group selected-issue-row": isIssueSelected,
          "border-[0.5px] border-strong-1": isIssueActive,
        })}
        verticalOffset={100}
        shouldRecordHeights={false}
        defaultValue={shouldRenderByDefault || isIssueNew(issue)}
      >
        <IssueRowDetails
          issueId={issueId}
          displayProperties={displayProperties}
          quickActions={quickActions}
          canEditProperties={canEditProperties}
          nestingLevel={nestingLevel}
          spacingLeft={spacingLeft}
          isEstimateEnabled={isEstimateEnabled}
          updateIssue={updateIssue}
          portalElement={portalElement}
          isScrolled={isScrolled}
          isExpanded={isExpanded}
          setExpanded={setExpanded}
          spreadsheetColumnsList={spreadsheetColumnsList}
          selectionHelpers={selectionHelpers}
          isEpic={isEpic}
        />
      </RenderIfVisible>

      {isExpanded &&
        subIssues?.map((subIssueId: string) => (
          <SpreadsheetIssueRow
            key={subIssueId}
            issueId={subIssueId}
            displayProperties={displayProperties}
            quickActions={quickActions}
            canEditProperties={canEditProperties}
            nestingLevel={nestingLevel + 1}
            spacingLeft={spacingLeft + 12}
            isEstimateEnabled={isEstimateEnabled}
            updateIssue={updateIssue}
            portalElement={portalElement}
            isScrolled={isScrolled}
            containerRef={containerRef}
            spreadsheetColumnsList={spreadsheetColumnsList}
            selectionHelpers={selectionHelpers}
            shouldRenderByDefault={isExpanded}
            isEpic={isEpic}
          />
        ))}
    </>
  );
});

interface IssueRowDetailsProps {
  displayProperties: IIssueDisplayProperties;
  isEstimateEnabled: boolean;
  quickActions: TRenderQuickActions;
  canEditProperties: (projectId: string | undefined) => boolean;
  updateIssue: ((projectId: string | null, issueId: string, data: Partial<TIssue>) => Promise<void>) | undefined;
  portalElement: React.MutableRefObject<HTMLDivElement | null>;
  nestingLevel: number;
  issueId: string;
  isScrolled: MutableRefObject<boolean>;
  isExpanded: boolean;
  setExpanded: Dispatch<SetStateAction<boolean>>;
  spreadsheetColumnsList: TSpreadsheetColumnKey[];
  spacingLeft?: number;
  selectionHelpers: TSelectionHelper;
  isEpic?: boolean;
}

const IssueRowDetails = observer(function IssueRowDetails(props: IssueRowDetailsProps) {
  const {
    displayProperties,
    issueId,
    isEstimateEnabled,
    nestingLevel,
    portalElement,
    updateIssue,
    quickActions,
    canEditProperties,
    isScrolled,
    isExpanded,
    setExpanded,
    spreadsheetColumnsList,
    spacingLeft = 6,
    selectionHelpers,
    isEpic = false,
  } = props;
  // states
  const [isMenuActive, setIsMenuActive] = useState(false);
  const [isCreateChildModalOpen, setIsCreateChildModalOpen] = useState(false);
  const [dropInstruction, setDropInstruction] = useState<"MAKE_CHILD" | undefined>(undefined);
  // refs
  const cellRef = useRef<HTMLTableCellElement | null>(null);
  const menuActionRef = useRef<HTMLButtonElement | null>(null);
  // router
  const { workspaceSlug, projectId } = useParams();
  // hooks
  const { getProjectIdentifierById, getProjectById } = useProject();
  const { getIsIssuePeeked, peekIssue } = useIssueDetail(EIssueServiceType.ISSUES);
  const { handleRedirection } = useIssuePeekOverviewRedirection(isEpic);
  const { isMobile } = usePlatformOS();
  const { isIssueTypeEnabled } = useIssueType();
  const { updateIssue: updateIssueAction } = useIssuesActions(EIssuesStoreType.PROJECT);

  // handlers
  const handleIssuePeekOverview = (issue: TIssue) =>
    handleRedirection(workspaceSlug?.toString(), issue, isMobile, nestingLevel);

  const { subIssues: subIssuesStore, issue } = useIssueDetail(EIssueServiceType.ISSUES);

  const issueDetail = issue.getIssueById(issueId);

  const subIssueIndentation = `${spacingLeft}px`;
  const isSubIssue = nestingLevel !== 0;
  const canEditRow = issueDetail ? canEditProperties(issueDetail.project_id ?? undefined) : false;

  useOutsideClickDetector(menuActionRef, () => setIsMenuActive(false));

  // Drag-to-nest on title cell (root rows only)
  useEffect(() => {
    const element = cellRef.current;
    if (!element || !issueDetail) return;

    return combine(
      draggable({
        element,
        canDrag: () => canEditRow && !isSubIssue && !issueDetail.is_epic,
        getInitialData: () => ({ id: issueId, type: "ISSUE", dragInstanceId: "SPREADSHEET_NEST" }),
      }),
      dropTargetForElements({
        element,
        canDrop: ({ source }) =>
          source?.data?.id !== issueId &&
          source?.data?.dragInstanceId === "SPREADSHEET_NEST" &&
          !isSubIssue &&
          canEditRow,
        getData: ({ input, element: el }) =>
          attachInstruction(
            { id: issueId, type: "ISSUE" },
            {
              input,
              element: el,
              currentLevel: 0,
              indentPerLevel: 0,
              mode: "standard",
              block: ["reorder-above", "reorder-below"],
            }
          ),
        onDrag: ({ self }) => {
          const instruction = extractInstruction(self?.data)?.type;
          setDropInstruction(instruction === "make-child" ? "MAKE_CHILD" : undefined);
        },
        onDragLeave: () => setDropInstruction(undefined),
        onDrop: ({ source }) => {
          setDropInstruction(undefined);
          const sourceId = source?.data?.id as string | undefined;
          if (!sourceId || !workspaceSlug || !issueDetail.project_id) return;
          const parent = issue.getIssueById(issueId);
          const child = issue.getIssueById(sourceId);
          const projectDetails = getProjectById(issueDetail.project_id);
          const typesEnabled =
            isIssueTypeEnabled(issueDetail.project_id) || Boolean(projectDetails?.is_issue_type_enabled);
          if (!canNestUnder(parent, child, { typesEnabled })) return;
          const oldParentId = child?.parent_id ?? null;
          void (async () => {
            await updateIssueAction?.(issueDetail.project_id, sourceId, { parent_id: issueId });
            if (oldParentId) {
              await subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issueDetail.project_id!, oldParentId);
            }
            await subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issueDetail.project_id!, issueId);
            setExpanded(true);
          })();
        },
      })
    );
  }, [
    issueId,
    isSubIssue,
    issueDetail,
    canEditRow,
    workspaceSlug,
    getProjectById,
    isIssueTypeEnabled,
    updateIssueAction,
    issue,
    subIssuesStore,
    setExpanded,
  ]);

  const customActionButton = (
    <button
      type="button"
      ref={menuActionRef}
      aria-label="Open work item actions"
      className={`flex h-full w-full cursor-pointer items-center rounded-sm p-1 text-placeholder hover:bg-layer-1 ${
        isMenuActive ? "bg-layer-1 text-primary" : "text-secondary"
      }`}
      onClick={() => setIsMenuActive(!isMenuActive)}
    >
      <MoreHorizontal className="h-3.5 w-3.5" />
    </button>
  );
  if (!issueDetail) return null;

  const handleToggleExpand = (e: MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    if (nestingLevel >= 3) {
      handleIssuePeekOverview(issueDetail);
    } else {
      setExpanded((prevState) => {
        if (!prevState && workspaceSlug && issueDetail && issueDetail.project_id)
          subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issueDetail.project_id, issueDetail.id);
        return !prevState;
      });
    }
  };

  const disableUserActions = !canEditProperties(issueDetail.project_id ?? undefined);
  const subIssuesCount = issueDetail?.sub_issues_count ?? 0;
  const isIssueSelected = selectionHelpers.getIsEntitySelected(issueDetail.id);
  const projectIdentifier = getProjectIdentifierById(issueDetail.project_id);

  const canSelectIssues = !disableUserActions && !selectionHelpers.isSelectionDisabled;

  const workItemLink = generateWorkItemLink({
    workspaceSlug: workspaceSlug?.toString(),
    projectId: issueDetail?.project_id,
    issueId,
    projectIdentifier,
    sequenceId: issueDetail?.sequence_id,
    isEpic,
  });

  return (
    <>
      <CreateUpdateIssueModal
        isOpen={isCreateChildModalOpen}
        onClose={() => setIsCreateChildModalOpen(false)}
        data={{
          parent_id: issueId,
          project_id: issueDetail.project_id,
        }}
        onSubmit={async () => {
          if (workspaceSlug && issueDetail.project_id) {
            await subIssuesStore.fetchSubIssues(workspaceSlug.toString(), issueDetail.project_id, issueId);
            setExpanded(true);
          }
        }}
        storeType={EIssuesStoreType.PROJECT}
      />
      {/* Single sticky column containing both identifier and workitem */}
      <td
        id={`issue-${issueId}`}
        ref={cellRef}
        tabIndex={0}
        className={cn("group/list-block relative left-0 z-10 max-w-lg bg-surface-1 md:sticky", {
          "ring-2 ring-accent-strong/40 ring-inset": dropInstruction === "MAKE_CHILD",
        })}
      >
        <ControlLink
          href={workItemLink}
          onClick={() => handleIssuePeekOverview(issueDetail)}
          className="outline-none"
          disabled={!!issueDetail?.tempId}
        >
          <Row
            className={cn(
              "group clickable z-10 flex h-11 w-full cursor-pointer items-center gap-2 border-r-[0.5px] border-subtle-1 bg-transparent text-13 group-[.selected-issue-row]:bg-accent-primary/5 after:absolute group-[.selected-issue-row]:hover:bg-accent-primary/10",
              {
                "border-b-[0.5px]": !getIsIssuePeeked(issueDetail.id),
                "border border-accent-strong hover:border-accent-strong":
                  getIsIssuePeeked(issueDetail.id) && nestingLevel === peekIssue?.nestingLevel,
                "shadow-[8px_22px_22px_10px_rgba(0,0,0,0.05)]": isScrolled.current,
              }
            )}
          >
            {/* sub issues indentation */}
            {nestingLevel !== 0 && <div style={{ width: subIssueIndentation }} />}

            {/* sub-issues chevron */}
            <div className="grid size-4 flex-shrink-0 place-items-center">
              {subIssuesCount > 0 && (
                <button
                  type="button"
                  aria-label={isExpanded ? "Collapse sub-work items" : "Expand sub-work items"}
                  className="grid size-4 place-items-center rounded-xs text-placeholder hover:text-tertiary"
                  onClick={handleToggleExpand}
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

            {/* Identifier section - conditionally rendered */}
            {displayProperties?.key && (
              <div className="flex h-full min-w-24 flex-shrink-0 items-center">
                <div className="relative flex cursor-pointer items-center text-11 hover:text-primary">
                  {issueDetail.project_id && (
                    <IssueIdentifier
                      issueId={issueDetail.id}
                      projectId={issueDetail.project_id}
                      size="xs"
                      variant="tertiary"
                      displayProperties={displayProperties}
                    />
                  )}
                </div>
              </div>
            )}

            {/* Workitem section */}
            <div
              className={cn("flex flex-grow items-center gap-0.5 py-2", {
                "min-w-[360px]": !displayProperties?.key,
                "min-w-60": displayProperties?.key,
              })}
            >
              {/* select checkbox */}
              {projectId && canSelectIssues && (
                <Tooltip
                  tooltipContent={
                    <>
                      Only work items within the current
                      <br />
                      project can be selected.
                    </>
                  }
                  disabled={issueDetail.project_id === projectId}
                >
                  <div className="absolute left-1 mr-1 grid w-3.5 flex-shrink-0 place-items-center">
                    <MultipleSelectEntityAction
                      className={cn(
                        "pointer-events-none opacity-0 transition-opacity group-hover/list-block:pointer-events-auto group-hover/list-block:opacity-100",
                        {
                          "pointer-events-auto opacity-100": isIssueSelected,
                        }
                      )}
                      groupId={SPREADSHEET_SELECT_GROUP}
                      id={issueDetail.id}
                      selectionHelpers={selectionHelpers}
                      disabled={issueDetail.project_id !== projectId}
                    />
                  </div>
                </Tooltip>
              )}

              <div className="my-auto flex h-full w-full items-center justify-between gap-2 truncate">
                <div className="line-clamp-1 flex w-full items-center gap-1 text-14 text-primary">
                  <div className="w-full overflow-hidden">
                    <Tooltip tooltipContent={issueDetail.name} isMobile={isMobile}>
                      <div
                        className="h-full w-full cursor-pointer truncate pr-1 text-left text-13 text-primary focus:outline-none"
                        tabIndex={-1}
                      >
                        {issueDetail.name}
                      </div>
                    </Tooltip>
                  </div>
                  {!disableUserActions && nestingLevel < 3 && (
                    <Tooltip tooltipContent="Add child" position="top" renderByDefault={false}>
                      <button
                        type="button"
                        aria-label="Add child"
                        className="hidden size-5 flex-shrink-0 place-items-center rounded-xs text-placeholder group-hover/list-block:grid hover:bg-layer-1 hover:text-tertiary"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setIsCreateChildModalOpen(true);
                          if (!isExpanded && workspaceSlug && issueDetail.project_id) {
                            setExpanded(true);
                            subIssuesStore.fetchSubIssues(
                              workspaceSlug.toString(),
                              issueDetail.project_id,
                              issueDetail.id
                            );
                          }
                        }}
                      >
                        <PlusIcon className="size-3.5" />
                      </button>
                    </Tooltip>
                  )}
                </div>
                <div
                  className={`opacity-0 transition-opacity group-hover:opacity-100 ${isMenuActive ? "!opacity-100" : ""}`}
                  onClick={(e) => e.stopPropagation()}
                >
                  {quickActions({
                    issue: issueDetail,
                    parentRef: cellRef,
                    customActionButton,
                    portalElement: portalElement.current,
                  })}
                </div>
              </div>
            </div>
          </Row>
        </ControlLink>
      </td>
      {/* Rest of the columns */}
      {spreadsheetColumnsList.map((property) => (
        <IssueColumn
          key={property}
          displayProperties={displayProperties}
          issueDetail={issueDetail}
          disableUserActions={disableUserActions}
          property={property}
          updateIssue={updateIssue}
          isEstimateEnabled={isEstimateEnabled}
        />
      ))}
    </>
  );
});
