/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { observer } from "mobx-react";
import type { TIssueProperty } from "@plane/types";
import { ChevronDownIcon } from "@plane/propel/icons";
import { Input, TextArea, ToggleSwitch, CustomSelect } from "@plane/ui";
import { cn } from "@plane/utils";
import { useMember } from "@/hooks/store/use-member";

type Props = {
  property: TIssueProperty;
  value: unknown;
  onChange: (value: unknown) => void;
  disabled?: boolean;
  error?: string;
  projectId: string;
  /** When true, omit the property name label (e.g. when rendered inside SidebarPropertyListItem). */
  hideLabel?: boolean;
  /** `sidebar` matches standard property-row controls; `form` is for create/edit modals. */
  variant?: "form" | "sidebar";
};

function isMulti(property: TIssueProperty) {
  const settings = property.settings || {};
  return Boolean(settings.is_multi || settings.display_format === "multi");
}

function PropertyLabel(props: { property: TIssueProperty; hideLabel?: boolean }) {
  const { property, hideLabel } = props;
  if (hideLabel) return null;
  return (
    <div className="text-xs text-custom-text-300">
      {property.name}
      {property.is_required ? " *" : ""}
    </div>
  );
}

function chipClassName(checked: boolean, isSidebar: boolean) {
  if (isSidebar) {
    return cn(
      "rounded-sm border-[0.5px] px-1.5 py-0.5 text-body-xs-regular",
      checked
        ? "border-custom-primary-100 bg-custom-primary-100/10 text-custom-primary-100"
        : "border-strong text-tertiary hover:bg-layer-transparent-hover"
    );
  }
  return cn(
    "text-xs rounded border px-2 py-1",
    checked
      ? "border-custom-primary-100 bg-custom-primary-100/10 text-custom-primary-100"
      : "border-custom-border-200 text-custom-text-200"
  );
}

export const IssuePropertyInput = observer(function IssuePropertyInput(props: Props) {
  const { property, value, onChange, disabled, error, projectId, hideLabel, variant = "form" } = props;
  const isSidebar = variant === "sidebar";
  const {
    getUserDetails,
    project: { getProjectMemberIds },
  } = useMember();
  const memberIds = getProjectMemberIds?.(projectId, false) || [];
  const settings = property.settings || {};

  if (property.property_type === "BOOLEAN") {
    return (
      <div className={cn("flex w-full items-center gap-2", hideLabel || isSidebar ? "" : "justify-between")}>
        {!hideLabel && <span className="text-sm text-custom-text-200">{property.name}</span>}
        <ToggleSwitch value={Boolean(value)} onChange={(val) => onChange(val)} disabled={disabled} size="sm" />
      </div>
    );
  }

  if (property.property_type === "TEXT") {
    const format = settings.display_format || settings.format || "single_line";
    if (format === "readonly") {
      return (
        <div className={cn("w-full", isSidebar ? "" : "space-y-1")}>
          <PropertyLabel property={property} hideLabel={hideLabel} />
          <div className={cn(isSidebar ? "h-7.5 text-body-xs-regular text-secondary" : "text-sm text-custom-text-200")}>
            {settings.readonly_value || String(value || "")}
          </div>
        </div>
      );
    }
    if (format === "multi_line") {
      return (
        <div className={cn("w-full", isSidebar ? "" : "space-y-1")}>
          <PropertyLabel property={property} hideLabel={hideLabel} />
          <TextArea
            value={String(value ?? "")}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled}
            className={cn(isSidebar ? "text-body-xs-regular" : "text-sm")}
            rows={isSidebar ? 2 : 3}
          />
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );
    }
    return (
      <div className={cn("w-full", isSidebar ? "" : "space-y-1")}>
        <PropertyLabel property={property} hideLabel={hideLabel} />
        <Input
          value={String(value ?? "")}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          mode={isSidebar ? "true-transparent" : "primary"}
          inputSize={isSidebar ? "xs" : "sm"}
          className={cn("w-full", isSidebar ? "h-7.5 px-0 text-body-xs-regular" : "text-sm")}
          placeholder={isSidebar ? "Add…" : undefined}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (property.property_type === "NUMBER" || property.property_type === "URL" || property.property_type === "DATE") {
    const inputValue =
      property.property_type === "DATE"
        ? value != null
          ? String(value).slice(0, 10)
          : ""
        : value != null
          ? String(value)
          : "";
    return (
      <div className={cn("w-full", isSidebar ? "" : "space-y-1")}>
        <PropertyLabel property={property} hideLabel={hideLabel} />
        <Input
          type={property.property_type === "NUMBER" ? "number" : property.property_type === "DATE" ? "date" : "url"}
          value={inputValue}
          onChange={(e) => onChange(e.target.value)}
          disabled={disabled}
          mode={isSidebar ? "true-transparent" : "primary"}
          inputSize={isSidebar ? "xs" : "sm"}
          className={cn("w-full", isSidebar ? "h-7.5 px-0 text-body-xs-regular" : "text-sm")}
          placeholder={isSidebar ? "Add…" : undefined}
        />
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (property.property_type === "DROPDOWN") {
    const options = (property.options || []).filter((o) => o.is_active);
    const multi = isMulti(property);
    if (multi) {
      const selected = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
      return (
        <div className={cn("w-full", isSidebar ? "" : "space-y-1")}>
          <PropertyLabel property={property} hideLabel={hideLabel} />
          <div className="flex flex-wrap gap-1">
            {options.map((option) => {
              const checked = selected.includes(option.id);
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={disabled}
                  onClick={() => {
                    const next = checked ? selected.filter((id) => id !== option.id) : [...selected, option.id];
                    onChange(next);
                  }}
                  className={chipClassName(checked, isSidebar)}
                >
                  {option.name}
                </button>
              );
            })}
          </div>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );
    }

    const selectedLabel = options.find((o) => o.id === String(value))?.name;
    const displayLabel = selectedLabel || "Select";

    if (isSidebar) {
      return (
        <div className="group w-full grow">
          <CustomSelect
            value={value ? String(value) : null}
            label={displayLabel}
            onChange={(val: string) => onChange(val)}
            disabled={disabled}
            maxHeight="lg"
            className="w-full grow"
            customButtonClassName="group w-full grow"
            customButton={
              <div className="flex h-7.5 w-full items-center justify-between gap-1 text-left text-body-xs-regular">
                <span className={cn("truncate", !selectedLabel && "text-placeholder")}>{displayLabel}</span>
                {!disabled && (
                  <ChevronDownIcon className="hidden h-3.5 w-3.5 shrink-0 group-hover:inline" aria-hidden="true" />
                )}
              </div>
            }
          >
            {options.map((option) => (
              <CustomSelect.Option key={option.id} value={option.id}>
                {option.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
          {error && <p className="text-xs text-red-500">{error}</p>}
        </div>
      );
    }

    return (
      <div className="w-full space-y-1">
        <PropertyLabel property={property} hideLabel={hideLabel} />
        <CustomSelect
          value={value ? String(value) : null}
          label={displayLabel}
          onChange={(val: string) => onChange(val)}
          disabled={disabled}
          maxHeight="lg"
        >
          {options.map((option) => (
            <CustomSelect.Option key={option.id} value={option.id}>
              {option.name}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  if (property.property_type === "MEMBER") {
    const multi = isMulti(property);
    const selected = Array.isArray(value) ? value.map(String) : value ? [String(value)] : [];
    return (
      <div className={cn("w-full", isSidebar ? "" : "space-y-1")}>
        <PropertyLabel property={property} hideLabel={hideLabel} />
        <div className="flex flex-wrap gap-1">
          {memberIds.map((memberId) => {
            const member = getUserDetails(memberId);
            const checked = selected.includes(memberId);
            return (
              <button
                key={memberId}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (multi) {
                    const next = checked ? selected.filter((id) => id !== memberId) : [...selected, memberId];
                    onChange(next);
                  } else {
                    onChange(checked ? null : memberId);
                  }
                }}
                className={chipClassName(checked, isSidebar)}
              >
                {member?.display_name || member?.email || memberId}
              </button>
            );
          })}
        </div>
        {error && <p className="text-xs text-red-500">{error}</p>}
      </div>
    );
  }

  return null;
});
