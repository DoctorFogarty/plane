/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { combine } from "@atlaskit/pragmatic-drag-and-drop/combine";
import { draggable, dropTargetForElements } from "@atlaskit/pragmatic-drag-and-drop/element/adapter";
import { attachClosestEdge, extractClosestEdge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/closest-edge";
import { observer } from "mobx-react";
// plane imports
import type { TGroupDraggableData } from "@plane/constants";
import { EIconSize, STATE_GROUPS, STATE_TRACKER_ELEMENTS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { GripVertical } from "lucide-react";
import { PlusIcon, StateGroupIcon, CloseIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, IStateGroup, TStateOperationsCallbacks } from "@plane/types";
import { DropIndicator } from "@plane/ui";
import { cn, getCurrentGroupSequence } from "@plane/utils";
// components
import { StateList, StateCreate } from "@/components/project-states";

type TGroupItem = {
  group: IStateGroup;
  groups: IStateGroup[];
  groupedStates: Record<string, IState[]>;
  states: IState[];
  stateOperationsCallbacks: TStateOperationsCallbacks;
  isEditable: boolean;
  shouldTrackEvents: boolean;
  groupItemClassName?: string;
  stateItemClassName?: string;
  isFirst?: boolean;
  isLast?: boolean;
};

export const GroupItem = observer(function GroupItem(props: TGroupItem) {
  const {
    group,
    groups,
    groupedStates,
    states,
    isEditable,
    stateOperationsCallbacks,
    shouldTrackEvents,
    groupItemClassName,
    stateItemClassName,
  } = props;
  const dropElementRef = useRef<HTMLDivElement | null>(null);
  const { t } = useTranslation();
  const [createState, setCreateState] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState(group.name);
  const [isDragging, setIsDragging] = useState(false);
  const [isDraggedOver, setIsDraggedOver] = useState(false);
  const [closestEdge, setClosestEdge] = useState<string | null>(null);

  const categoryMeta = STATE_GROUPS[group.category];

  const handleGroupSequence = useCallback(
    async (groupId: string, sequence: number) => {
      if (!stateOperationsCallbacks.moveGroupPosition) return;
      await stateOperationsCallbacks.moveGroupPosition(groupId, { sequence });
    },
    [stateOperationsCallbacks]
  );

  useEffect(() => {
    const elementRef = dropElementRef.current;
    if (!elementRef || !isEditable) return;

    const initialData: TGroupDraggableData = { id: group.id, category: group.category };

    return combine(
      draggable({
        element: elementRef,
        getInitialData: () => ({ ...initialData, type: "STATE_GROUP" }),
        onDragStart: () => setIsDragging(true),
        onDrop: () => setIsDragging(false),
        canDrag: () => isEditable,
      }),
      dropTargetForElements({
        element: elementRef,
        canDrop: ({ source }) => source.data.type === "STATE_GROUP",
        getData: ({ input, element }) =>
          attachClosestEdge(
            { ...initialData, type: "STATE_GROUP" },
            {
              input,
              element,
              allowedEdges: ["left", "right", "top", "bottom"],
            }
          ),
        onDragEnter: (args) => {
          setIsDraggedOver(true);
          setClosestEdge(extractClosestEdge(args.self.data));
        },
        onDrag: (args) => {
          setClosestEdge(extractClosestEdge(args.self.data));
        },
        onDragLeave: () => {
          setIsDraggedOver(false);
          setClosestEdge(null);
        },
        onDrop: (data) => {
          setIsDraggedOver(false);
          setClosestEdge(null);
          const sourceData = data.source.data as TGroupDraggableData & { type?: string };
          if (!sourceData?.id || sourceData.id === group.id) return;
          const edge = extractClosestEdge(data.self.data) || undefined;
          const sequence = getCurrentGroupSequence(groups, group.id, edge);
          if (sequence !== undefined) {
            handleGroupSequence(sourceData.id, sequence);
          }
        },
      })
    );
  }, [group.id, group.category, groups, handleGroupSequence, isEditable]);

  const saveName = async () => {
    if (!stateOperationsCallbacks.updateGroup || !nameDraft.trim() || nameDraft.trim() === group.name) {
      setIsEditingName(false);
      setNameDraft(group.name);
      return;
    }
    try {
      await stateOperationsCallbacks.updateGroup(group.id, { name: nameDraft.trim() });
      setIsEditingName(false);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("project_settings.states.group_update_failed"),
      });
      setNameDraft(group.name);
      setIsEditingName(false);
    }
  };

  const handleDeleteGroup = async () => {
    if (!stateOperationsCallbacks.deleteGroup) return;
    try {
      await stateOperationsCallbacks.deleteGroup(group.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("project_settings.states.group_deleted"),
      });
    } catch (error) {
      const err = error as { error?: string };
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: err?.error || t("project_settings.states.group_delete_failed"),
      });
    }
  };

  const showLeft = isDraggedOver && (closestEdge === "left" || closestEdge === "top");
  const showRight = isDraggedOver && (closestEdge === "right" || closestEdge === "bottom");

  return (
    <div className="relative flex w-full flex-col md:flex-row">
      <DropIndicator isVisible={showLeft} classNames="md:h-auto md:w-0.5" />
      <div
        ref={dropElementRef}
        className={cn(
          "flex w-full flex-col gap-2 rounded-md border border-[var(--rail-ink)]/10 bg-white p-2.5 transition-opacity",
          isDragging && "opacity-50",
          isEditable && "cursor-grab",
          groupItemClassName
        )}
      >
        <div className="flex items-center gap-1.5">
          {isEditable && <GripVertical className="size-3.5 shrink-0 text-[var(--rail-ink)]/35" />}
          <div className="flex size-5 shrink-0 items-center justify-center">
            <StateGroupIcon stateGroup={group.category} color={group.color} size={EIconSize.LG} />
          </div>
          {isEditingName && isEditable ? (
            <input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => {
                if (e.key === "Enter") saveName();
                if (e.key === "Escape") {
                  setNameDraft(group.name);
                  setIsEditingName(false);
                }
              }}
              className="min-w-0 flex-1 rounded-sm border border-[var(--rail-accent)] bg-white px-1.5 py-0.5 text-13 font-semibold text-[var(--rail-ink)] outline-none"
            />
          ) : (
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-13 font-semibold text-[var(--rail-ink)]"
              onClick={() => isEditable && setIsEditingName(true)}
              disabled={!isEditable}
            >
              {group.name}
            </button>
          )}
          <span
            className="shrink-0 rounded-sm px-1.5 py-0.5 text-11 font-medium capitalize"
            style={{
              backgroundColor: `${categoryMeta?.color || group.color}22`,
              color: "var(--rail-ink)",
            }}
          >
            {categoryMeta?.label || group.category}
          </span>
          {isEditable && !group.is_system && states.length === 0 && (
            <button
              type="button"
              onClick={handleDeleteGroup}
              className="hover:bg-red-50 hover:text-red-600 flex size-6 shrink-0 items-center justify-center rounded-sm text-[var(--rail-ink)]/40"
              title="Delete"
            >
              <CloseIcon className="size-3.5" />
            </button>
          )}
          <button
            type="button"
            data-ph-element={STATE_TRACKER_ELEMENTS.STATE_GROUP_ADD_BUTTON}
            className={cn(
              "flex size-6 shrink-0 items-center justify-center rounded-sm text-[var(--rail-accent)] transition-colors hover:bg-[var(--rail-accent)]/10",
              (!isEditable || createState) && "cursor-not-allowed opacity-40"
            )}
            onClick={() => {
              if (!createState) setCreateState(true);
            }}
            disabled={!isEditable || createState}
          >
            <PlusIcon className="size-3.5" />
          </button>
        </div>

        {states.length === 0 && !createState && (
          <div className="py-3 text-center text-12 text-[var(--rail-ink)]/45">
            {t("project_settings.states.empty_state.title", { groupKey: group.name })}
          </div>
        )}

        <div className="space-y-1">
          <StateList
            groupKey={group.category}
            groupId={group.id}
            groups={groups}
            groupedStates={groupedStates}
            states={states}
            disabled={!isEditable}
            stateOperationsCallbacks={stateOperationsCallbacks}
            shouldTrackEvents={shouldTrackEvents}
            stateItemClassName={stateItemClassName}
          />
        </div>

        {isEditable && createState && (
          <StateCreate
            groupKey={group.category}
            groupId={group.id}
            handleClose={() => setCreateState(false)}
            createStateCallback={stateOperationsCallbacks.createState}
            shouldTrackEvents={shouldTrackEvents}
          />
        )}
      </div>
      <DropIndicator isVisible={showRight} classNames="md:h-auto md:w-0.5" />
    </div>
  );
});
