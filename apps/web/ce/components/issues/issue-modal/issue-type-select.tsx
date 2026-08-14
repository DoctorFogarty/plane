/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import type { MutableRefObject, ReactElement } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import { Controller } from "react-hook-form";
import type { Control } from "react-hook-form";
import type { EditorRefApi } from "@plane/editor";
import type { TBulkIssueProperties, TIssue } from "@plane/types";
import { CustomSelect } from "@plane/ui";
import { useIssueModal } from "@/hooks/context/use-issue-modal";
import { useIssueType } from "@/hooks/store/use-issue-type";

export type TIssueFields = TIssue & TBulkIssueProperties;

export type TIssueTypeDropdownVariant = "xs" | "sm";

export type TIssueTypeSelectProps<T extends Partial<TIssueFields>> = {
  control: Control<T>;
  projectId: string | null;
  editorRef?: MutableRefObject<EditorRefApi | null>;
  disabled?: boolean;
  variant?: TIssueTypeDropdownVariant;
  placeholder?: string;
  isRequired?: boolean;
  renderChevron?: boolean;
  dropDownContainerClassName?: string;
  showMandatoryFieldInfo?: boolean;
  handleFormChange?: () => void;
};

function IssueTypeSelectComponent<T extends Partial<TIssueFields>>(props: TIssueTypeSelectProps<T>) {
  const { control, projectId, disabled, placeholder = "Type", handleFormChange } = props;
  const { workspaceSlug } = useParams();
  const issueTypeStore = useIssueType();
  const { handleIssueTypeChange } = useIssueModal();

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    if (!issueTypeStore.fetchedMap[projectId]) {
      void issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug.toString(), projectId);
    }
  }, [workspaceSlug, projectId, issueTypeStore]);

  if (!projectId || !issueTypeStore.isIssueTypeEnabled(projectId)) return null;

  const types = issueTypeStore.getActiveProjectIssueTypes(projectId);
  if (!types.length) return null;

  return (
    <Controller
      control={control}
      name={"type_id" as any}
      render={({ field: { value, onChange } }) => {
        const selected = types.find((type) => type.id === value);
        return (
          <CustomSelect
            value={value}
            label={selected?.name || placeholder}
            onChange={(val: string) => {
              onChange(val);
              handleIssueTypeChange(projectId, val);
              handleFormChange?.();
            }}
            disabled={disabled}
            maxHeight="lg"
            buttonClassName="text-xs"
          >
            {types.map((type) => (
              <CustomSelect.Option key={type.id} value={type.id}>
                {type.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        );
      }}
    />
  );
}

export const IssueTypeSelect = observer(IssueTypeSelectComponent) as <T extends Partial<TIssueFields>>(
  props: TIssueTypeSelectProps<T>
) => ReactElement | null;
