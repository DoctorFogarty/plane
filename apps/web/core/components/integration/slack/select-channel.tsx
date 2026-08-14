/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

/* eslint-disable unicorn/no-array-sort */
import { useEffect, useMemo, useState } from "react";
import { observer } from "mobx-react";
import { useParams } from "next/navigation";
import useSWR, { mutate } from "swr";
import { SLACK_CHANNEL_INFO } from "@plane/constants";
import { useTranslation } from "@plane/i18n";
import { Button } from "@plane/propel/button";
import { TOAST_TYPE, setToast } from "@plane/propel/toast";
import type { IWorkspaceIntegration } from "@plane/types";
import { Loader } from "@plane/ui";
import { useIssueType } from "@/hooks/store/use-issue-type";
import { useLabel } from "@/hooks/store/use-label";
import { useProject } from "@/hooks/store/use-project";
import { useProjectState } from "@/hooks/store/use-project-state";
import { SlackIntegrationService, type TSlackChannelSubscription } from "@/services/integrations/slack.service";
import {
  CHANNEL_EVENT_OPTIONS,
  DEFAULT_CHANNEL_EVENTS,
  SlackCustomPropertyList,
  SlackEventOptionList,
  SlackProjectMatchFilters,
  type TSlackFilterPayload,
} from "./notification-options";

type Props = {
  integration: IWorkspaceIntegration;
};

const slackService = new SlackIntegrationService();

function payloadFromSub(sub: TSlackChannelSubscription): TSlackFilterPayload {
  const payload = (sub.filter_payload || {}) as TSlackFilterPayload;
  return payload;
}

export const SelectChannel = observer(function SelectChannel({ integration: _integration }: Props) {
  const { workspaceSlug, projectId } = useParams();
  const { t } = useTranslation();
  const { getProjectById } = useProject();
  const { fetchProjectStates, getProjectStates } = useProjectState();
  const { fetchProjectLabels, getProjectLabels } = useLabel();
  const { fetchWorkItemTypesPropertiesAndOptions, getActiveProjectIssueTypes, getActiveProjectProperties } =
    useIssueType();
  const project = projectId ? getProjectById(projectId.toString()) : undefined;
  const isSecret = project?.network === 0;
  const [channelId, setChannelId] = useState("");
  const [publicAck, setPublicAck] = useState(false);
  const [events, setEvents] = useState<string[]>([...DEFAULT_CHANNEL_EVENTS]);
  const [customPropertyIds, setCustomPropertyIds] = useState<string[]>([]);
  const [filterPayload, setFilterPayload] = useState<TSlackFilterPayload>({});
  const [saving, setSaving] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editEvents, setEditEvents] = useState<string[]>([]);
  const [editCustomIds, setEditCustomIds] = useState<string[]>([]);
  const [editFilter, setEditFilter] = useState<TSlackFilterPayload>({});
  const [editSaving, setEditSaving] = useState(false);

  const slug = workspaceSlug?.toString();
  const pid = projectId?.toString();
  const listKey = slug && pid ? SLACK_CHANNEL_INFO(slug, pid) : null;

  const { data: subscriptions } = useSWR(listKey, () =>
    slug && pid ? slackService.listSubscriptions(slug, pid) : null
  );

  const {
    data: channelPayload,
    mutate: mutateChannels,
    isValidating: channelsLoading,
  } = useSWR(slug ? `SLACK_CHANNELS_${slug}` : null, () => (slug ? slackService.listChannels(slug) : null));

  useEffect(() => {
    if (!slug || !pid) return;
    void fetchProjectStates(slug, pid);
    void fetchProjectLabels(slug, pid);
    void fetchWorkItemTypesPropertiesAndOptions(slug, pid);
  }, [slug, pid, fetchProjectStates, fetchProjectLabels, fetchWorkItemTypesPropertiesAndOptions]);

  const channels = [...(channelPayload?.channels || [])].sort((a, b) =>
    (a.name || "").localeCompare(b.name || "", undefined, { sensitivity: "base" })
  );
  const isListedChannel = channels.some((ch) => ch.id === channelId);
  const states = pid ? getProjectStates(pid) : undefined;
  const labels = pid ? getProjectLabels(pid) : undefined;
  const types = pid ? getActiveProjectIssueTypes(pid) : [];
  const properties = pid ? getActiveProjectProperties(pid) : [];

  const eventLabels = useMemo(
    () => ({
      create: t("slack_event_create"),
      state: t("slack_event_state"),
      assignee: t("slack_event_assignee"),
      comment: t("slack_event_comment"),
      priority: t("slack_event_priority"),
      labels: t("slack_event_labels"),
      name: t("slack_event_name"),
      start_date: t("slack_event_start_date"),
      target_date: t("slack_event_target_date"),
      type: t("slack_event_type"),
    }),
    [t]
  );
  const matchLabels = useMemo(
    () => ({
      all_priorities: t("slack_filter_all_priorities"),
      all_states: t("slack_filter_all_states"),
      all_types: t("slack_filter_all_types"),
      all_labels: t("slack_filter_all_labels"),
      any_value: t("slack_filter_any_value"),
    }),
    [t]
  );

  const handleAdd = async () => {
    if (!slug || !pid || !channelId) return;
    setSaving(true);
    try {
      const selected = channels.find((ch) => ch.id === channelId);
      await slackService.createSubscription(slug, pid, {
        channel_id: channelId,
        channel_name: selected?.name || "",
        is_private_channel: Boolean(selected?.is_private),
        public_channel_ack: publicAck,
        events,
        custom_property_ids: customPropertyIds,
        filter_payload: filterPayload,
      });
      await mutate(listKey);
      setChannelId("");
      setEvents([...DEFAULT_CHANNEL_EVENTS]);
      setCustomPropertyIds([]);
      setFilterPayload({});
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("slack_integration.project_updates.project_updates_form.project_connection_success"),
        message: t("slack_integration.project_updates.description"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("slack_integration.project_updates.project_updates_form.failed_create_project_connection"),
        message: isSecret
          ? t("slack_integration.project_updates.secret_project_ack")
          : t("slack_integration.project_updates.try_again_channel"),
      });
    } finally {
      setSaving(false);
    }
  };

  const handlePause = async (sub: TSlackChannelSubscription) => {
    if (!slug || !pid) return;
    await slackService.updateSubscription(slug, pid, sub.id, {
      is_paused: !sub.is_paused,
    });
    await mutate(listKey);
  };

  const handleDelete = async (sub: TSlackChannelSubscription) => {
    if (!slug || !pid) return;
    try {
      await slackService.deleteSubscription(slug, pid, sub.id);
      await mutate(listKey);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("slack_integration.project_updates.project_updates_form.project_connection_deleted"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("slack_integration.project_updates.project_updates_form.failed_delete_project_connection"),
      });
    }
  };

  const startEdit = (sub: TSlackChannelSubscription) => {
    setEditingId(sub.id);
    setEditEvents(Array.isArray(sub.events) ? sub.events : [...DEFAULT_CHANNEL_EVENTS]);
    setEditCustomIds(sub.custom_property_ids || []);
    setEditFilter(payloadFromSub(sub));
  };

  const handleSaveEdit = async (sub: TSlackChannelSubscription) => {
    if (!slug || !pid) return;
    setEditSaving(true);
    try {
      await slackService.updateSubscription(slug, pid, sub.id, {
        events: editEvents,
        custom_property_ids: editCustomIds,
        filter_payload: editFilter,
      });
      await mutate(listKey);
      setEditingId(null);
      setToast({
        type: TOAST_TYPE.SUCCESS,
        title: t("slack_integration.project_updates.project_updates_form.project_connection_updated"),
      });
    } catch {
      setToast({
        type: TOAST_TYPE.ERROR,
        title: t("slack_integration.project_updates.project_updates_form.failed_upserting_project_connection"),
      });
    } finally {
      setEditSaving(false);
    }
  };

  if (!subscriptions) {
    return (
      <Loader>
        <Loader.Item height="32px" width="160px" />
      </Loader>
    );
  }

  return (
    <div className="flex w-full min-w-64 flex-col items-stretch gap-3">
      {subscriptions.length === 0 ? (
        <p className="text-13 text-secondary">{t("slack_integration.project_updates.project_updates_empty_state")}</p>
      ) : (
        <ul className="w-full space-y-3">
          {subscriptions.map((sub) => (
            <li key={sub.id} className="rounded border border-subtle p-3">
              <div className="flex items-center justify-between gap-2 text-13">
                <span className="text-primary">
                  #{sub.channel_name || sub.channel_id}
                  {sub.is_paused ? ` (${t("slack_integration.project_updates.paused")})` : ""}
                </span>
                <div className="flex items-center gap-2">
                  <button type="button" className="text-secondary hover:underline" onClick={() => startEdit(sub)}>
                    {t("slack_integration.project_updates.edit")}
                  </button>
                  <button
                    type="button"
                    className="text-secondary hover:underline"
                    onClick={() => void handlePause(sub)}
                  >
                    {sub.is_paused
                      ? t("slack_integration.project_updates.resume")
                      : t("slack_integration.project_updates.pause")}
                  </button>
                  <button
                    type="button"
                    className="text-danger-primary hover:underline"
                    onClick={() => void handleDelete(sub)}
                  >
                    {t("slack_integration.project_updates.remove")}
                  </button>
                </div>
              </div>
              {editingId === sub.id ? (
                <div className="mt-3 space-y-3">
                  <p className="text-11 text-secondary">{t("slack_integration.project_updates.notify_when")}</p>
                  <SlackEventOptionList
                    events={editEvents}
                    options={CHANNEL_EVENT_OPTIONS}
                    labels={eventLabels}
                    onChange={setEditEvents}
                    idPrefix={`slack-edit-${sub.id}`}
                  />
                  {properties.length > 0 ? (
                    <>
                      <p className="text-11 text-secondary">{t("slack_dm_custom_properties")}</p>
                      <SlackCustomPropertyList
                        properties={properties}
                        selectedIds={editCustomIds}
                        onChange={setEditCustomIds}
                        idPrefix={`slack-edit-custom-${sub.id}`}
                      />
                    </>
                  ) : null}
                  <p className="text-11 text-secondary">{t("slack_integration.project_updates.only_when")}</p>
                  <SlackProjectMatchFilters
                    filter={editFilter}
                    onChange={setEditFilter}
                    states={states}
                    labels={labels}
                    types={types}
                    properties={properties}
                    labelsMap={matchLabels}
                  />
                  <div className="flex justify-end gap-2">
                    <button
                      type="button"
                      className="text-13 text-secondary hover:underline"
                      onClick={() => setEditingId(null)}
                    >
                      {t("cancel")}
                    </button>
                    <Button variant="secondary" size="sm" onClick={() => void handleSaveEdit(sub)} loading={editSaving}>
                      {t("save")}
                    </Button>
                  </div>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      <div className="space-y-3 rounded border border-subtle p-3">
        <p className="text-13 font-medium text-primary">
          {t("slack_integration.project_updates.add_new_project_update")}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <select
            className="max-w-56 rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            value={isListedChannel ? channelId : ""}
            onChange={(e) => setChannelId(e.target.value)}
          >
            <option value="">
              {channelId && !isListedChannel
                ? t("slack_integration.project_updates.using_pasted_id")
                : t("slack_integration.project_updates.project_updates_form.channel_dropdown.placeholder")}
            </option>
            {channels.map((ch) => (
              <option key={ch.id} value={ch.id}>
                {ch.is_private ? "🔒 " : "#"}
                {ch.name}
              </option>
            ))}
          </select>
          <input
            className="w-40 rounded border border-subtle bg-surface-1 px-2 py-1 text-13"
            value={isListedChannel ? "" : channelId}
            onChange={(e) => setChannelId(e.target.value.trim())}
            placeholder={t("slack_integration.project_updates.paste_channel_id")}
          />
          <button
            type="button"
            className="text-13 text-secondary hover:underline"
            onClick={() => void mutateChannels()}
            disabled={channelsLoading}
          >
            {t("slack_integration.project_updates.refresh")}
          </button>
        </div>
        <p className="text-11 text-secondary">{t("slack_integration.project_updates.notify_when")}</p>
        <SlackEventOptionList
          events={events}
          options={CHANNEL_EVENT_OPTIONS}
          labels={eventLabels}
          onChange={setEvents}
          idPrefix="slack-add"
        />
        {properties.length > 0 ? (
          <>
            <p className="text-11 text-secondary">{t("slack_dm_custom_properties")}</p>
            <SlackCustomPropertyList
              properties={properties}
              selectedIds={customPropertyIds}
              onChange={setCustomPropertyIds}
              idPrefix="slack-add-custom"
            />
          </>
        ) : null}
        <p className="text-11 text-secondary">{t("slack_integration.project_updates.only_when")}</p>
        <SlackProjectMatchFilters
          filter={filterPayload}
          onChange={setFilterPayload}
          states={states}
          labels={labels}
          types={types}
          properties={properties}
          labelsMap={matchLabels}
        />
        {isSecret ? (
          <label className="flex items-center gap-1 text-11 text-secondary">
            <input type="checkbox" checked={publicAck} onChange={(e) => setPublicAck(e.target.checked)} />
            {t("slack_integration.project_updates.post_to_public_channel")}
          </label>
        ) : null}
        <div className="flex justify-end">
          <Button variant="secondary" size="sm" onClick={() => void handleAdd()} loading={saving} disabled={!channelId}>
            {t("slack_integration.project_updates.add_channel")}
          </Button>
        </div>
      </div>
      <p className="text-11 text-secondary">{t("slack_integration.project_updates.invite_bot_hint")}</p>
    </div>
  );
});
