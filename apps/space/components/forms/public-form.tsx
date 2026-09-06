/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import { SitesIntakeFormService } from "@plane/services";
import type { TLogoProps, TPublicIntakeFormSchema } from "@plane/types";
import { parseIntakeFormAttachments } from "@plane/utils";
import { ProjectLogo } from "@/components/common/project-logo";
import { PublicFormAttachmentsField } from "@/components/forms/public-form-attachments";
import { PublicFormField } from "@/components/forms/public-form-field";

const formService = new SitesIntakeFormService();

type Props = {
  anchor: string;
  schema: TPublicIntakeFormSchema;
};

function textToHtml(text: string) {
  const escaped = text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\n/g, "<br />");
  return `<p>${escaped}</p>`;
}

function fieldKey(field: TPublicIntakeFormSchema["fields"][number]) {
  return field.source === "property" ? (field.property_id ?? field.key) : field.key;
}

function asLogoProps(value: TPublicIntakeFormSchema["project"]["logo_props"]): TLogoProps | undefined {
  if (!value || typeof value !== "object" || !("in_use" in value)) return undefined;
  if (value.in_use !== "icon" && value.in_use !== "emoji") return undefined;
  return value as TLogoProps;
}

export const PublicIntakeForm = observer(function PublicIntakeForm(props: Props) {
  const { anchor, schema } = props;
  const { t } = useTranslation();
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [honeypot, setHoneypot] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [attachmentsBusy, setAttachmentsBusy] = useState(false);

  const fields = useMemo(() => schema.fields || [], [schema.fields]);
  const logo = asLogoProps(schema.project.logo_props);

  const setField = (key: string, value: unknown) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async () => {
    if (attachmentsBusy) return;
    const nextErrors: Record<string, string> = {};
    for (const field of fields) {
      const key = fieldKey(field);
      const value = values[key];
      const empty = value == null || value === "" || (Array.isArray(value) && value.length === 0);
      if (field.required && empty) {
        nextErrors[key] = t("required");
      }
    }
    if (Object.keys(nextErrors).length > 0) {
      setErrors(nextErrors);
      return;
    }
    setSubmitting(true);
    try {
      const propertyValues: Record<string, unknown> = {};
      for (const field of fields) {
        if (field.source === "property") {
          propertyValues[field.property_id ?? field.key] = values[fieldKey(field)];
        }
      }
      const description = typeof values.description === "string" ? values.description : "";
      await formService.submit(anchor, {
        issue: {
          name: String(values.name || ""),
          description_html: description ? textToHtml(description) : "<p></p>",
          priority: typeof values.priority === "string" ? values.priority : "none",
          label_ids: Array.isArray(values.labels) ? values.labels.map(String) : [],
        },
        property_values: propertyValues,
        submitter_email: typeof values.submitter_email === "string" ? values.submitter_email : "",
        submitter_name: typeof values.submitter_name === "string" ? values.submitter_name : "",
        website: honeypot,
        attachment_ids: parseIntakeFormAttachments(values.attachments).map((item) => item.id),
      });
      setSubmitted(true);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_settings.features.intake.form.submit_error"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <div className="rounded-lg border border-subtle bg-layer-2 p-6 text-center">
        <h2 className="text-18 font-semibold text-primary">
          {t("project_settings.features.intake.form.submitted_title")}
        </h2>
        <p className="mt-2 text-13 text-secondary">{schema.success_message}</p>
      </div>
    );
  }

  return (
    <div className="space-y-5 rounded-lg border border-subtle bg-layer-2 p-6">
      <div className="flex items-center gap-2">
        {logo ? <ProjectLogo logo={logo} /> : null}
        <div>
          <p className="text-11 text-tertiary">{schema.project.identifier}</p>
          <h1 className="text-18 font-semibold text-primary">{schema.name}</h1>
        </div>
      </div>
      {schema.description ? <p className="text-13 text-secondary">{schema.description}</p> : null}
      <form
        className="space-y-4"
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit();
        }}
      >
        <label className="absolute -left-[9999px] h-0 w-0 overflow-hidden opacity-0">
          website
          <input
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={honeypot}
            onChange={(event) => setHoneypot(event.target.value)}
          />
        </label>
        {fields.map((field) =>
          field.source === "system" && field.key === "attachments" ? (
            <PublicFormAttachmentsField
              key={fieldKey(field)}
              anchor={anchor}
              field={field}
              value={parseIntakeFormAttachments(values.attachments)}
              onAdd={(attachments) =>
                setValues((prev) => ({
                  ...prev,
                  attachments: [...parseIntakeFormAttachments(prev.attachments), ...attachments],
                }))
              }
              onRemove={(assetId) =>
                setValues((prev) => ({
                  ...prev,
                  attachments: parseIntakeFormAttachments(prev.attachments).filter((item) => item.id !== assetId),
                }))
              }
              onBusyChange={setAttachmentsBusy}
              error={errors.attachments}
            />
          ) : (
            <PublicFormField
              key={fieldKey(field)}
              field={field}
              value={values[fieldKey(field)]}
              onChange={(value) => setField(fieldKey(field), value)}
              error={errors[fieldKey(field)]}
            />
          )
        )}
        <Button type="submit" variant="primary" size="lg" loading={submitting} disabled={attachmentsBusy}>
          {t("submit")}
        </Button>
      </form>
    </div>
  );
});
