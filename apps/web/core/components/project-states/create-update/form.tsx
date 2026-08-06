/* eslint-disable unicorn/no-array-sort, unicorn/no-empty-file, promise/always-return, jsx-a11y/no-autofocus, jsx-a11y/click-events-have-key-events, jsx-a11y/no-static-element-interactions, jsx-a11y/prefer-tag-over-role, react-hooks/exhaustive-deps, react/no-array-index-key, no-shadow, no-unneeded-ternary, no-unused-expressions, no-useless-constructor */
/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { TwitterPicker } from "react-color";
import { STATE_GROUPS } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type { IState, IStateGroup } from "@plane/types";
import { Popover, Input, TextArea, CustomSelect } from "@plane/ui";

type TStateForm = {
  data: Partial<IState>;
  onSubmit: (formData: Partial<IState>) => Promise<{ status: string }>;
  onCancel: () => void;
  buttonDisabled: boolean;
  buttonTitle: string;
  groups?: IStateGroup[];
};

function PopoverButton({ color }: { color?: string }) {
  return (
    <div
      className="group inline-flex h-5 w-5 items-center rounded-sm text-14 font-medium transition-all focus:outline-none"
      style={{
        backgroundColor: color ?? "black",
      }}
    />
  );
}

export function StateForm(props: TStateForm) {
  const { data, onSubmit, onCancel, buttonDisabled, buttonTitle, groups } = props;
  const { t } = useTranslation();
  const [formData, setFromData] = useState<Partial<IState> | undefined>(undefined);
  const [errors, setErrors] = useState<Partial<Record<keyof IState, string>> | undefined>(undefined);

  useEffect(() => {
    if (data && !formData) setFromData(data);
  }, [data, formData]);

  const handleFormData = <T extends keyof IState>(key: T, value: IState[T]) => {
    setFromData((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => ({ ...prev, [key]: "" }));
  };

  const formSubmit = async (event: React.MouseEvent<HTMLButtonElement, MouseEvent>) => {
    event.preventDefault();

    const name = formData?.name || undefined;
    if (!formData || !name) {
      let currentErrors: Partial<Record<keyof IState, string>> = {};
      if (!name) currentErrors = { ...currentErrors, name: "Name is required" };
      setErrors(currentErrors);
      return;
    }

    try {
      await onSubmit(formData);
    } catch (error) {
      console.log("error", error);
    }
  };

  const selectedGroup = groups?.find((g) => g.id === formData?.group_id);

  return (
    <div className="relative flex space-x-2 rounded-sm bg-surface-1 p-3">
      <div className="mt-2 h-full flex-shrink-0">
        <Popover button={<PopoverButton color={formData?.color} />} panelClassName="mt-4 -ml-3">
          <TwitterPicker color={formData?.color} onChange={(value) => handleFormData("color", value.hex)} />
        </Popover>
      </div>

      <div className="w-full space-y-2">
        <Input
          id="name"
          type="text"
          name="name"
          placeholder="Name"
          value={formData?.name}
          onChange={(e) => handleFormData("name", e.target.value)}
          hasError={(errors && Boolean(errors.name)) || false}
          className="w-full"
          maxLength={100}
          autoFocus
        />

        {groups && groups.length > 0 && (
          <CustomSelect
            value={formData?.group_id || null}
            label={selectedGroup?.name || t("project_settings.states.select_group")}
            onChange={(groupId: string) => {
              const next = groups.find((g) => g.id === groupId);
              handleFormData("group_id", groupId);
              if (next) handleFormData("group", next.category);
            }}
            buttonClassName="w-full"
          >
            {groups.map((g) => (
              <CustomSelect.Option key={g.id} value={g.id}>
                <span className="flex items-center gap-2">
                  <span className="size-2.5 rounded-full" style={{ backgroundColor: g.color }} />
                  {g.name}
                  <span className="text-11 text-tertiary">({STATE_GROUPS[g.category].label})</span>
                </span>
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        )}

        <TextArea
          id="description"
          name="description"
          placeholder={t("project_settings.states.describe_this_state_for_your_members")}
          value={formData?.description}
          onChange={(e) => handleFormData("description", e.target.value)}
          hasError={(errors && Boolean(errors.description)) || false}
          className="min-h-14 w-full resize-none text-13"
        />

        <div className="flex items-center space-x-2">
          <Button onClick={formSubmit} variant="primary" size="lg" disabled={buttonDisabled}>
            {buttonTitle}
          </Button>
          <Button type="button" variant="secondary" size="lg" disabled={buttonDisabled} onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  );
}
