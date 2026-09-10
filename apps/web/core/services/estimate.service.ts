/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

// types
import { API_BASE_URL } from "@plane/constants";
import type { IEstimate, IEstimateFormData, IEstimatePoint } from "@plane/types";
// helpers
// services
import { APIService } from "@/services/api.service";

export class EstimateService extends APIService {
  constructor() {
    super(API_BASE_URL);
  }

  async fetchWorkspaceEstimates(workspaceSlug: string): Promise<IEstimate[] | undefined> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/estimates/`);
    return data || undefined;
  }

  async fetchProjectEstimates(workspaceSlug: string, projectId: string): Promise<IEstimate[] | undefined> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/estimates/`);
    return data || undefined;
  }

  async fetchEstimateById(
    workspaceSlug: string,
    projectId: string,
    estimateId: string
  ): Promise<IEstimate | undefined> {
    const { data } = await this.get(`/api/workspaces/${workspaceSlug}/projects/${projectId}/estimates/${estimateId}/`);
    return data || undefined;
  }

  async createEstimate(
    workspaceSlug: string,
    projectId: string,
    payload: IEstimateFormData
  ): Promise<IEstimate | undefined> {
    const { data } = await this.post(`/api/workspaces/${workspaceSlug}/projects/${projectId}/estimates/`, payload);
    return data || undefined;
  }

  async deleteEstimate(workspaceSlug: string, projectId: string, estimateId: string): Promise<void> {
    await this.delete(`/api/workspaces/${workspaceSlug}/projects/${projectId}/estimates/${estimateId}/`);
  }

  async createEstimatePoint(
    workspaceSlug: string,
    projectId: string,
    estimateId: string,
    payload: Partial<IEstimatePoint>
  ): Promise<IEstimatePoint | undefined> {
    const { data } = await this.post(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/estimates/${estimateId}/estimate-points/`,
      payload
    );
    return data || undefined;
  }

  async updateEstimatePoint(
    workspaceSlug: string,
    projectId: string,
    estimateId: string,
    estimatePointId: string,
    payload: Partial<IEstimatePoint>
  ): Promise<IEstimatePoint | undefined> {
    const { data } = await this.patch(
      `/api/workspaces/${workspaceSlug}/projects/${projectId}/estimates/${estimateId}/estimate-points/${estimatePointId}/`,
      payload
    );
    return data || undefined;
  }
}
const estimateService = new EstimateService();

export default estimateService;
