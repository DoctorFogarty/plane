/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useMemo, useState } from "react";
import { observer } from "mobx-react";
import { Copy, Pencil, RefreshCw, Trash2 } from "lucide-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIntakeForm } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { copyTextToClipboard } from "@plane/utils";
import { getIntakeFormPublicUrl } from "./helpers";

type Props = {
  forms: TIntakeForm[];
  onCreate: () => void;
  onEdit: (form: TIntakeForm) => void;
  onToggle: (form: TIntakeForm, isEnabled: boolean) => Promise<void>;
  onDelete: (form: TIntakeForm) => Promise<void>;
  onRegenerate: (form: TIntakeForm) => Promise<void>;
  disabled?: boolean;
};

export const IntakeFormList = observer(function IntakeFormList(props: Props) {
  const { forms, onCreate, onEdit, onToggle, onDelete, onRegenerate, disabled } = props;
  const { t } = useTranslation();
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  const sortedForms = useMemo(() => forms, [forms]);

  const handleCopy = async (anchor: string) => {
    await copyTextToClipboard(getIntakeFormPublicUrl(anchor));
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("common.success"),
      message: t("project_settings.features.intake.form.toasts.copied"),
    });
  };

  if (sortedForms.length === 0) {
    return (
      <div className="rounded-lg border border-subtle bg-layer-2 px-4 py-6">
        <p className="text-body-sm-regular text-tertiary">{t("project_settings.features.intake.form.empty")}</p>
        <Button variant="primary" size="base" className="mt-4" onClick={onCreate} disabled={disabled}>
          {t("project_settings.features.intake.form.create_form")}
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button variant="primary" size="base" onClick={onCreate} disabled={disabled}>
          {t("project_settings.features.intake.form.create_form")}
        </Button>
      </div>
      {sortedForms.map((form) => (
        <div
          key={form.id}
          className="flex flex-col gap-3 rounded-lg border border-subtle bg-layer-2 px-4 py-3 md:flex-row md:items-center md:justify-between"
        >
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <h4 className="truncate text-body-sm-medium text-primary">{form.name}</h4>
              <span className="text-11 text-tertiary">
                {form.access === "PUBLIC"
                  ? t("project_settings.features.intake.form.access_public")
                  : t("project_settings.features.intake.form.access_authenticated")}
              </span>
            </div>
            <p className="mt-1 truncate text-caption-md-regular text-tertiary">{getIntakeFormPublicUrl(form.anchor)}</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <ToggleSwitch
              value={form.is_enabled}
              onChange={(value) => void onToggle(form, value)}
              disabled={disabled}
            />
            <Button variant="secondary" size="sm" prependIcon={<Copy />} onClick={() => void handleCopy(form.anchor)}>
              {t("project_settings.features.intake.form.copy_link")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              prependIcon={<RefreshCw />}
              onClick={() => void onRegenerate(form)}
              disabled={disabled}
            >
              {t("project_settings.features.intake.form.regenerate_link")}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              prependIcon={<Pencil />}
              onClick={() => onEdit(form)}
              disabled={disabled}
            >
              {t("project_settings.features.intake.form.edit_form")}
            </Button>
            {pendingDeleteId === form.id ? (
              <>
                <Button variant="error-fill" size="sm" onClick={() => void onDelete(form)} disabled={disabled}>
                  {t("project_settings.features.intake.form.delete_form")}
                </Button>
                <Button variant="secondary" size="sm" onClick={() => setPendingDeleteId(null)}>
                  {t("cancel")}
                </Button>
              </>
            ) : (
              <Button
                variant="ghost"
                size="sm"
                prependIcon={<Trash2 />}
                onClick={() => setPendingDeleteId(form.id)}
                disabled={disabled}
                aria-label={t("delete")}
              />
            )}
          </div>
        </div>
      ))}
    </div>
  );
});
