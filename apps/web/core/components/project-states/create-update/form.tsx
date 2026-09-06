/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable jsx-a11y/no-autofocus */

import { useState } from "react";
import { TwitterPicker } from "react-color";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { Tooltip } from "@plane/propel/tooltip";
import type { IState, IStateGroup, TStateGroups } from "@plane/types";
import { Popover, Input, TextArea, CustomSelect } from "@plane/ui";
import {
  deleteDisabledTooltipKey,
  getFirstGroupIdForCategory,
  type TStateDeleteDisabledReason,
} from "@/components/project-states/helpers";

type TStateForm = {
  data: Partial<IState>;
  onSubmit: (formData: Partial<IState>) => Promise<{ status: string }>;
  onCancel: () => void;
  buttonDisabled: boolean;
  buttonTitle: string;
  groups?: IStateGroup[];
  onDelete?: () => void;
  isDeleteDisabled?: boolean;
  deleteDisabledReason?: TStateDeleteDisabledReason | null;
};

const CATEGORY_OPTIONS = Object.values(STATE_GROUPS);

function PopoverButton({ color }: { color?: string }) {
  return (
    <div
      className="inline-flex size-5 items-center rounded-sm focus:outline-none"
      style={{
        backgroundColor: color ?? "black",
      }}
    />
  );
}

export function StateForm(props: TStateForm) {
  const {
    data,
    onSubmit,
    onCancel,
    buttonDisabled,
    buttonTitle,
    groups,
    onDelete,
    isDeleteDisabled = false,
    deleteDisabledReason,
  } = props;
  const { t } = useTranslation();
  const [formData, setFormData] = useState<Partial<IState>>(data);
  const [errors, setErrors] = useState<Partial<Record<keyof IState, string>> | undefined>(undefined);

  const handleFormData = <T extends keyof IState>(key: T, value: IState[T]) => {
    setFormData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const handleCategoryChange = (category: TStateGroups) => {
    handleFormData("group", category);
    const groupId = getFirstGroupIdForCategory(groups ?? [], category);
    if (groupId) handleFormData("group_id", groupId);
  };

  const formSubmit = async (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();

    const name = formData.name || undefined;
    if (!name) {
      setErrors({ name: "Name is required" });
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.log("error", error);
    }
  };

  const selectedCategory = formData.group;
  const selectedCategoryLabel = selectedCategory
    ? STATE_GROUPS[selectedCategory].label
    : t("project_settings.states.category");

  return (
    <div className="relative flex gap-2">
      <div className="mt-1.5 h-full shrink-0">
        <Popover button={<PopoverButton color={formData.color} />} panelClassName="mt-4 -ml-3">
          <TwitterPicker color={formData.color} onChange={(value) => handleFormData("color", value.hex)} />
        </Popover>
      </div>

      <div className="w-full space-y-2">
        <Input
          id="name"
          type="text"
          name="name"
          placeholder="Name"
          value={formData.name}
          onChange={(e) => handleFormData("name", e.target.value)}
          hasError={Boolean(errors?.name)}
          className="w-full"
          maxLength={100}
          autoFocus
        />

        <CustomSelect
          value={selectedCategory ?? null}
          label={selectedCategoryLabel}
          onChange={handleCategoryChange}
          buttonClassName="w-full"
        >
          {CATEGORY_OPTIONS.map((option) => (
            <CustomSelect.Option key={option.key} value={option.key}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>

        <TextArea
          id="description"
          name="description"
          placeholder={t("project_settings.states.describe_this_state_for_your_members")}
          value={formData.description}
          onChange={(e) => handleFormData("description", e.target.value)}
          hasError={Boolean(errors?.description)}
          className="min-h-14 w-full resize-none text-13"
        />

        <div className="flex items-center space-x-2">
          <Button onClick={formSubmit} variant="primary" size="lg" disabled={buttonDisabled}>
            {buttonTitle}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={buttonDisabled} onClick={onCancel}>
            {t("cancel")}
          </Button>
          {onDelete ? (
            <Tooltip
              tooltipContent={deleteDisabledReason ? t(deleteDisabledTooltipKey(deleteDisabledReason)) : ""}
              disabled={!isDeleteDisabled}
            >
              <Button
                type="button"
                variant="error-fill"
                size="lg"
                disabled={buttonDisabled || isDeleteDisabled}
                onClick={onDelete}
              >
                {t("project_settings.states.delete.button")}
              </Button>
            </Tooltip>
          ) : null}
        </div>
      </div>
    </div>
  );
}
