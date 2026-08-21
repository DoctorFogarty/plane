/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useState } from "react";
import { observer } from "mobx-react";
import useSWR from "swr";
import { useTranslation } from "@plane/i18n";
import { IntakeFormService } from "@plane/services";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { TIntakeForm, TIntakeFormPayload } from "@plane/types";
import { SettingsHeading } from "@/components/settings/heading";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useLabel } from "@/hooks/store/use-label";
import { IntakeFormBuilder, builderStateFromForm } from "./builder";
import type { TBuilderState } from "./builder";
import { IntakeFormList } from "./list";

const intakeFormService = new IntakeFormService();

type Props = {
  workspaceSlug: string;
  projectId: string;
  isAdmin: boolean;
};

export const IntakeFormsRoot = observer(function IntakeFormsRoot(props: Props) {
  const { workspaceSlug, projectId, isAdmin } = props;
  const { t } = useTranslation();
  const issueTypeStore = useIssueType();
  const { fetchProjectLabels, getProjectLabels } = useLabel();
  const [mode, setMode] = useState<"list" | "create" | "edit">("list");
  const [editingForm, setEditingForm] = useState<TIntakeForm | null>(null);
  const [builderState, setBuilderState] = useState<TBuilderState>(builderStateFromForm(null, null));
  const [submitting, setSubmitting] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const swrKey = workspaceSlug && projectId ? `INTAKE_FORMS_${workspaceSlug}_${projectId}` : null;
  const { data: forms = [], mutate } = useSWR(swrKey, () => intakeFormService.list(workspaceSlug, projectId), {
    revalidateIfStale: false,
    revalidateOnFocus: false,
  });

  useEffect(() => {
    if (!workspaceSlug || !projectId) return;
    void Promise.all([
      issueTypeStore.fetchWorkItemTypesPropertiesAndOptions(workspaceSlug, projectId),
      fetchProjectLabels(workspaceSlug, projectId),
    ]);
  }, [workspaceSlug, projectId, issueTypeStore, fetchProjectLabels]);

  const typesEnabled = issueTypeStore.isIssueTypeEnabled(projectId);
  const types = issueTypeStore.getActiveProjectIssueTypes(projectId);
  const defaultTypeId = issueTypeStore.getDefaultIssueTypeId(projectId);
  const properties = builderState.issue_type_id
    ? issueTypeStore.getActivePropertiesForType(projectId, builderState.issue_type_id)
    : [];
  const labels = getProjectLabels(projectId) || [];

  useEffect(() => {
    if (mode !== "create" || !typesEnabled || builderState.issue_type_id || !defaultTypeId) return;
    setBuilderState((current) => ({ ...current, issue_type_id: defaultTypeId }));
  }, [mode, typesEnabled, defaultTypeId, builderState.issue_type_id]);

  const openCreate = () => {
    setEditingForm(null);
    setBuilderState(builderStateFromForm(null, defaultTypeId));
    setMode("create");
  };

  const openEdit = (form: TIntakeForm) => {
    setEditingForm(form);
    setBuilderState(builderStateFromForm(form, defaultTypeId));
    setMode("edit");
  };

  const handleSave = async (payload: TIntakeFormPayload) => {
    setSubmitting(true);
    try {
      if (mode === "edit" && editingForm) {
        const updated = await intakeFormService.update(workspaceSlug, projectId, editingForm.id, payload);
        await mutate((current) => (current || []).map((item) => (item.id === updated.id ? updated : item)), {
          revalidate: false,
        });
        setEditingForm(updated);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("common.success"),
          message: t("project_settings.features.intake.form.toasts.success_update"),
        });
      } else {
        const created = await intakeFormService.create(workspaceSlug, projectId, payload);
        await mutate((current) => [created, ...(current || [])], { revalidate: false });
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("common.success"),
          message: t("project_settings.features.intake.form.toasts.success_create"),
        });
      }
      setMode("list");
      setEditingForm(null);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message:
          mode === "edit"
            ? t("project_settings.features.intake.form.toasts.error_update")
            : t("project_settings.features.intake.form.toasts.error_create"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  const handleToggle = async (form: TIntakeForm, isEnabled: boolean) => {
    try {
      const updated = await intakeFormService.update(workspaceSlug, projectId, form.id, { is_enabled: isEnabled });
      await mutate((current) => (current || []).map((item) => (item.id === updated.id ? updated : item)), {
        revalidate: false,
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_settings.features.intake.form.toasts.error_update"),
      });
    }
  };

  const handleDelete = async (form: TIntakeForm) => {
    try {
      await intakeFormService.destroy(workspaceSlug, projectId, form.id);
      await mutate((current) => (current || []).filter((item) => item.id !== form.id), { revalidate: false });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("common.success"),
        message: t("project_settings.features.intake.form.toasts.success_delete"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_settings.features.intake.form.toasts.error_delete"),
      });
    }
  };

  const applyRegenerated = async (form: TIntakeForm) => {
    const updated = await intakeFormService.regenerateAnchor(workspaceSlug, projectId, form.id);
    await mutate((current) => (current || []).map((item) => (item.id === updated.id ? updated : item)), {
      revalidate: false,
    });
    if (editingForm?.id === updated.id) {
      setEditingForm(updated);
    }
    setToast({
      type: TOAST_TYPE.SUCCESS,
      title: t("common.success"),
      message: t("project_settings.features.intake.form.toasts.success_regenerate"),
    });
    return updated;
  };

  const handleRegenerate = async (form: TIntakeForm) => {
    try {
      await applyRegenerated(form);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_settings.features.intake.form.toasts.error_regenerate"),
      });
    }
  };

  const handleBuilderRegenerate = async () => {
    if (!editingForm) return;
    setRegenerating(true);
    try {
      await applyRegenerated(editingForm);
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("error"),
        message: t("project_settings.features.intake.form.toasts.error_regenerate"),
      });
    } finally {
      setRegenerating(false);
    }
  };

  return (
    <div className="mt-10 space-y-4">
      <SettingsHeading
        title={t("project_settings.features.intake.form.title")}
        description={t("project_settings.features.intake.form.description")}
      />
      {mode === "list" ? (
        <IntakeFormList
          forms={forms}
          onCreate={openCreate}
          onEdit={openEdit}
          onToggle={handleToggle}
          onDelete={handleDelete}
          onRegenerate={handleRegenerate}
          disabled={!isAdmin}
        />
      ) : (
        <IntakeFormBuilder
          form={editingForm}
          types={types}
          typesEnabled={typesEnabled}
          properties={properties}
          labels={labels}
          submitting={submitting}
          regenerating={regenerating}
          values={builderState}
          onChange={setBuilderState}
          onCancel={() => {
            setMode("list");
            setEditingForm(null);
          }}
          onRegenerate={mode === "edit" ? handleBuilderRegenerate : undefined}
          onSave={handleSave}
        />
      )}
    </div>
  );
});
