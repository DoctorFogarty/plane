/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useCallback, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAutomation } from "@plane/types";
import { ToggleSwitch } from "@plane/ui";
import { useAutomation } from "@/hooks/store/use-automation";
import { GITHUB_TRIGGERS, PLANE_TRIGGERS, TRIGGER_LABELS } from "./constants";
import { AutomationFormModal } from "./form-modal";
import { AutomationRunHistoryModal } from "./run-history-modal";

type Props = {
  workspaceSlug: string;
  projectId: string;
};

export const CustomAutomationsList = observer(function CustomAutomationsList(props: Props) {
  const { workspaceSlug, projectId } = props;
  const { t } = useTranslation();
  const { getProjectAutomations, updateAutomation, deleteAutomation } = useAutomation();
  const automations = getProjectAutomations(projectId);

  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<IAutomation | null>(null);
  const [historyAutomation, setHistoryAutomation] = useState<IAutomation | null>(null);

  const handleFormClose = useCallback(() => {
    setFormOpen(false);
    setEditing(null);
  }, []);

  const handleHistoryClose = useCallback(() => {
    setHistoryAutomation(null);
  }, []);

  const handleToggle = async (automation: IAutomation, enabled: boolean) => {
    try {
      await updateAutomation(workspaceSlug, projectId, automation.id, { is_enabled: enabled });
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: enabled ? t("automations.toasts.enable.success.title") : t("automations.toasts.disable.success.title"),
        message: enabled
          ? t("automations.toasts.enable.success.message")
          : t("automations.toasts.disable.success.message"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: enabled ? t("automations.toasts.enable.error.title") : t("automations.toasts.disable.error.title"),
        message: enabled ? t("automations.toasts.enable.error.message") : t("automations.toasts.disable.error.message"),
      });
    }
  };

  const handleDelete = async (automation: IAutomation) => {
    if (automation.is_enabled) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("automations.delete_modal.heading"),
        message: t("automations.delete.validation.enabled"),
      });
      return;
    }
    try {
      await deleteAutomation(workspaceSlug, projectId, automation.id);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("automations.toasts.delete.success.title"),
        message: t("automations.toasts.delete.success.message", { name: automation.name }),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("automations.toasts.delete.error.title"),
        message: t("automations.toasts.delete.error.message"),
      });
    }
  };

  return (
    <div className="mt-8 space-y-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-medium">{t("automations.settings.title")}</h3>
          <p className="text-sm text-custom-text-300">
            Trigger–condition–action rules for work items and linked GitHub activity.
          </p>
        </div>
        <Button
          variant="primary"
          size="base"
          onClick={() => {
            setEditing(null);
            setFormOpen(true);
          }}
        >
          {t("automations.settings.create_automation")}
        </Button>
      </div>

      {automations.length === 0 ? (
        <div className="border-custom-border-200 text-sm text-custom-text-300 rounded border border-dashed p-6">
          <p className="text-custom-text-100 font-medium">{t("automations.empty_state.no_automations.title")}</p>
          <p className="mt-1">{t("automations.empty_state.no_automations.description")}</p>
          <p className="text-xs mt-3">
            Supported Plane triggers: {PLANE_TRIGGERS.map((x) => TRIGGER_LABELS[x]).join(", ")}. GitHub:{" "}
            {GITHUB_TRIGGERS.map((x) => TRIGGER_LABELS[x]).join(", ")}.
          </p>
        </div>
      ) : (
        <div className="divide-custom-border-100 border-custom-border-200 divide-y rounded border">
          {automations.map((automation) => (
            <div key={automation.id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <p className="truncate font-medium">{automation.name}</p>
                  <span className="bg-custom-background-80 text-xs text-custom-text-300 rounded px-1.5 py-0.5">
                    {TRIGGER_LABELS[automation.trigger_type] || automation.trigger_type}
                  </span>
                </div>
                {automation.description ? (
                  <p className="text-sm text-custom-text-300 mt-1 truncate">{automation.description}</p>
                ) : null}
                <p className="text-xs text-custom-text-350 mt-1">
                  {automation.actions_count ?? automation.actions?.length ?? 0} action(s)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <ToggleSwitch
                  value={automation.is_enabled}
                  onChange={(value) => void handleToggle(automation, value)}
                  size="sm"
                />
                <Button variant="secondary" size="sm" onClick={() => setHistoryAutomation(automation)}>
                  Activity
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => {
                    setEditing(automation);
                    setFormOpen(true);
                  }}
                >
                  Edit
                </Button>
                <Button variant="secondary" size="sm" onClick={() => void handleDelete(automation)}>
                  Delete
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}

      <AutomationFormModal
        isOpen={formOpen}
        onClose={handleFormClose}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        automation={editing}
      />
      <AutomationRunHistoryModal
        isOpen={Boolean(historyAutomation)}
        onClose={handleHistoryClose}
        workspaceSlug={workspaceSlug}
        projectId={projectId}
        automation={historyAutomation}
      />
    </div>
  );
});
