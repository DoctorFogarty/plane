/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect, useRef, useState } from "react";
import { observer } from "mobx-react";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IAutomation, IAutomationAction, TAutomationTriggerType } from "@plane/types";
import { EModalPosition, EModalWidth, Input, ModalCore, TextArea } from "@plane/ui";
import { useAutomation } from "@/hooks/store/use-automation";
import { useProjectState } from "@/hooks/store/use-project-state";
import { ACTION_TYPES, GITHUB_TRIGGERS, PLANE_TRIGGERS, PRIORITY_OPTIONS, TRIGGER_LABELS } from "./constants";

type Props = {
  isOpen: boolean;
  onClose: () => void;
  workspaceSlug: string;
  projectId: string;
  automation?: IAutomation | null;
};

type FormState = {
  name: string;
  description: string;
  trigger_type: TAutomationTriggerType;
  is_enabled: boolean;
  action_type: IAutomationAction["action_type"];
  property: string;
  property_value: string;
  comment_html: string;
  slack_channel_id: string;
  slack_text: string;
};

const DEFAULT_FORM: FormState = {
  name: "",
  description: "",
  trigger_type: "work_item.state_changed",
  is_enabled: false,
  action_type: "change_property",
  property: "priority",
  property_value: "high",
  comment_html: "",
  slack_channel_id: "",
  slack_text: "{{name}}",
};

function formFromAutomation(automation: IAutomation): FormState {
  const action = automation.actions?.[0];
  return {
    name: automation.name,
    description: automation.description || "",
    trigger_type: automation.trigger_type,
    is_enabled: automation.is_enabled,
    action_type: action?.action_type || "change_property",
    property: String(action?.config?.property || "priority"),
    property_value: String(action?.config?.value ?? "high"),
    comment_html: String(action?.config?.comment_html || action?.config?.comment || ""),
    slack_channel_id: String(action?.config?.channel_id || ""),
    slack_text: String(action?.config?.text || "{{name}}"),
  };
}

export const AutomationFormModal = observer(function AutomationFormModal(props: Props) {
  const { isOpen, onClose, workspaceSlug, projectId, automation } = props;
  const { t } = useTranslation();
  const { createAutomation, updateAutomation, fetchAutomationById } = useAutomation();
  const { getProjectStates } = useProjectState();
  const projectStates = getProjectStates(projectId) || [];

  const [form, setForm] = useState<FormState>(DEFAULT_FORM);
  const [detail, setDetail] = useState<IAutomation | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const automationId = automation?.id;
  const onCloseRef = useRef(onClose);
  const automationRef = useRef(automation);
  const tRef = useRef(t);
  onCloseRef.current = onClose;
  automationRef.current = automation;
  tRef.current = t;

  useEffect(() => {
    if (!isOpen) return;

    let cancelled = false;

    const load = async () => {
      if (!automationId) {
        setDetail(null);
        setForm(DEFAULT_FORM);
        setLoadingDetail(false);
        return;
      }

      setLoadingDetail(true);
      try {
        const response = await fetchAutomationById(workspaceSlug, projectId, automationId);
        if (cancelled) return;
        setDetail(response);
        setForm(formFromAutomation(response));
      } catch {
        if (cancelled) return;
        // Fall back to list payload only if it already includes nested actions.

        const listAutomation = automationRef.current;
        if (listAutomation?.actions?.length) {
          setDetail(listAutomation);
          setForm(formFromAutomation(listAutomation));
        } else {
          setToast({
            type: TOAST_TYPE.ERROR,
            title: tRef.current("automations.toasts.update.error.title"),
            message: tRef.current("automations.toasts.update.error.message"),
          });
          onCloseRef.current();
        }
      } finally {
        if (!cancelled) setLoadingDetail(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [automationId, fetchAutomationById, isOpen, projectId, workspaceSlug]);

  const buildPayload = (): Partial<IAutomation> => {
    const actions: IAutomationAction[] =
      form.action_type === "add_comment"
        ? [
            {
              action_type: "add_comment",
              order: 0,
              config: { comment_html: form.comment_html || "<p></p>" },
            },
          ]
        : form.action_type === "post_slack_message"
          ? [
              {
                action_type: "post_slack_message",
                order: 0,
                config: { channel_id: form.slack_channel_id, text: form.slack_text || "{{name}}" },
              },
            ]
          : [
              {
                action_type: "change_property",
                order: 0,
                config: {
                  property: form.property,
                  change_type: "set",
                  value: form.property_value,
                },
              },
            ];

    const payload: Partial<IAutomation> = {
      name: form.name.trim(),
      description: form.description,
      trigger_type: form.trigger_type,
      trigger_config: detail?.trigger_config || {},
      is_enabled: form.is_enabled,
      actions,
    };

    // UI does not edit conditions — omit on update so nested API-configured rules survive.
    if (!automation) {
      payload.conditions = [];
    }

    return payload;
  };

  const handleSubmit = async () => {
    if (!form.name.trim()) {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("automations.create_modal.title.required_error"),
        message: "",
      });
      return;
    }
    if (form.action_type === "add_comment" && !form.comment_html.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Comment text is required." });
      return;
    }
    if (form.action_type === "post_slack_message" && !form.slack_channel_id.trim()) {
      setToast({ type: TOAST_TYPE.ERROR, title: "Error!", message: "Slack channel id is required." });
      return;
    }
    if (automation && loadingDetail) return;

    setSubmitting(true);
    try {
      const payload = buildPayload();
      if (automation) {
        await updateAutomation(workspaceSlug, projectId, automation.id, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("automations.toasts.update.success.title"),
          message: t("automations.toasts.update.success.message"),
        });
      } else {
        await createAutomation(workspaceSlug, projectId, payload);
        setToast({
          type: TOAST_TYPE.SUCCESS,
          title: t("automations.toasts.create.success.title"),
          message: t("automations.toasts.create.success.message"),
        });
      }
      onClose();
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: automation ? t("automations.toasts.update.error.title") : t("automations.toasts.create.error.title"),
        message: automation
          ? t("automations.toasts.update.error.message")
          : t("automations.toasts.create.error.message"),
      });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <ModalCore isOpen={isOpen} handleClose={onClose} position={EModalPosition.TOP} width={EModalWidth.XXL}>
      <div className="space-y-4 p-5">
        <h3 className="text-lg font-medium">
          {automation ? t("automations.create_modal.heading.update") : t("automations.create_modal.heading.create")}
        </h3>

        {loadingDetail ? (
          <p className="text-sm text-custom-text-300">Loading automation…</p>
        ) : (
          <>
            <div className="space-y-1">
              <label htmlFor="automation-form-name" className="text-sm font-medium">
                Name
              </label>
              <Input
                id="automation-form-name"
                value={form.name}
                onChange={(e) => setForm((prev) => ({ ...prev, name: e.target.value }))}
                placeholder={t("automations.create_modal.title.placeholder")}
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="automation-form-description" className="text-sm font-medium">
                Description
              </label>
              <TextArea
                id="automation-form-description"
                value={form.description}
                onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                placeholder={t("automations.create_modal.description.placeholder")}
                className="min-h-20"
              />
            </div>

            <div className="space-y-1">
              <label htmlFor="automation-form-trigger" className="text-sm font-medium">
                {t("automations.trigger.label")}
              </label>
              <select
                id="automation-form-trigger"
                className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-3 py-2"
                value={form.trigger_type}
                disabled={Boolean(automation)}
                onChange={(e) =>
                  setForm((prev) => ({ ...prev, trigger_type: e.target.value as TAutomationTriggerType }))
                }
              >
                <optgroup label={t("automations.trigger.section_plane_events")}>
                  {PLANE_TRIGGERS.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {TRIGGER_LABELS[trigger]}
                    </option>
                  ))}
                </optgroup>
                <optgroup label="GitHub events">
                  {GITHUB_TRIGGERS.map((trigger) => (
                    <option key={trigger} value={trigger}>
                      {TRIGGER_LABELS[trigger]}
                    </option>
                  ))}
                </optgroup>
              </select>
            </div>

            <div className="space-y-1">
              <label htmlFor="automation-form-action" className="text-sm font-medium">
                {t("automations.action.label")}
              </label>
              <select
                id="automation-form-action"
                className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-3 py-2"
                value={form.action_type}
                onChange={(e) =>
                  setForm((prev) => ({
                    ...prev,
                    action_type: e.target.value as IAutomationAction["action_type"],
                  }))
                }
              >
                {ACTION_TYPES.map((actionType) => (
                  <option key={actionType} value={actionType}>
                    {actionType === "post_slack_message"
                      ? "Post Slack message"
                      : t(
                          `automations.action.handler_name.${actionType === "add_comment" ? "add_comment" : "change_property"}`
                        )}
                  </option>
                ))}
              </select>
            </div>

            {form.action_type === "change_property" ? (
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label htmlFor="automation-form-property" className="text-sm font-medium">
                    Property
                  </label>
                  <select
                    id="automation-form-property"
                    className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-3 py-2"
                    value={form.property}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        property: e.target.value,
                        property_value: e.target.value === "state" ? String(projectStates[0]?.id || "") : "high",
                      }))
                    }
                  >
                    <option value="priority">Priority</option>
                    <option value="state">State</option>
                  </select>
                </div>
                <div className="space-y-1">
                  <label htmlFor="automation-form-value" className="text-sm font-medium">
                    Value
                  </label>
                  {form.property === "state" ? (
                    <select
                      id="automation-form-value"
                      className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-3 py-2"
                      value={form.property_value}
                      onChange={(e) => setForm((prev) => ({ ...prev, property_value: e.target.value }))}
                    >
                      {projectStates.map((state) => (
                        <option key={state.id} value={state.id}>
                          {state.name}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <select
                      id="automation-form-value"
                      className="border-custom-border-200 bg-custom-background-100 text-sm w-full rounded border px-3 py-2"
                      value={form.property_value}
                      onChange={(e) => setForm((prev) => ({ ...prev, property_value: e.target.value }))}
                    >
                      {PRIORITY_OPTIONS.map((priority) => (
                        <option key={priority} value={priority}>
                          {priority}
                        </option>
                      ))}
                    </select>
                  )}
                </div>
              </div>
            ) : form.action_type === "post_slack_message" ? (
              <div className="space-y-3">
                <div className="space-y-1">
                  <label htmlFor="automation-form-slack-channel" className="text-sm font-medium">
                    Slack channel id
                  </label>
                  <Input
                    id="automation-form-slack-channel"
                    value={form.slack_channel_id}
                    onChange={(e) => setForm((prev) => ({ ...prev, slack_channel_id: e.target.value }))}
                    placeholder="C0123456789"
                  />
                </div>
                <div className="space-y-1">
                  <label htmlFor="automation-form-slack-text" className="text-sm font-medium">
                    Message
                  </label>
                  <TextArea
                    id="automation-form-slack-text"
                    value={form.slack_text}
                    onChange={(e) => setForm((prev) => ({ ...prev, slack_text: e.target.value }))}
                    placeholder="{{name}} updated. Priority: {{priority}}"
                    className="min-h-24"
                  />
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                <label htmlFor="automation-form-comment" className="text-sm font-medium">
                  Comment
                </label>
                <TextArea
                  id="automation-form-comment"
                  value={form.comment_html}
                  onChange={(e) => setForm((prev) => ({ ...prev, comment_html: e.target.value }))}
                  placeholder="This item moved. Priority: {{priority}}"
                  className="min-h-24"
                />
              </div>
            )}

            <label className="text-sm flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.is_enabled}
                onChange={(e) => setForm((prev) => ({ ...prev, is_enabled: e.target.checked }))}
              />
              Enable after saving
            </label>
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button variant="secondary" size="lg" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="primary" size="lg" onClick={handleSubmit} loading={submitting} disabled={loadingDetail}>
            {automation
              ? t("automations.create_modal.submit_button.update")
              : t("automations.create_modal.submit_button.create")}
          </Button>
        </div>
      </div>
    </ModalCore>
  );
});
