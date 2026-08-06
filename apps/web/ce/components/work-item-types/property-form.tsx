/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import type { TIssueProperty, TIssuePropertyOption, TIssuePropertySettings, TIssuePropertyType } from "@plane/types";
import { Button, Input, ToggleSwitch, CustomSelect } from "@plane/ui";

export const PROPERTY_TYPES: { value: TIssuePropertyType; label: string }[] = [
  { value: "TEXT", label: "Text" },
  { value: "NUMBER", label: "Number" },
  { value: "DROPDOWN", label: "Dropdown" },
  { value: "BOOLEAN", label: "Boolean" },
  { value: "DATE", label: "Date" },
  { value: "MEMBER", label: "Member picker" },
  { value: "URL", label: "URL" },
];

export type TPropertyOptionDraft = {
  /** Existing option id; undefined for newly added options */
  id?: string;
  name: string;
  /** Client-only key for React lists before save */
  key: string;
};

export type TPropertyFormValues = {
  name: string;
  property_type: TIssuePropertyType;
  is_required: boolean;
  is_active: boolean;
  settings: TIssuePropertySettings;
  options: TPropertyOptionDraft[];
};

export type TPropertyFormSubmitPayload = {
  name: string;
  property_type?: TIssuePropertyType;
  is_required: boolean;
  is_active: boolean;
  settings: TIssuePropertySettings;
  options?: Partial<TIssuePropertyOption>[];
};

type Props = {
  mode: "create" | "edit";
  initialValues?: Partial<TPropertyFormValues> | TIssueProperty;
  disabled?: boolean;
  loading?: boolean;
  onSubmit: (payload: TPropertyFormSubmitPayload) => Promise<void> | void;
  onCancel?: () => void;
};

function defaultSettingsForType(propertyType: TIssuePropertyType): TIssuePropertySettings {
  if (propertyType === "MEMBER" || propertyType === "DROPDOWN") {
    return { display_format: "single", is_multi: false };
  }
  if (propertyType === "TEXT") {
    return { display_format: "single_line" };
  }
  return {};
}

function toOptionDrafts(options?: TIssuePropertyOption[]): TPropertyOptionDraft[] {
  if (!options?.length) return [{ key: crypto.randomUUID(), name: "" }];
  return options.map((option) => ({
    id: option.id,
    key: option.id,
    name: option.name,
  }));
}

function normalizeInitialValues(
  mode: "create" | "edit",
  initialValues?: Partial<TPropertyFormValues> | TIssueProperty
): TPropertyFormValues {
  if (initialValues && "id" in initialValues && typeof initialValues.id === "string") {
    const property = initialValues as TIssueProperty;
    return {
      name: property.name || "",
      property_type: property.property_type,
      is_required: Boolean(property.is_required),
      is_active: property.is_active !== false,
      settings: property.settings || defaultSettingsForType(property.property_type),
      options: property.property_type === "DROPDOWN" ? toOptionDrafts(property.options) : [],
    };
  }

  const draft = (initialValues || {}) as Partial<TPropertyFormValues>;
  const propertyType = draft.property_type || "TEXT";
  return {
    name: draft.name || "",
    property_type: propertyType,
    is_required: Boolean(draft.is_required),
    is_active: draft.is_active !== false,
    settings: draft.settings || defaultSettingsForType(propertyType),
    options:
      propertyType === "DROPDOWN"
        ? draft.options?.length
          ? draft.options
          : [{ key: crypto.randomUUID(), name: "" }]
        : [],
  };
}

export function PropertyForm(props: Props) {
  const { mode, initialValues, disabled, loading, onSubmit, onCancel } = props;
  const [values, setValues] = useState<TPropertyFormValues>(() => normalizeInitialValues(mode, initialValues));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setValues(normalizeInitialValues(mode, initialValues));
    setError(null);
  }, [mode, initialValues]);

  const isBoolean = values.property_type === "BOOLEAN";
  const isText = values.property_type === "TEXT";
  const isDropdown = values.property_type === "DROPDOWN";
  const isMember = values.property_type === "MEMBER";
  const textFormat = values.settings.display_format || values.settings.format || "single_line";
  const isReadonlyText = isText && textFormat === "readonly";
  const requiredDisabled = disabled || isBoolean || isReadonlyText;

  const handleTypeChange = (property_type: TIssuePropertyType) => {
    if (mode === "edit") return;
    setValues((prev) => ({
      ...prev,
      property_type,
      is_required: property_type === "BOOLEAN" ? false : prev.is_required,
      settings: defaultSettingsForType(property_type),
      options:
        property_type === "DROPDOWN"
          ? prev.options.length
            ? prev.options
            : [{ key: crypto.randomUUID(), name: "" }]
          : [],
    }));
  };

  const handleSubmit = async () => {
    const name = values.name.trim();
    if (!name) {
      setError("Property name is required");
      return;
    }

    if (isDropdown) {
      const namedOptions = values.options.map((o) => ({ ...o, name: o.name.trim() })).filter((o) => o.name);
      if (!namedOptions.length) {
        setError("Dropdown properties need at least one option");
        return;
      }
    }

    setError(null);

    const payload: TPropertyFormSubmitPayload = {
      name,
      is_required: requiredDisabled ? false : values.is_required,
      is_active: values.is_active,
      settings: {
        ...values.settings,
        ...(isDropdown || isMember
          ? {
              display_format:
                values.settings.is_multi || values.settings.display_format === "multi" ? "multi" : "single",
              is_multi: Boolean(values.settings.is_multi || values.settings.display_format === "multi"),
            }
          : {}),
      },
    };

    if (mode === "create") {
      payload.property_type = values.property_type;
    }

    if (isDropdown) {
      payload.options = values.options
        .map((option) => ({
          id: option.id,
          name: option.name.trim(),
          is_active: true,
        }))
        .filter((option) => option.name);
    }

    await onSubmit(payload);
  };

  return (
    <div className="border-custom-border-200 space-y-3 rounded border border-dashed p-3">
      <div className="text-sm font-medium">{mode === "create" ? "Add property" : "Edit property"}</div>

      <Input
        value={values.name}
        onChange={(e) => setValues((prev) => ({ ...prev, name: e.target.value }))}
        placeholder="Property name"
        disabled={disabled || loading}
      />

      {mode === "create" ? (
        <CustomSelect
          value={values.property_type}
          label={PROPERTY_TYPES.find((p) => p.value === values.property_type)?.label}
          onChange={handleTypeChange}
          disabled={disabled || loading}
        >
          {PROPERTY_TYPES.map((option) => (
            <CustomSelect.Option key={option.value} value={option.value}>
              {option.label}
            </CustomSelect.Option>
          ))}
        </CustomSelect>
      ) : (
        <div className="border-custom-border-100 bg-custom-background-80 text-xs text-custom-text-200 rounded border px-3 py-2">
          Type: {PROPERTY_TYPES.find((p) => p.value === values.property_type)?.label || values.property_type}
          <span className="text-custom-text-300 ml-2">(locked)</span>
        </div>
      )}

      {isText && (
        <CustomSelect
          value={textFormat}
          label={textFormat === "multi_line" ? "Paragraph" : textFormat === "readonly" ? "Read-only" : "Single line"}
          onChange={(display_format: string) =>
            setValues((prev) => ({
              ...prev,
              settings: { ...prev.settings, display_format },
              is_required: display_format === "readonly" ? false : prev.is_required,
            }))
          }
          disabled={disabled || loading}
        >
          <CustomSelect.Option value="single_line">Single line</CustomSelect.Option>
          <CustomSelect.Option value="multi_line">Paragraph</CustomSelect.Option>
          <CustomSelect.Option value="readonly">Read-only</CustomSelect.Option>
        </CustomSelect>
      )}

      {(isDropdown || isMember) && (
        <CustomSelect
          value={values.settings.is_multi || values.settings.display_format === "multi" ? "multi" : "single"}
          label={
            values.settings.is_multi || values.settings.display_format === "multi" ? "Multi select" : "Single select"
          }
          onChange={(format: string) =>
            setValues((prev) => ({
              ...prev,
              settings: {
                ...prev.settings,
                display_format: format,
                is_multi: format === "multi",
              },
            }))
          }
          disabled={disabled || loading}
        >
          <CustomSelect.Option value="single">Single select</CustomSelect.Option>
          <CustomSelect.Option value="multi">Multi select</CustomSelect.Option>
        </CustomSelect>
      )}

      {isDropdown && (
        <div className="space-y-2">
          <div className="text-xs text-custom-text-300">Options</div>
          {values.options.map((option, index) => (
            <div key={option.key} className="flex items-center gap-2">
              <Input
                value={option.name}
                onChange={(e) =>
                  setValues((prev) => ({
                    ...prev,
                    options: prev.options.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)),
                  }))
                }
                placeholder={`Option ${index + 1}`}
                disabled={disabled || loading}
                className="flex-1"
              />
              <button
                type="button"
                disabled={disabled || loading || values.options.length <= 1}
                onClick={() =>
                  setValues((prev) => ({
                    ...prev,
                    options: prev.options.filter((_, i) => i !== index),
                  }))
                }
                className="text-custom-text-300 hover:text-red-500 disabled:opacity-40"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
          <Button
            variant="neutral-primary"
            size="sm"
            disabled={disabled || loading}
            onClick={() =>
              setValues((prev) => ({
                ...prev,
                options: [...prev.options, { key: crypto.randomUUID(), name: "" }],
              }))
            }
          >
            <Plus className="h-3.5 w-3.5" />
            Add option
          </Button>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-4">
          <div className="text-xs text-custom-text-300 flex items-center gap-2">
            Required
            <ToggleSwitch
              value={values.is_required}
              onChange={(is_required) => setValues((prev) => ({ ...prev, is_required }))}
              disabled={requiredDisabled || loading}
              size="sm"
            />
          </div>
          {mode === "edit" && (
            <div className="text-xs text-custom-text-300 flex items-center gap-2">
              Active
              <ToggleSwitch
                value={values.is_active}
                onChange={(is_active) => setValues((prev) => ({ ...prev, is_active }))}
                disabled={disabled || loading}
                size="sm"
              />
            </div>
          )}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="neutral-primary" size="sm" onClick={onCancel} disabled={loading}>
              Cancel
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={handleSubmit} disabled={disabled} loading={loading}>
            {mode === "create" ? "Create property" : "Save changes"}
          </Button>
        </div>
      </div>

      {error && <p className="text-xs text-red-500">{error}</p>}
    </div>
  );
}
