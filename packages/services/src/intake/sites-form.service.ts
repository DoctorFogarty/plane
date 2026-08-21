/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import { API_BASE_URL } from "@plane/constants";
import type { TPublicIntakeFormSchema, TPublicIntakeFormSubmission } from "@plane/types";
import { APIService } from "../api.service";

export class SitesIntakeFormService extends APIService {
  constructor(BASE_URL?: string) {
    super(BASE_URL || API_BASE_URL);
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
}
