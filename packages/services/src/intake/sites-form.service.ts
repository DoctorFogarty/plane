/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TFileSignedURLResponse, TPublicIntakeFormSchema, TPublicIntakeFormSubmission } from "@plane/types";
import { APIService } from "../api.service";
import { FileUploadService } from "../file/file-upload.service";
import { generateFileUploadPayload, getFileMetaDataForUpload } from "../file/helper";

export class SitesIntakeFormService extends APIService {
  private fileUploadService: FileUploadService;

  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
    this.fileUploadService = new FileUploadService();
  }

  async retrieve(anchor: string): Promise<TPublicIntakeFormSchema> {
    return this.get(`/api/public/forms/${anchor}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async submit(anchor: string, data: TPublicIntakeFormSubmission): Promise<{ success: boolean }> {
    return this.post(`/api/public/forms/${anchor}/submissions/`, data)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }

  async uploadAttachment(anchor: string, file: File): Promise<TFileSignedURLResponse> {
    const fileMetaData = await getFileMetaDataForUpload(file);
    return this.post(`/api/public/forms/${anchor}/attachments/`, fileMetaData)
      .then(async (response) => {
        const signedURLResponse: TFileSignedURLResponse = response?.data;
        const fileUploadPayload = generateFileUploadPayload(signedURLResponse, file);
        await this.fileUploadService.uploadFile(signedURLResponse.upload_data.url, fileUploadPayload);
        await this.patch(`/api/public/forms/${anchor}/attachments/${signedURLResponse.asset_id}/`);
        return signedURLResponse;
      })
      .catch((error) => {
        throw error?.response;
      });
  }

  async deleteAttachment(anchor: string, assetId: string): Promise<void> {
    return this.delete(`/api/public/forms/${anchor}/attachments/${assetId}/`)
      .then((response) => response?.data)
      .catch((error) => {
        throw error?.response;
      });
  }
}
