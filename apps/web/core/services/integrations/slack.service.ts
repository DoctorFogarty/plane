/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import { APIService } from "@/services/api.service";

export type TSlackChannelSubscription = {
  id: string;
  channel_id: string;
  channel_name: string;
  is_private_channel: boolean;
  events: string[];
  filter_payload: Record<string, unknown>;
  custom_property_ids: string[];
  is_paused: boolean;
  public_channel_ack: boolean;
  project: string;
};

export type TSlackChannel = {
  id: string;
  name: string;
  is_private: boolean;
};

export class SlackIntegrationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async getConnection(workspaceSlug: string) {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/slack/connection/`).then((r) => r?.data);
  }

  async getUserConnection(workspaceSlug: string) {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/slack/me/`).then((r) => r?.data);
  }

  async unlinkUser(workspaceSlug: string) {
    return this.delete(`/api/workspaces/${workspaceSlug}/integrations/slack/me/`).then((r) => r?.data);
  }

  async listChannels(workspaceSlug: string): Promise<{ channels: TSlackChannel[] }> {
    return this.get(`/api/workspaces/${workspaceSlug}/integrations/slack/channels/`).then((r) => r?.data);
  }

  async listSubscriptions(workspaceSlug: string, projectId: string): Promise<TSlackChannelSubscription[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-subscriptions/`).then(
      (r) => r?.data
    );
  }

  async createSubscription(
    workspaceSlug: string,
    projectId: string,
    data: Partial<TSlackChannelSubscription> & { channel_id: string }
  ) {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-subscriptions/`, data).then(
      (r) => r?.data
    );
  }

  async updateSubscription(
    workspaceSlug: string,
    projectId: string,
    subscriptionId: string,
    data: Partial<TSlackChannelSubscription>
  ) {
    return this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-subscriptions/${subscriptionId}/`,
      data
    ).then((r) => r?.data);
  }

  async deleteSubscription(workspaceSlug: string, projectId: string, subscriptionId: string) {
    return this.delete(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/slack-channel-subscriptions/${subscriptionId}/`
    ).then((r) => r?.data);
  }
}
