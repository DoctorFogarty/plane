/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { useEffect } from "react";
import { observer } from "mobx-react";
import { Controller, useForm } from "react-hook-form";
// plane imports
import { useTranslation } from "@plane/i18n";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IUserEmailNotificationSettings } from "@plane/types";
import { Checkbox, ToggleSwitch } from "@plane/ui";
// components
import { SettingsControlItem } from "@/components/settings/control-item";
import {
  DEFAULT_DM_EVENTS,
  DM_EVENT_OPTIONS,
  PRIORITY_OPTIONS,
  SlackEventOptionList,
  toggleListValue,
} from "@/components/integration/slack/notification-options";
// services
import { UserService } from "@/services/user.service";

type Props = {
  data: IUserEmailNotificationSettings;
};

// services
const userService = new UserService();

export const NotificationsProfileSettingsForm = observer(function NotificationsProfileSettingsForm(props: Props) {
  const { data } = props;
  // translation
  const { t } = useTranslation();
  // form data
  const { control, reset, watch } = useForm<IUserEmailNotificationSettings>({
    defaultValues: {
      ...data,
      slack_dm_events: data.slack_dm_events?.length ? data.slack_dm_events : [...DEFAULT_DM_EVENTS],
      slack_dm_filter: data.slack_dm_filter || {},
      slack_dm_custom_properties: Boolean(data.slack_dm_custom_properties),
    },
  });

  const slackDmEnabled = Boolean(watch("slack_dm"));
  const slackDmEvents = watch("slack_dm_events") || [...DEFAULT_DM_EVENTS];
  const slackDmFilter = watch("slack_dm_filter") || {};
  const slackDmCustomProperties = Boolean(watch("slack_dm_custom_properties"));

  const handleSettingChange = async (payload: Partial<IUserEmailNotificationSettings>) => {
    try {
      await userService.updateCurrentUserEmailNotificationSettings(payload);
      setToast({
        title: t("success"),
        type: TOAST_TYPE.SUCCESS,
        message: t("email_notification_setting_updated_successfully"),
      });
    } catch (_error) {
      setToast({
        title: t("error"),
        type: TOAST_TYPE.ERROR,
        message: t("failed_to_update_email_notification_setting"),
      });
    }
  };

  useEffect(() => {
    reset({
      ...data,
      slack_dm_events: data.slack_dm_events?.length ? data.slack_dm_events : [...DEFAULT_DM_EVENTS],
      slack_dm_filter: data.slack_dm_filter || {},
      slack_dm_custom_properties: Boolean(data.slack_dm_custom_properties),
    });
  }, [reset, data]);

  const eventLabels: Record<string, string> = {
    create: t("slack_event_create"),
    state: t("slack_event_state"),
    assignee: t("slack_event_assignee"),
    comment: t("slack_event_comment"),
    mention: t("slack_event_mention"),
    priority: t("slack_event_priority"),
    labels: t("slack_event_labels"),
    name: t("slack_event_name"),
    start_date: t("slack_event_start_date"),
    target_date: t("slack_event_target_date"),
    type: t("slack_event_type"),
  };

  return (
    <div className="flex flex-col gap-y-1">
      <SettingsControlItem
        title={t("property_changes")}
        description={t("property_changes_description")}
        control={
          <Controller
            control={control}
            name="property_change"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  void handleSettingChange({ property_change: newValue });
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <SettingsControlItem
        title={t("state_change")}
        description={t("state_change_description")}
        control={
          <Controller
            control={control}
            name="state_change"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  void handleSettingChange({ state_change: newValue });
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <div className="border-l-3 border-subtle-1 pl-3">
        <SettingsControlItem
          title={t("issue_completed")}
          description={t("issue_completed_description")}
          control={
            <Controller
              control={control}
              name="issue_completed"
              render={({ field: { value, onChange } }) => (
                <ToggleSwitch
                  value={value}
                  onChange={(newValue) => {
                    onChange(newValue);
                    void handleSettingChange({ issue_completed: newValue });
                  }}
                  size="sm"
                />
              )}
            />
          }
        />
      </div>
      <SettingsControlItem
        title={t("comments")}
        description={t("comments_description")}
        control={
          <Controller
            control={control}
            name="comment"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  void handleSettingChange({ comment: newValue });
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <SettingsControlItem
        title={t("mentions")}
        description={t("mentions_description")}
        control={
          <Controller
            control={control}
            name="mention"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={value}
                onChange={(newValue) => {
                  onChange(newValue);
                  void handleSettingChange({ mention: newValue });
                }}
                size="sm"
              />
            )}
          />
        }
      />
      <SettingsControlItem
        title={t("slack_dms")}
        description={t("slack_dms_description")}
        control={
          <Controller
            control={control}
            name="slack_dm"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={Boolean(value)}
                onChange={(newValue) => {
                  onChange(newValue);
                  void handleSettingChange({ slack_dm: newValue });
                }}
                size="sm"
              />
            )}
          />
        }
      />
      {slackDmEnabled ? (
        <div className="space-y-3 border-l-3 border-subtle-1 pl-3">
          <div className="flex flex-col gap-2 py-3">
            <h4 className="text-body-sm-medium text-primary">{t("slack_dm_events")}</h4>
            <p className="text-caption-md-regular text-secondary">{t("slack_dm_events_description")}</p>
            <Controller
              control={control}
              name="slack_dm_events"
              render={({ field: { onChange } }) => (
                <SlackEventOptionList
                  events={slackDmEvents}
                  options={DM_EVENT_OPTIONS}
                  labels={eventLabels}
                  idPrefix="slack-dm"
                  onChange={(next) => {
                    onChange(next);
                    void handleSettingChange({ slack_dm_events: next });
                  }}
                />
              )}
            />
          </div>
          <SettingsControlItem
            title={t("slack_dm_custom_properties")}
            description={t("slack_dm_custom_properties_description")}
            control={
              <Controller
                control={control}
                name="slack_dm_custom_properties"
                render={({ field: { onChange } }) => (
                  <ToggleSwitch
                    value={slackDmCustomProperties}
                    onChange={(newValue) => {
                      onChange(newValue);
                      void handleSettingChange({ slack_dm_custom_properties: newValue });
                    }}
                    size="sm"
                  />
                )}
              />
            }
          />
          <div className="flex flex-col gap-2 py-3">
            <h4 className="text-body-sm-medium text-primary">{t("slack_dm_priority_filter")}</h4>
            <p className="text-caption-md-regular text-secondary">{t("slack_dm_priority_filter_description")}</p>
            <Controller
              control={control}
              name="slack_dm_filter"
              render={({ field: { onChange } }) => (
                <div className="flex flex-wrap gap-x-4 gap-y-2">
                  {PRIORITY_OPTIONS.map((priority) => (
                    <label key={priority} className="flex items-center gap-1.5 text-13 text-primary">
                      <Checkbox
                        checked={(slackDmFilter.priority || []).includes(priority)}
                        onChange={() => {
                          const nextPriority = toggleListValue(slackDmFilter.priority, priority);
                          const next = { ...slackDmFilter, priority: nextPriority };
                          onChange(next);
                          void handleSettingChange({ slack_dm_filter: next });
                        }}
                      />
                      {priority.charAt(0).toUpperCase() + priority.slice(1)}
                    </label>
                  ))}
                </div>
              )}
            />
          </div>
        </div>
      ) : null}
      <SettingsControlItem
        title={t("mute_email_when_slack_dm")}
        description={t("mute_email_when_slack_dm_description")}
        control={
          <Controller
            control={control}
            name="mute_email_when_slack_dm"
            render={({ field: { value, onChange } }) => (
              <ToggleSwitch
                value={Boolean(value)}
                onChange={(newValue) => {
                  onChange(newValue);
                  void handleSettingChange({ mute_email_when_slack_dm: newValue });
                }}
                size="sm"
              />
            )}
          />
        }
      />
    </div>
  );
});
