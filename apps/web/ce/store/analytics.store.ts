/**
 * Copyright (c) 2023-present Plane Software, Inc. and contributors
 * SPDX-License-Identifier: AGPL-3.0-only
 * See the LICENSE file for details.
 */

import type { IBaseAnalyticsStore } from "@/store/analytics.store";
import { BaseAnalyticsStore } from "@/store/analytics.store";

export type IAnalyticsStore = IBaseAnalyticsStore;

export class AnalyticsStore extends BaseAnalyticsStore {}
