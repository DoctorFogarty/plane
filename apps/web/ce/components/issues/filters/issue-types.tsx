/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { useIssueType } from "@/hooks/store/use-issue-type";

type Props = {
  appliedFilters: string[] | null;
  handleUpdate: (val: string) => void;
  searchQuery: string;
};

export const FilterIssueTypes = observer(function FilterIssueTypes(props: Props) {
  const { appliedFilters, handleUpdate, searchQuery } = props;
  const { workspaceSlug, projectId } = useParams();
  const issueTypeStore = useIssueType();

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!issueTypeStore.fetchedMap[projectId.toString()]) {
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug.toString(), projectId.toString());
    }
  }, [workspaceSlug, projectId, issueTypeStore]);

  if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId.toString())) return null;

  const types = issueTypeStore
    .getActiveProjectIssueTypes(projectId.toString())
    .filter((type) => type.name.toLowerCase().includes(searchQuery.toLowerCase()));

  if (!types.length) return null;

  const appliedFilterSet = new Set(appliedFilters ?? []);

  return (
    <div className="space-y-1">
      {types.map((type) => {
        const isSelected = appliedFilterSet.has(type.id);
        return (
          <button
            key={type.id}
            type="button"
            onClick={() => handleUpdate(type.id)}
            className={`text-xs flex w-full items-center rounded px-2 py-1 text-left ${
              isSelected
                ? "bg-custom-background-80 text-custom-text-100"
                : "text-custom-text-200 hover:bg-custom-background-80"
            }`}
          >
            {type.name}
          </button>
        );
      })}
    </div>
  );
});
