/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useTranslation } from "@plane/i18n";
import type { TIntakeFormField } from "@plane/types";
import { Input, TextArea, ToggleSwitch } from "@plane/ui";

type Props = {
  field: TIntakeFormField;
  value: unknown;
  onChange: (value: unknown) => void;
  error?: string;
};

function fieldTitle(field: TIntakeFormField, t: (key: string) => string) {
  if (field.source === "property") return field.name || field.key;
  if (field.key === "name") return t("title");
  if (field.key === "description") return t("description");
  if (field.key === "priority") return t("priority");
  if (field.key === "labels") return t("labels");
  if (field.key === "submitter_email") return t("project_settings.features.intake.form.submitter_email");
  if (field.key === "submitter_name") return t("project_settings.features.intake.form.submitter_name");
  return field.name || field.key;
}

export function PublicFormField(props: Props) {
  const { field, value, onChange, error } = props;
  const { t } = useTranslation();
  const label = fieldTitle(field, t);
  const requiredMark = field.required ? " *" : "";

  if (field.source === "system" && field.key === "description") {
    return (
      <label className="block space-y-1">
        <span className="text-13 font-medium text-primary">
          {label}
          {requiredMark}
        </span>
        <TextArea value={typeof value === "string" ? value : ""} onChange={(event) => onChange(event.target.value)} />
        {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
      </label>
    );
  }

  if (field.source === "system" && field.key === "priority") {
    const current = typeof value === "string" ? value : "none";
    return (
      <label className="block space-y-1">
        <span className="text-13 font-medium text-primary">
          {label}
          {requiredMark}
        </span>
        <select
          className="w-full rounded-md border border-subtle-1 bg-layer-2 px-2 py-1.5 text-13"
          value={current}
          onChange={(event) => onChange(event.target.value)}
        >
          <option value="none">{t("none")}</option>
          <option value="urgent">{t("urgent")}</option>
          <option value="high">{t("high")}</option>
          <option value="medium">{t("medium")}</option>
          <option value="low">{t("low")}</option>
        </select>
        {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
      </label>
    );
  }

  if (field.source === "system" && field.key === "labels") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    const labels = field.labels || [];
    return (
      <fieldset className="space-y-2">
        <legend className="text-13 font-medium text-primary">
          {label}
          {requiredMark}
        </legend>
        {labels.map((labelOption) => (
          <label key={labelOption.id} className="flex items-center gap-2 text-13">
            <input
              type="checkbox"
              checked={selected.includes(labelOption.id)}
              onChange={(event) => {
                const next = event.target.checked
                  ? [...selected, labelOption.id]
                  : selected.filter((id) => id !== labelOption.id);
                onChange(next);
              }}
            />
            <span className="inline-block size-2 rounded-full" style={{ backgroundColor: labelOption.color }} />
            {labelOption.name}
          </label>
        ))}
        {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
      </fieldset>
    );
  }

  if (field.source === "property") {
    if (field.property_type === "BOOLEAN") {
      return (
        <div className="flex items-center justify-between">
          <span className="text-13 font-medium text-primary">
            {label}
            {requiredMark}
          </span>
          <ToggleSwitch value={Boolean(value)} onChange={onChange} />
        </div>
      );
    }
    if (field.property_type === "DROPDOWN") {
      const current = typeof value === "string" ? value : "";
      return (
        <label className="block space-y-1">
          <span className="text-13 font-medium text-primary">
            {label}
            {requiredMark}
          </span>
          <select
            className="w-full rounded-md border border-subtle-1 bg-layer-2 px-2 py-1.5 text-13"
            value={current}
            onChange={(event) => onChange(event.target.value)}
          >
            <option value="">{t("none")}</option>
            {(field.options || []).map((option) => (
              <option key={option.id} value={option.id}>
                {option.name}
              </option>
            ))}
          </select>
          {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
        </label>
      );
    }
    const inputType =
      field.property_type === "NUMBER"
        ? "number"
        : field.property_type === "DATE"
          ? "date"
          : field.property_type === "URL"
            ? "url"
            : "text";
    return (
      <label className="block space-y-1">
        <span className="text-13 font-medium text-primary">
          {label}
          {requiredMark}
        </span>
        <Input
          type={inputType}
          value={value == null ? "" : String(value)}
          onChange={(event) => {
            if (field.property_type !== "NUMBER") {
              onChange(event.target.value);
              return;
            }
            onChange(event.target.value === "" ? "" : Number(event.target.value));
          }}
        />
        {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
      </label>
    );
  }

  const inputType = field.key === "submitter_email" ? "email" : "text";
  return (
    <label className="block space-y-1">
      <span className="text-13 font-medium text-primary">
        {label}
        {requiredMark}
      </span>
      <Input
        type={inputType}
        value={typeof value === "string" ? value : ""}
        onChange={(event) => onChange(event.target.value)}
      />
      {error ? <p className="text-11 text-danger-primary">{error}</p> : null}
    </label>
  );
}
