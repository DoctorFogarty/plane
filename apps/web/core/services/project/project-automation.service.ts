/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { IAutomation, IAutomationRun } from "@plane/types";
import { APIService } from "@/services/api.service";

export class ProjectAutomationService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async list(workspaceSlug: string, projectId: string): Promise<IAutomation[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async retrieve(workspaceSlug: string, projectId: string, automationId: string): Promise<IAutomation> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${automationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async create(workspaceSlug: string, projectId: string, data: Partial<IAutomation>): Promise<IAutomation> {
    return this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async update(
    workspaceSlug: string,
    projectId: string,
    automationId: string,
    data: Partial<IAutomation>
  ): Promise<IAutomation> {
    return this.patch(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${automationId}/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async destroy(workspaceSlug: string, projectId: string, automationId: string): Promise<void> {
    return this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${automationId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }

  async listRuns(workspaceSlug: string, projectId: string, automationId: string): Promise<IAutomationRun[]> {
    return this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/automations/${automationId}/runs/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response?.data;
      });
  }
}
