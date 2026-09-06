/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import type {
  IIssueLabel,
  TIntakeForm,
  TIntakeFormAccess,
  TIntakeFormField,
  TIssueProperty,
  TIssueType,
} from "@plane/types";
import { MAX_INTAKE_FORM_ATTACHMENTS } from "@plane/constants";
import { CustomSelect, Input, TextArea, ToggleSwitch } from "@plane/ui";
import { defaultFormFields, getIntakeFormPublicUrl, NATIVE_FORM_FIELDS } from "./helpers";

type Props = {
  form: TIntakeForm | null;
  types: TIssueType[];
  typesEnabled: boolean;
  properties: TIssueProperty[];
  labels: IIssueLabel[];
  submitting: boolean;
  regenerating?: boolean;
  onCancel: () => void;
  onRegenerate?: () => Promise<void>;
  onSave: (payload: {
    name: string;
    description: string;
    access: TIntakeFormAccess;
    is_enabled: boolean;
    issue_type_id: string | null;
    fields: TIntakeFormField[];
    success_message: string;
  }) => Promise<void>;
  values: TBuilderState;
  onChange: (values: TBuilderState) => void;
};

export type TBuilderState = {
  name: string;
  description: string;
  access: TIntakeFormAccess;
  is_enabled: boolean;
  issue_type_id: string | null;
  fields: TIntakeFormField[];
  success_message: string;
};

export function builderStateFromForm(form: TIntakeForm | null, defaultTypeId: string | null): TBuilderState {
  if (!form) {
    return {
      name: "",
      description: "",
      access: "PUBLIC",
      is_enabled: true,
      issue_type_id: defaultTypeId,
      fields: defaultFormFields(),
      success_message: "Thank you. Your request has been submitted.",
    };
  }
  return {
    name: form.name,
    description: form.description || "",
    access: form.access,
    is_enabled: form.is_enabled,
    issue_type_id: form.issue_type_id,
    fields: form.fields?.length ? form.fields : defaultFormFields(),
    success_message: form.success_message || "",
  };
}

function fieldKey(field: TIntakeFormField) {
  return field.source === "property" ? (field.property_id ?? field.key) : field.key;
}

export const IntakeFormBuilder = observer(function IntakeFormBuilder(props: Props) {
  const {
    form,
    types,
    typesEnabled,
    properties,
    labels,
    submitting,
    regenerating,
    onCancel,
    onRegenerate,
    onSave,
    values,
    onChange,
  } = props;
  const { t } = useTranslation();

  const fieldMap = useMemo(() => {
    const map = new Map<string, TIntakeFormField>();
    for (const field of values.fields) {
      map.set(fieldKey(field), field);
    }
    return map;
  }, [values.fields]);

  const formableProperties = useMemo(
    () => properties.filter((property) => property.is_active && property.property_type !== "MEMBER"),
    [properties]
  );

  const labelsField = fieldMap.get("labels");
  const allowedLabelIds = new Set(labelsField?.allowed_ids || []);

  const toggleSystemField = (key: string, enabled: boolean) => {
    if (key === "name") return;
    const next = enabled
      ? [
          ...values.fields,
          {
            key,
            source: "system" as const,
            required: key === "submitter_email",
            ...(key === "labels" ? { allowed_ids: labels.map((label) => label.id) } : {}),
          },
        ]
      : values.fields.filter((field) => !(field.source === "system" && field.key === key));
    onChange({ ...values, fields: next });
  };

  const setSystemRequired = (key: string, required: boolean) => {
    onChange({
      ...values,
      fields: values.fields.map((field) =>
        field.source === "system" && field.key === key
          ? { ...field, required: key === "name" ? true : required }
          : field
      ),
    });
  };

  const toggleAllowedLabel = (labelId: string, enabled: boolean) => {
    onChange({
      ...values,
      fields: values.fields.map((field) => {
        if (!(field.source === "system" && field.key === "labels")) return field;
        const current = field.allowed_ids || [];
        const nextIds = enabled ? [...current, labelId] : current.filter((id) => id !== labelId);
        return { ...field, allowed_ids: nextIds };
      }),
    });
  };

  const toggleProperty = (property: TIssueProperty, enabled: boolean) => {
    const next = enabled
      ? [
          ...values.fields,
          {
            key: property.id,
            source: "property" as const,
            property_id: property.id,
            required: property.is_required,
          },
        ]
      : values.fields.filter((field) => fieldKey(field) !== property.id);
    onChange({ ...values, fields: next });
  };

  const setPropertyRequired = (propertyId: string, required: boolean) => {
    onChange({
      ...values,
      fields: values.fields.map((field) => (fieldKey(field) === propertyId ? { ...field, required } : field)),
    });
  };

  const handleSave = () => {
    if (!values.name.trim()) return;
    void onSave({
      name: values.name.trim(),
      description: values.description,
      access: values.access,
      is_enabled: values.is_enabled,
      issue_type_id: values.issue_type_id,
      fields: values.fields,
      success_message: values.success_message,
    });
  };

  return (
    <div className="space-y-5 rounded-lg border border-subtle bg-layer-2 p-4">
      <div className="grid gap-4 md:grid-cols-2">
        <label className="space-y-1">
          <span className="text-caption-md-medium text-secondary">
            {t("project_settings.features.intake.form.form_title")}
          </span>
          <Input value={values.name} onChange={(event) => onChange({ ...values, name: event.target.value })} />
        </label>
        <label className="space-y-1">
          <span className="text-caption-md-medium text-secondary">
            {t("project_settings.features.intake.form.access")}
          </span>
          <CustomSelect
            value={values.access}
            label={
              values.access === "PUBLIC"
                ? t("project_settings.features.intake.form.access_public")
                : t("project_settings.features.intake.form.access_authenticated")
            }
            onChange={(access: TIntakeFormAccess) => onChange({ ...values, access })}
          >
            <CustomSelect.Option value="PUBLIC">
              {t("project_settings.features.intake.form.access_public")}
            </CustomSelect.Option>
            <CustomSelect.Option value="AUTHENTICATED">
              {t("project_settings.features.intake.form.access_authenticated")}
            </CustomSelect.Option>
          </CustomSelect>
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-caption-md-medium text-secondary">{t("description")}</span>
        <TextArea
          value={values.description}
          onChange={(event) => onChange({ ...values, description: event.target.value })}
        />
      </label>

      <label className="block space-y-1">
        <span className="text-caption-md-medium text-secondary">
          {t("project_settings.features.intake.form.success_message")}
        </span>
        <TextArea
          value={values.success_message}
          onChange={(event) => onChange({ ...values, success_message: event.target.value })}
        />
      </label>

      {typesEnabled ? (
        <label className="block space-y-1">
          <span className="text-caption-md-medium text-secondary">
            {t("project_settings.features.intake.form.work_item_type")}
          </span>
          <CustomSelect
            value={values.issue_type_id}
            label={
              types.find((type) => type.id === values.issue_type_id)?.name ||
              t("project_settings.features.intake.form.work_item_type")
            }
            onChange={(issueTypeId: string) =>
              onChange({
                ...values,
                issue_type_id: issueTypeId,
                fields: values.fields.filter((field) => field.source !== "property"),
              })
            }
          >
            {types.map((type) => (
              <CustomSelect.Option key={type.id} value={type.id}>
                {type.name}
              </CustomSelect.Option>
            ))}
          </CustomSelect>
        </label>
      ) : null}

      <div className="flex items-center justify-between">
        <span className="text-caption-md-medium text-secondary">
          {t("project_settings.features.intake.form.enabled")}
        </span>
        <ToggleSwitch
          value={values.is_enabled}
          onChange={(isEnabled) => onChange({ ...values, is_enabled: isEnabled })}
        />
      </div>

      {form ? (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-subtle px-3 py-2">
          <p className="truncate text-caption-md-regular text-tertiary">{getIntakeFormPublicUrl(form.anchor)}</p>
          {onRegenerate ? (
            <Button variant="secondary" size="sm" onClick={() => void onRegenerate()} loading={regenerating}>
              {t("project_settings.features.intake.form.regenerate_link")}
            </Button>
          ) : null}
        </div>
      ) : null}

      <div>
        <h5 className="mb-2 text-body-sm-medium text-primary">
          {t("project_settings.features.intake.form.native_fields")}
        </h5>
        <div className="space-y-2">
          {NATIVE_FORM_FIELDS.map((native) => {
            const selected = fieldMap.get(native.key);
            const enabled = Boolean(selected);
            return (
              <div
                key={native.key}
                className="flex items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2"
              >
                <div className="min-w-0 flex-1">
                  <label className="flex items-center gap-2 text-13 text-primary">
                    <input
                      type="checkbox"
                      checked={enabled}
                      disabled={native.locked}
                      onChange={(event) => toggleSystemField(native.key, event.target.checked)}
                    />
                    {t(native.i18nLabel)}
                  </label>
                  {native.key === "attachments" ? (
                    <p className="mt-1 pl-6 text-11 text-tertiary">
                      {t("project_settings.features.intake.form.attachments_help", {
                        count: MAX_INTAKE_FORM_ATTACHMENTS,
                      })}
                    </p>
                  ) : null}
                </div>
                {enabled ? (
                  <label className="flex items-center gap-2 text-11 text-secondary">
                    {t("required")}
                    <ToggleSwitch
                      value={native.key === "name" ? true : Boolean(selected?.required)}
                      onChange={(required) => setSystemRequired(native.key, required)}
                      disabled={native.key === "name"}
                    />
                  </label>
                ) : null}
              </div>
            );
          })}
        </div>
        {labelsField && labels.length > 0 ? (
          <div className="mt-3 space-y-2 rounded-md border border-subtle px-3 py-2">
            <p className="text-caption-md-medium text-secondary">
              {t("project_settings.features.intake.form.allowed_labels")}
            </p>
            {labels.map((label) => (
              <label key={label.id} className="flex items-center gap-2 text-13 text-primary">
                <input
                  type="checkbox"
                  checked={allowedLabelIds.has(label.id)}
                  onChange={(event) => toggleAllowedLabel(label.id, event.target.checked)}
                />
                <span className="inline-block size-2 rounded-full" style={{ backgroundColor: label.color }} />
                {label.name}
              </label>
            ))}
          </div>
        ) : null}
      </div>

      {typesEnabled ? (
        <div>
          <h5 className="mb-2 text-body-sm-medium text-primary">
            {t("project_settings.features.intake.form.select_properties")}
          </h5>
          {formableProperties.length === 0 ? (
            <p className="text-caption-md-regular text-tertiary">
              {t("project_settings.features.intake.form.no_properties")}
            </p>
          ) : (
            <div className="space-y-2" style={{ contentVisibility: "auto" }}>
              {formableProperties.map((property) => {
                const selected = fieldMap.get(property.id);
                return (
                  <div
                    key={property.id}
                    className="flex items-center justify-between gap-3 rounded-md border border-subtle px-3 py-2"
                  >
                    <label className="flex items-center gap-2 text-13 text-primary">
                      <input
                        type="checkbox"
                        checked={Boolean(selected)}
                        onChange={(event) => toggleProperty(property, event.target.checked)}
                      />
                      {property.name}
                    </label>
                    {selected ? (
                      <label className="flex items-center gap-2 text-11 text-secondary">
                        {t("required")}
                        <ToggleSwitch
                          value={Boolean(selected.required)}
                          onChange={(required) => setPropertyRequired(property.id, required)}
                        />
                      </label>
                    ) : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onCancel} disabled={submitting}>
          {t("cancel")}
        </Button>
        <Button variant="primary" size="base" onClick={handleSave} loading={submitting} disabled={!values.name.trim()}>
          {t("save")}
        </Button>
      </div>
    </div>
  );
});
