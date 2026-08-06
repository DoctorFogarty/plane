/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState, type CSSProperties } from "react";
import { observer } from "mobx-react";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { PlusIcon } from "@plane/propel/icons";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IState, IStateGroup, TStateGroups, TStateOperationsCallbacks } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
// components
import { GroupItem } from "@/components/project-states";

type TGroupList = {
  groups: IStateGroup[];
  groupedStates: Record<string, IState[]>;
  stateOperationsCallbacks: TStateOperationsCallbacks;
  isEditable: boolean;
  shouldTrackEvents: boolean;
  groupListClassName?: string;
  groupItemClassName?: string;
  stateItemClassName?: string;
};

export const GroupList = observer(function GroupList(props: TGroupList) {
  const {
    groups,
    groupedStates,
    stateOperationsCallbacks,
    isEditable,
    shouldTrackEvents,
    groupListClassName,
    groupItemClassName,
    stateItemClassName,
  } = props;
  const { t } = useTranslation();
  const [isCreatingGroup, setIsCreatingGroup] = useState(false);
  const [newGroupCategory, setNewGroupCategory] = useState<TStateGroups>("started");
  const [newGroupName, setNewGroupName] = useState("");

  const handleCreateGroup = async () => {
    if (!stateOperationsCallbacks.createGroup || !newGroupName.trim()) return;
    setIsCreatingGroup(true);
    try {
      await stateOperationsCallbacks.createGroup({
        name: newGroupName.trim(),
        category: newGroupCategory,
        color: STATE_GROUPS[newGroupCategory].color,
      });
      setNewGroupName("");
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: "Success!",
        message: t("project_settings.states.group_created"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: "Error!",
        message: t("project_settings.states.group_create_failed"),
      });
    } finally {
      setIsCreatingGroup(false);
    }
  };

  return (
    <div
      className={cn("workflow-rail space-y-4", groupListClassName)}
      style={
        {
          "--rail-ink": "#1C1F24",
          "--rail-page": "#F2F4F6",
          "--rail-accent": "#2F6FED",
        } as CSSProperties
      }
    >
      <div className="overflow-x-auto pb-2">
        <div className="flex min-w-min flex-col gap-3 md:flex-row md:items-stretch md:gap-0">
          {groups.map((group, index) => (
            <div key={group.id} className="flex md:min-w-[220px] md:flex-1">
              <GroupItem
                group={group}
                groups={groups}
                states={groupedStates[group.id] || []}
                groupedStates={groupedStates}
                stateOperationsCallbacks={stateOperationsCallbacks}
                isEditable={isEditable}
                shouldTrackEvents={shouldTrackEvents}
                groupItemClassName={groupItemClassName}
                stateItemClassName={stateItemClassName}
                isFirst={index === 0}
                isLast={index === groups.length - 1}
              />
              {index < groups.length - 1 && (
                <div aria-hidden className="mx-0 hidden w-px shrink-0 self-stretch bg-[var(--rail-ink)]/10 md:block" />
              )}
            </div>
          ))}
        </div>
      </div>

      {isEditable && (
        <div className="flex flex-col gap-2 rounded-md border border-[var(--rail-ink)]/10 bg-[var(--rail-page)] p-3 sm:flex-row sm:items-end">
          <div className="flex-1 space-y-1">
            <label className="text-12 font-medium text-[var(--rail-ink)]/70">
              {t("project_settings.states.add_group")}
            </label>
            <input
              type="text"
              value={newGroupName}
              onChange={(e) => setNewGroupName(e.target.value)}
              placeholder={t("project_settings.states.group_name_placeholder")}
              className="w-full rounded-sm border border-[var(--rail-ink)]/15 bg-white px-3 py-2 text-14 text-[var(--rail-ink)] outline-none focus:border-[var(--rail-accent)]"
              maxLength={100}
            />
          </div>
          <div className="w-full space-y-1 sm:w-44">
            <label className="text-12 font-medium text-[var(--rail-ink)]/70">
              {t("project_settings.states.category")}
            </label>
            <CustomSelect
              value={newGroupCategory}
              label={STATE_GROUPS[newGroupCategory].label}
              onChange={(val: TStateGroups) => setNewGroupCategory(val)}
              buttonClassName="w-full"
            >
              {Object.values(STATE_GROUPS).map((g) => (
                <CustomSelect.Option key={g.key} value={g.key}>
                  {g.label}
                </CustomSelect.Option>
              ))}
            </CustomSelect>
          </div>
          <button
            type="button"
            disabled={isCreatingGroup || !newGroupName.trim()}
            onClick={handleCreateGroup}
            className="inline-flex h-9 items-center justify-center gap-1.5 rounded-sm bg-[var(--rail-accent)] px-3 text-13 font-medium text-white transition-opacity disabled:opacity-40"
          >
            <PlusIcon className="size-3.5" />
            {t("project_settings.states.add_group")}
          </button>
        </div>
      )}
    </div>
  );
});
