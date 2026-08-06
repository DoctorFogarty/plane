/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useState } from "react";
import { observer } from "mobx-react";
// plane imports
import { STATE_GROUPS } from "@plane/constants";
import { StateGroupIcon } from "@plane/propel/icons";
import type { TStateGroups } from "@plane/types";
// components
import { FilterHeader, FilterOption } from "@/components/issues/issue-layouts/filters";
import { useProjectState } from "@/hooks/store/use-project-state";

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string) => void;
  searchQuery: string;
};

export const FilterStateGroup = observer(function FilterStateGroup(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery } = props;
  const { projectStateGroups } = useProjectState();

  const [itemsToRender, setItemsToRender] = useState(5);
  const [previewEnabled, setPreviewEnabled] = useState(true);

  const appliedFiltersCount = appliedFilters?.length ?? 0;

  // Prefer custom group display names (first group per category) while filter values stay as categories
  const categoryLabels = new Map<TStateGroups, { label: string; color?: string }>();
  if (projectStateGroups) {
    for (const group of projectStateGroups) {
      if (!categoryLabels.has(group.category)) {
        categoryLabels.set(group.category, { label: group.name, color: group.color });
      }
    }
  }

  const filteredOptions = Object.values(STATE_GROUPS)
    .map((s) => ({
      key: s.key,
      label: categoryLabels.get(s.key)?.label || s.label,
      color: categoryLabels.get(s.key)?.color,
    }))
    .filter(
      (s) => s.key.includes(searchQuery.toLowerCase()) || s.label.toLowerCase().includes(searchQuery.toLowerCase())
    );

  const handleViewToggle = () => {
    if (!filteredOptions) return;

    if (itemsToRender === filteredOptions.length) setItemsToRender(5);
    else setItemsToRender(filteredOptions.length);
  };

  return (
    <>
      <FilterHeader
        title={`State group${appliedFiltersCount > 0 ? ` (${appliedFiltersCount})` : ""}`}
        isPreviewEnabled={previewEnabled}
        handleIsPreviewEnabled={() => setPreviewEnabled(!previewEnabled)}
      />
      {previewEnabled && (
        <div>
          {filteredOptions.length > 0 ? (
            <>
              {filteredOptions.slice(0, itemsToRender).map((stateGroup) => (
                <FilterOption
                  key={stateGroup.key}
                  isChecked={appliedFilters?.includes(stateGroup.key) ? true : false}
                  onClick={() => handleUpdate(stateGroup.key)}
                  icon={<StateGroupIcon stateGroup={stateGroup.key} color={stateGroup.color} />}
                  title={stateGroup.label}
                />
              ))}
              {filteredOptions.length > 5 && (
                <button
                  type="button"
                  className="ml-8 text-11 font-medium text-accent-primary"
                  onClick={handleViewToggle}
                >
                  {itemsToRender === filteredOptions.length ? "View less" : "View all"}
                </button>
              )}
            </>
          ) : (
            <p className="text-11 text-placeholder italic">No matches found</p>
          )}
        </div>
      )}
    </>
  );
});
